const {
  BrowserWindow,
  dialog,
  ipcMain,
} = require('electron')
const path = require('node:path')

const CHANNELS = {
  PICK_VIDEO: 'auto-label:pick-video',
  PICK_MODEL: 'auto-label:pick-model',
  PICK_OUTPUT: 'auto-label:pick-output',
  PICK_PYTHON: 'auto-label:pick-python',
  GET_RUNTIME: 'auto-label:get-runtime',
  START: 'auto-label:start',
  CANCEL: 'auto-label:cancel',
  READ_IMAGE: 'auto-label:read-image',
  SAVE_LABEL: 'auto-label:save-label',
  EVENT: 'auto-label:event',
}

function getOwnerWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

function registerAutoLabelHandlers(jobManager) {
  ipcMain.handle(CHANNELS.GET_RUNTIME, () => jobManager.getRuntimeInfo())

  ipcMain.handle(CHANNELS.PICK_PYTHON, async (event) => {
    const result = await dialog.showOpenDialog(getOwnerWindow(event), {
      title: '选择 Conda 环境中的 python.exe',
      properties: ['openFile'],
      filters: [{ name: 'Python 解释器', extensions: ['exe'] }],
    })

    if (result.canceled) return { canceled: true }
    const runtime = await jobManager.configurePython(result.filePaths[0])
    return { canceled: false, ...runtime }
  })

  ipcMain.handle(CHANNELS.PICK_VIDEO, async (event) => {
    const result = await dialog.showOpenDialog(
      getOwnerWindow(event),
      {
        title: '选择视频',
        properties: ['openFile'],
        filters: [{
          name: '视频文件',
          extensions: [
            'mp4',
            'avi',
            'mov',
            'mkv',
            'wmv',
            'm4v',
          ],
        }],
      },
    )

    if (result.canceled) return { canceled: true }

    const filePath = result.filePaths[0]

    return {
      canceled: false,
      path: filePath,
      name: path.basename(filePath),
    }
  })

  ipcMain.handle(CHANNELS.PICK_MODEL, async (event) => {
    const result = await dialog.showOpenDialog(
      getOwnerWindow(event),
      {
        title: '选择 YOLO 模型',
        properties: ['openFile'],
        filters: [{
          name: 'Ultralytics YOLO 模型',
          extensions: ['pt'],
        }],
      },
    )

    if (result.canceled) return { canceled: true }

    const filePath = result.filePaths[0]

    return {
      canceled: false,
      path: filePath,
      name: path.basename(filePath),
    }
  })

  ipcMain.handle(CHANNELS.PICK_OUTPUT, async (event) => {
    const result = await dialog.showOpenDialog(
      getOwnerWindow(event),
      {
        title: '选择输出文件夹',
        properties: [
          'openDirectory',
          'createDirectory',
        ],
      },
    )

    if (result.canceled) return { canceled: true }

    return {
      canceled: false,
      path: result.filePaths[0],
    }
  })

  ipcMain.handle(
    CHANNELS.START,
    async (event, config) => {
      const sender = event.sender

      return jobManager.start(config, (payload) => {
        if (!sender.isDestroyed()) {
          sender.send(CHANNELS.EVENT, payload)
        }
      })
    },
  )

  ipcMain.handle(
    CHANNELS.CANCEL,
    async (_event, jobId) => ({
      canceled: jobManager.cancel(jobId),
    }),
  )

  ipcMain.handle(
    CHANNELS.READ_IMAGE,
    async (_event, { jobId, fileName }) =>
      jobManager.readImage(jobId, fileName),
  )

  ipcMain.handle(
    CHANNELS.SAVE_LABEL,
    async (_event, { jobId, fileName, content }) =>
      jobManager.saveLabel(jobId, fileName, content),
  )
}

module.exports = {
  registerAutoLabelHandlers,
}
