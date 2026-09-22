function requireDesktopApi() {
  if (!window.desktop?.startAutoLabelJob) {
    throw new Error('自动标注只能在 Electron 中运行')
  }

  return window.desktop
}

export const autoLabelService = {
  isAvailable() {
    return Boolean(window.desktop?.startAutoLabelJob)
  },

  pickVideo() {
    return requireDesktopApi().pickVideo()
  },

  pickModel() {
    return requireDesktopApi().pickYoloModel()
  },

  pickOutputDirectory() {
    return requireDesktopApi().pickOutputDirectory()
  },

  pickPython() {
    return requireDesktopApi().pickPython()
  },

  getRuntime() {
    return requireDesktopApi().getAutoLabelRuntime()
  },

  start(config) {
    return requireDesktopApi().startAutoLabelJob(config)
  },

  cancel(jobId) {
    return requireDesktopApi().cancelAutoLabelJob(jobId)
  },

  readImage(jobId, fileName) {
    return requireDesktopApi().readAutoLabelImage({
      jobId,
      fileName,
    })
  },

  saveLabel(jobId, fileName, content) {
    return requireDesktopApi().saveAutoLabel({
      jobId,
      fileName,
      content,
    })
  },

  subscribe(callback) {
    return requireDesktopApi().onAutoLabelEvent(callback)
  },
}
