const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const SAVE_LABEL_CHANNEL = 'save-yolo-label'
const MAX_LABEL_FILE_SIZE = 10 * 1024 * 1024

function sanitizeFileName(fileName) {
  const baseName = path.basename(String(fileName || 'labels.txt'))
  return baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'labels.txt'
}

/** 渲染进程只传文本和建议文件名，最终路径必须由系统对话框授权。 */
function registerLabelFileHandlers() {
  ipcMain.handle(SAVE_LABEL_CHANNEL, async (event, payload = {}) => {
    const content = typeof payload.content === 'string' ? payload.content : ''
    if (Buffer.byteLength(content, 'utf8') > MAX_LABEL_FILE_SIZE) {
      throw new Error('标注文件超过 10MB，已拒绝保存')
    }

    const safeName = sanitizeFileName(payload.suggestedName)
    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(ownerWindow, {
      title: '保存 YOLO 标注',
      defaultPath: path.join(app.getPath('documents'), safeName),
      filters: [{ name: 'YOLO 标注文件', extensions: ['txt'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })

    if (result.canceled || !result.filePath) return { canceled: true }
    await fs.writeFile(result.filePath, content, 'utf8')
    return { canceled: false, filePath: result.filePath }
  })
}

module.exports = { registerLabelFileHandlers }
