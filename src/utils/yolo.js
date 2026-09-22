const PERCENT_BASE = 100

/**
 * 将页面使用的左上角百分比矩形转换成 YOLO 的归一化中心点格式。
 * 输出行格式：class_id center_x center_y width height
 */
export function serializeYoloAnnotations(boxes) {
  if (!boxes.length) return ''

  const lines = boxes.map((box) => {
    const centerX = (box.x + box.w / 2) / PERCENT_BASE
    const centerY = (box.y + box.h / 2) / PERCENT_BASE
    const width = box.w / PERCENT_BASE
    const height = box.h / PERCENT_BASE

    const coordinates = [centerX, centerY, width, height]
      .map((value) => value.toFixed(6))
      .join(' ')

    return `${box.classIndex} ${coordinates}`
  })

  // YOLO 文本通常以换行结束，便于其他命令行工具继续追加或拼接。
  return `${lines.join('\n')}\n`
}

export function createLabelFileName(imageName) {
  const baseName = imageName.replace(/\.[^.]+$/, '') || 'labels'
  return `${baseName}.txt`
}
