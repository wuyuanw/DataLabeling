const { app, BrowserWindow } = require('electron')
const {
  registerLabelFileHandlers,
} = require('./ipc/label-file.cjs')
const {
  registerAutoLabelHandlers,
} = require('./ipc/auto-label.cjs')
const {
  AutoLabelJobManager,
} = require('./services/auto-label-job.cjs')
const {
  createMainWindow,
} = require('./window.cjs')

const autoLabelJobManager = new AutoLabelJobManager()

registerLabelFileHandlers()
registerAutoLabelHandlers(autoLabelJobManager)

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  autoLabelJobManager.dispose()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})