const { app, BrowserWindow } = require('electron')
const path = require('node:path')

/** 创建应用主窗口，并根据运行环境加载开发服务或生产构建。 */
function createMainWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 980, 
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#090b10',
    title: 'SOP 数据工作台',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 本地 `npm start` 使用 --production 直接打开已有 dist，开发模式才连接 Vite。
  const shouldLoadBuild = app.isPackaged || process.argv.includes('--production')
  if (shouldLoadBuild) {
    window.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    window.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173')
  }
  return window
}

module.exports = { createMainWindow }
