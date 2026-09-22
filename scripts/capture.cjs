const { app, BrowserWindow } = require('electron')
const path = require('node:path')

// 截图脚本使用独立目录，避免污染或依赖用户的 Electron 缓存。
app.setPath('userData', path.join(__dirname, '../.electron-preview-data'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      backgroundColor: '#090b10',
    })
    await win.loadFile(path.join(__dirname, '../dist/index.html'))
    await new Promise((resolve) => setTimeout(resolve, 800))
    const image = await win.webContents.capturePage()
    require('node:fs').writeFileSync(path.join(__dirname, '../ui-preview.png'), image.toPNG())
  } catch (error) {
    console.error('生成界面预览失败：', error)
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
