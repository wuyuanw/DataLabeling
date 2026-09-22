import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { autoLabelService } from '../services/autoLabelService'

/** 管理自动标注任务的文件选择、运行状态、进度与输出项。 */
export function useAutoLabelJob() {
  const runtime = ref({ configured: false, ready: false })
  const runtimeChecking = ref(false)
  const video = ref(null)
  const model = ref(null)
  const output = ref(null)
  const jobId = ref('')
  const status = ref('idle')
  const phase = ref('')
  const message = ref('')
  const current = ref(0)
  const total = ref(0)
  const outputDirectory = ref('')
  const items = ref([])
  const modelClassNames = ref([])
  const error = ref('')
  let unsubscribe = null

  const progress = computed(() => {
    if (!total.value) return 0
    return Math.min(100, Math.round((current.value / total.value) * 100))
  })
  const canStart = computed(() => Boolean(
    runtime.value.ready &&
    video.value?.path &&
    model.value?.path &&
    output.value?.path &&
    status.value !== 'running',
  ))

  async function checkRuntime() {
    if (!autoLabelService.isAvailable()) {
      runtime.value = { configured: false, ready: false, error: '请在 Electron 中运行' }
      return
    }

    runtimeChecking.value = true
    try {
      runtime.value = await autoLabelService.getRuntime()
    } catch (runtimeError) {
      runtime.value = { configured: false, ready: false, error: runtimeError.message }
    } finally {
      runtimeChecking.value = false
    }
  }

  async function pickPython() {
    try {
      const result = await autoLabelService.pickPython()
      if (!result.canceled) {
        runtime.value = result
        if (result.ready) ElMessage.success('Conda Python 环境检查通过')
        else ElMessage.error(result.error || 'Python 环境缺少推理依赖')
      }
    } catch (pickError) {
      ElMessage.error(pickError.message)
    }
  }

  async function pickVideo() {
    const result = await autoLabelService.pickVideo()
    if (!result.canceled) video.value = result
  }

  async function pickModel() {
    const result = await autoLabelService.pickModel()
    if (!result.canceled) model.value = result
  }

  async function pickOutputDirectory() {
    const result = await autoLabelService.pickOutputDirectory()
    if (!result.canceled) output.value = result
  }

  async function start(params) {
    if (!canStart.value) {
      ElMessage.warning('请先配置 Python，并选择视频、YOLO 模型和输出目录')
      return
    }

    items.value = []
    modelClassNames.value = []
    current.value = 0
    total.value = 0
    error.value = ''
    status.value = 'running'
    phase.value = 'checking'
    message.value = '正在检查任务参数'

    try {
      const result = await autoLabelService.start({
        videoPath: video.value.path,
        modelPath: model.value.path,
        outputRoot: output.value.path,
        interval: params.interval,
        maxFrames: params.maxFrames,
        confidence: params.confidence,
        imageSize: params.imageSize ?? 640,
        device: params.device ?? 'auto',
        autoLabel: params.autoLabel,
      })
      jobId.value = result.jobId
    } catch (startError) {
      status.value = 'failed'
      error.value = startError.message
      ElMessage.error(startError.message)
    }
  }

  async function cancel() {
    if (jobId.value) await autoLabelService.cancel(jobId.value)
  }

  async function loadImage(index) {
    const item = items.value[index]
    if (!item || !jobId.value) return null
    return autoLabelService.readImage(jobId.value, item.fileName)
  }

  async function saveLabel(index, content) {
    const item = items.value[index]
    if (!item || !jobId.value) throw new Error('当前图片不属于自动标注任务')
    return autoLabelService.saveLabel(jobId.value, item.labelFileName, content)
  }

  function handleEvent(event) {
    if (jobId.value && event.jobId !== jobId.value) return

    if (event.type === 'started') {
      outputDirectory.value = event.outputDir
    } else if (event.type === 'model_info') {
      modelClassNames.value = event.classNames
    } else if (event.type === 'phase') {
      phase.value = event.phase
      message.value = event.message
    } else if (event.type === 'progress') {
      phase.value = event.phase
      current.value = event.current
      total.value = event.total
    } else if (event.type === 'item') {
      phase.value = event.phase
      current.value = event.current
      total.value = event.total
      items.value.push(event)
    } else if (event.type === 'done') {
      status.value = 'completed'
      outputDirectory.value = event.outputDir
      ElMessage.success(`处理完成，共 ${event.imageCount} 张图片、${event.boxCount} 个标注框`)
    } else if (event.type === 'cancelled') {
      status.value = 'cancelled'
      ElMessage.info('任务已取消')
    } else if (event.type === 'error') {
      status.value = 'failed'
      error.value = event.message
      ElMessage.error(event.message)
    }
  }

  onMounted(() => {
    if (!autoLabelService.isAvailable()) return
    unsubscribe = autoLabelService.subscribe(handleEvent)
    checkRuntime()
  })
  onBeforeUnmount(() => unsubscribe?.())

  return {
    runtime,
    runtimeChecking,
    video,
    model,
    output,
    jobId,
    status,
    phase,
    message,
    current,
    total,
    progress,
    outputDirectory,
    items,
    modelClassNames,
    error,
    canStart,
    checkRuntime,
    pickPython,
    pickVideo,
    pickModel,
    pickOutputDirectory,
    start,
    cancel,
    loadImage,
    saveLabel,
  }
}
