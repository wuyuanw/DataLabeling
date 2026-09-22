/** 浏览器环境的兼容保存方式。Electron 环境优先使用系统保存对话框。 */
function downloadTextFile(content, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** 屏蔽 Electron IPC 与普通浏览器下载之间的平台差异。 */
export async function saveLabelFile({ content, suggestedName }) {
  if (window.desktop?.saveYoloLabel) {
    return window.desktop.saveYoloLabel({ content, suggestedName })
  }

  downloadTextFile(content, suggestedName)
  return { canceled: false, filePath: suggestedName, downloaded: true }
}
