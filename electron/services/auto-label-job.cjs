const { app } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const EVENT_PREFIX = 'SOP_EVENT:'
const MAX_LABEL_FILE_SIZE = 10 * 1024 * 1024
const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.m4v'])
const MODEL_EXTENSIONS = new Set(['.pt'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

function runtimeConfigPaths() {
  return [
    path.join(app.getPath('userData'), 'runtime-config.json'),
    path.join(__dirname, '../../runtime-config.json'),
  ]
}

function readRuntimeConfig() {
  const configPath = runtimeConfigPaths().find((candidate) => fs.existsSync(candidate))
  if (!configPath) return null

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new Error(`运行时配置格式错误：${error.message}`)
  }
}

function getConfiguredPythonPath() {
  const configuredPath = process.env.SOP_YOLO_PYTHON || readRuntimeConfig()?.pythonPath
  if (!configuredPath) {
    throw new Error('尚未配置 Conda Python，请先点击“选择 Python”')
  }
  return path.resolve(configuredPath)
}

function getWorkerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'worker', 'auto_label.py')
    : path.join(__dirname, '../../worker/auto_label.py')
}

async function assertReadableFile(filePath, extensions, label) {
  const resolvedPath = path.resolve(String(filePath || ''))
  const extension = path.extname(resolvedPath).toLowerCase()
  if (!extensions.has(extension)) throw new Error(`${label}文件格式不支持：${extension}`)

  const stat = await fsp.stat(resolvedPath)
  if (!stat.isFile()) throw new Error(`${label}不是有效文件`)
  return resolvedPath
}

async function assertWritableDirectory(directoryPath) {
  const resolvedPath = path.resolve(String(directoryPath || ''))
  const stat = await fsp.stat(resolvedPath)
  if (!stat.isDirectory()) throw new Error('输出路径不是文件夹')
  await fsp.access(resolvedPath, fs.constants.W_OK)
  return resolvedPath
}

function validateNumber(value, name, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} 必须在 ${min} 到 ${max} 之间`)
  }
  return number
}

function inspectPython(pythonPath) {
  const inspectScript = [
    'import json, sys',
    'data = {"pythonVersion": sys.version.split()[0], "pythonPath": sys.executable}',
    'try:',
    ' import torch, cv2, ultralytics',
    ' data.update({"ready": True, "torchVersion": torch.__version__, "opencvVersion": cv2.__version__, "ultralyticsVersion": ultralytics.__version__, "cudaAvailable": torch.cuda.is_available(), "deviceName": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"})',
    'except Exception as error:',
    ' data.update({"ready": False, "error": str(error)})',
    'print(json.dumps(data, ensure_ascii=False))',
  ].join('\n')

  return new Promise((resolve) => {
    const child = spawn(pythonPath, ['-c', inspectScript], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish({ configured: true, ready: false, pythonPath, error: 'Python 环境检查超时' })
    }, 30000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => finish({ configured: true, ready: false, pythonPath, error: error.message }))
    child.on('close', () => {
      try {
        const result = JSON.parse(stdout.trim().split(/\r?\n/).pop())
        finish({ configured: true, ...result })
      } catch {
        finish({
          configured: true,
          ready: false,
          pythonPath,
          error: stderr.trim() || stdout.trim() || '无法读取 Python 环境信息',
        })
      }
    })
  })
}

class AutoLabelJobManager {
  constructor() {
    this.jobs = new Map()
  }

  async configurePython(pythonPath) {
    const resolvedPath = path.resolve(String(pythonPath || ''))
    const stat = await fsp.stat(resolvedPath)
    if (!stat.isFile() || path.basename(resolvedPath).toLowerCase() !== 'python.exe') {
      throw new Error('请选择 Conda 环境目录中的 python.exe')
    }

    const configPath = runtimeConfigPaths()[0]
    await fsp.mkdir(path.dirname(configPath), { recursive: true })
    await fsp.writeFile(configPath, JSON.stringify({ pythonPath: resolvedPath }, null, 2), 'utf8')
    return this.getRuntimeInfo()
  }

  async getRuntimeInfo() {
    let pythonPath
    try {
      pythonPath = getConfiguredPythonPath()
      await fsp.access(pythonPath, fs.constants.F_OK)
    } catch (error) {
      return { configured: false, ready: false, error: error.message }
    }
    return inspectPython(pythonPath)
  }

  hasRunningJob() {
    return [...this.jobs.values()].some((job) => job.status === 'running')
  }

  async start(config, sendEvent) {
    if (this.hasRunningJob()) throw new Error('当前已有抽帧任务正在运行')

    const runtime = await this.getRuntimeInfo()
    if (!runtime.ready) {
      throw new Error(`Conda 环境不可用：${runtime.error || '缺少推理依赖'}`)
    }

    const videoPath = await assertReadableFile(config.videoPath, VIDEO_EXTENSIONS, '视频')
    const modelPath = await assertReadableFile(config.modelPath, MODEL_EXTENSIONS, '模型')
    const outputRoot = await assertWritableDirectory(config.outputRoot)
    const workerPath = getWorkerPath()
    await fsp.access(workerPath, fs.constants.R_OK)

    const jobId = crypto.randomUUID()
    const request = {
      jobId,
      videoPath,
      modelPath,
      outputRoot,
      interval: validateNumber(config.interval, '抽帧间隔', 1, 100000),
      maxFrames: validateNumber(config.maxFrames, '最大抽帧数', 1, 10000),
      confidence: validateNumber(config.confidence, '置信度', 0, 1),
      imageSize: validateNumber(config.imageSize ?? 640, '推理尺寸', 320, 2048),
      device: config.device ?? 'auto',
      autoLabel: config.autoLabel !== false,
    }

    const child = spawn(runtime.pythonPath, [workerPath], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const job = {
      id: jobId,
      child,
      status: 'running',
      outputDir: null,
      stderr: '',
      sendEvent,
    }
    this.jobs.set(jobId, job)

    let stdoutBuffer = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith(EVENT_PREFIX)) continue
        try {
          const workerEvent = JSON.parse(line.slice(EVENT_PREFIX.length))
          if (workerEvent.outputDir) job.outputDir = workerEvent.outputDir
          if (workerEvent.type === 'done') job.status = 'completed'
          if (workerEvent.type === 'error') job.status = 'failed'
          sendEvent({ jobId, ...workerEvent })
        } catch (error) {
          console.error('解析 Python 事件失败：', error)
        }
      }
    })
    child.stderr.on('data', (chunk) => {
      job.stderr = `${job.stderr}${chunk}`.slice(-12000)
    })
    child.on('error', (error) => {
      job.status = 'failed'
      sendEvent({ jobId, type: 'error', message: `无法启动 Python：${error.message}` })
    })
    child.on('close', (exitCode, signal) => {
      if (job.status === 'cancelled') {
        sendEvent({ jobId, type: 'cancelled' })
      } else if (job.status !== 'completed' && job.status !== 'failed') {
        job.status = 'failed'
        sendEvent({
          jobId,
          type: 'error',
          message: job.stderr || `Python 异常退出，退出码：${exitCode}，信号：${signal}`,
        })
      }
    })
    child.stdin.end(JSON.stringify(request))
    return { jobId, status: 'running' }
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'running') return false
    job.status = 'cancelled'
    job.child.kill()
    return true
  }

  getJobOutputFile(jobId, subdirectory, fileName, extensions) {
    const job = this.jobs.get(jobId)
    if (!job?.outputDir) throw new Error('任务输出目录尚未创建')

    const safeFileName = path.basename(String(fileName || ''))
    if (!safeFileName || safeFileName !== fileName) throw new Error('文件名不合法')
    if (!extensions.has(path.extname(safeFileName).toLowerCase())) throw new Error('文件格式不支持')
    return path.join(job.outputDir, subdirectory, safeFileName)
  }

  async readImage(jobId, fileName) {
    const imagePath = this.getJobOutputFile(jobId, 'images', fileName, IMAGE_EXTENSIONS)
    const extension = path.extname(imagePath).toLowerCase()
    const content = await fsp.readFile(imagePath)
    const mime = extension === '.png' ? 'image/png' : 'image/jpeg'
    return `data:${mime};base64,${content.toString('base64')}`
  }

  async saveLabel(jobId, fileName, content) {
    const text = typeof content === 'string' ? content : ''
    if (Buffer.byteLength(text, 'utf8') > MAX_LABEL_FILE_SIZE) throw new Error('标注文件超过 10MB')

    const labelPath = this.getJobOutputFile(jobId, 'labels', fileName, new Set(['.txt']))
    await fsp.writeFile(labelPath, text, 'utf8')
    return { filePath: labelPath }
  }

  dispose() {
    for (const job of this.jobs.values()) {
      if (job.status === 'running') {
        job.status = 'cancelled'
        job.child.kill()
      }
    }
  }
}

module.exports = { AutoLabelJobManager }
