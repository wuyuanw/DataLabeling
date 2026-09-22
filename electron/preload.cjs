const { contextBridge, ipcRenderer } = require('electron')

const CHANNELS = {
  SAVE_LABEL: 'save-yolo-label',
  PICK_VIDEO: 'auto-label:pick-video',
  PICK_MODEL: 'auto-label:pick-model',
  PICK_OUTPUT: 'auto-label:pick-output',
  PICK_PYTHON: 'auto-label:pick-python',
  GET_RUNTIME: 'auto-label:get-runtime',
  START: 'auto-label:start',
  CANCEL: 'auto-label:cancel',
  READ_IMAGE: 'auto-label:read-image',
  SAVE_JOB_LABEL: 'auto-label:save-label',
  EVENT: 'auto-label:event',
}

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  isElectron: true,

  saveYoloLabel: (payload) =>
    ipcRenderer.invoke(CHANNELS.SAVE_LABEL, payload),

  pickVideo: () =>
    ipcRenderer.invoke(CHANNELS.PICK_VIDEO),

  pickYoloModel: () =>
    ipcRenderer.invoke(CHANNELS.PICK_MODEL),

  pickOutputDirectory: () =>
    ipcRenderer.invoke(CHANNELS.PICK_OUTPUT),

  pickPython: () =>
    ipcRenderer.invoke(CHANNELS.PICK_PYTHON),

  getAutoLabelRuntime: () =>
    ipcRenderer.invoke(CHANNELS.GET_RUNTIME),

  startAutoLabelJob: (config) =>
    ipcRenderer.invoke(CHANNELS.START, config),

  cancelAutoLabelJob: (jobId) =>
    ipcRenderer.invoke(CHANNELS.CANCEL, jobId),

  readAutoLabelImage: (payload) =>
    ipcRenderer.invoke(CHANNELS.READ_IMAGE, payload),

  saveAutoLabel: (payload) =>
    ipcRenderer.invoke(CHANNELS.SAVE_JOB_LABEL, payload),

  onAutoLabelEvent: (callback) => {
    const listener = (_event, payload) => {
      callback(payload)
    }

    ipcRenderer.on(CHANNELS.EVENT, listener)

    return () => {
      ipcRenderer.removeListener(
        CHANNELS.EVENT,
        listener,
      )
    }
  },
})
