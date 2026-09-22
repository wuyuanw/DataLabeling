import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ANNOTATION_CLASSES,
  DEFAULT_EXTRACTION_FORM,
  PROJECTS,
} from '../constants/annotation'
import { saveLabelFile } from '../services/labelFileService'
import { createLabelFileName, serializeYoloAnnotations } from '../utils/yolo'
import { useAutoLabelJob } from './useAutoLabelJob'

/** 标注工作台的页面状态和业务流程。 */
export function useAnnotationWorkspace() {
  const autoLabelJob = useAutoLabelJob()
  const project = ref(PROJECTS[0])
  const classes = ref(ANNOTATION_CLASSES.map((item) => ({ ...item })))
  const activeClass = ref(0)
  const imageUrl = ref('')
  const imageName = ref('')
  const currentQueueIndex = ref(-1)
  const queueFilter = ref('all')
  const autoLabel = ref(true)
  const form = reactive({ ...DEFAULT_EXTRACTION_FORM })
  const boxes = ref([])
  const saving = ref(false)
  const localImageObjectUrl = ref('')

  const videoName = computed(() => autoLabelJob.video.value?.name || '')
  const queueItems = computed(() => autoLabelJob.items.value)
  const currentQueueItem = computed(() => queueItems.value[currentQueueIndex.value] || null)
  const stats = computed(() => {
    const taskItems = queueItems.value
    return {
      images: taskItems.length || (imageUrl.value ? 1 : 0),
      labeled: taskItems.length
        ? taskItems.filter((item) => item.boxes?.length > 0).length
        : Number(boxes.value.length > 0),
      boxes: taskItems.length
        ? taskItems.reduce((sum, item) => sum + (item.boxes?.length || 0), 0)
        : boxes.value.length,
      videos: Number(Boolean(autoLabelJob.video.value)),
    }
  })
  const labeledClassCount = computed(
    () => new Set(boxes.value.map((box) => box.classIndex)).size,
  )

  function releaseLocalImage() {
    if (localImageObjectUrl.value) {
      URL.revokeObjectURL(localImageObjectUrl.value)
      localImageObjectUrl.value = ''
    }
  }

  function selectImage(file) {
    if (!file) return
    releaseLocalImage()
    localImageObjectUrl.value = URL.createObjectURL(file)
    imageUrl.value = localImageObjectUrl.value
    imageName.value = file.name
    currentQueueIndex.value = -1
    boxes.value = []
    nextTick(() => ElMessage.success('图片已加入标注区'))
  }

  function syncCurrentQueueItem() {
    const item = currentQueueItem.value
    if (!item) return
    item.boxes = boxes.value.map(({ id, ...box }) => ({ ...box }))
    item.boxCount = item.boxes.length
  }

  function addBox(box) {
    boxes.value.push(box)
    syncCurrentQueueItem()
  }

  function removeLastBox() {
    if (!boxes.value.length) {
      ElMessage.info('当前没有可删除的标注框')
      return
    }
    boxes.value.pop()
    syncCurrentQueueItem()
    ElMessage.success('已删除最后一个标注框')
  }

  async function openQueueItem(index) {
    const item = queueItems.value[index]
    if (!item) return

    releaseLocalImage()
    const loadedImage = await autoLabelJob.loadImage(index)
    if (!loadedImage) return

    currentQueueIndex.value = index
    imageUrl.value = loadedImage
    imageName.value = item.fileName
    boxes.value = (item.boxes || []).map((box, boxIndex) => ({
      ...box,
      id: `${index}-${boxIndex}-${Date.now()}`,
    }))
  }

  async function saveLabels() {
    if (!imageUrl.value) {
      ElMessage.warning('请先选择一张图片')
      return
    }
    if (saving.value) return

    const content = serializeYoloAnnotations(boxes.value)
    saving.value = true
    try {
      if (currentQueueItem.value) {
        const result = await autoLabelJob.saveLabel(currentQueueIndex.value, content)
        syncCurrentQueueItem()
        ElMessage.success(`标注已保存：${result.filePath}`)
      } else {
        const suggestedName = createLabelFileName(imageName.value)
        const result = await saveLabelFile({ content, suggestedName })
        if (!result.canceled) {
          const action = result.downloaded ? '下载' : '保存'
          ElMessage.success(`已${action} ${boxes.value.length} 个标注框：${result.filePath}`)
        }
      }
    } catch (error) {
      console.error('保存标注失败', error)
      ElMessage.error(error?.message || '保存标注失败，请重试')
    } finally {
      saving.value = false
    }
  }

  function extractFrames() {
    return autoLabelJob.start({
      interval: form.interval,
      maxFrames: form.maxFrames,
      confidence: form.confidence,
      imageSize: form.imageSize,
      device: form.device,
      autoLabel: autoLabel.value,
    })
  }

  function exportDataset() {
    ElMessage.info('训练集划分与导出功能将在下一阶段接入')
  }

  function refreshQueue() {
    ElMessage.success(`队列中共有 ${queueItems.value.length} 张图片`)
  }

  async function changePage(step) {
    if (!queueItems.value.length) {
      ElMessage.info('队列中暂无更多图片')
      return
    }

    const nextIndex = currentQueueIndex.value + step
    if (nextIndex < 0 || nextIndex >= queueItems.value.length) {
      ElMessage.info(step > 0 ? '已经是最后一张' : '已经是第一张')
      return
    }
    await openQueueItem(nextIndex)
  }

  function handleShortcut(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      saveLabels()
    }
  }

  // 模型类别是标签编号的唯一来源；颜色循环使用页面现有调色板。
  watch(
    () => autoLabelJob.modelClassNames.value,
    (names) => {
      if (!names.length) return
      const palette = ANNOTATION_CLASSES.map((item) => item.color)
      classes.value = names.map((name, index) => ({
        name,
        color: palette[index % palette.length],
      }))
      activeClass.value = 0
    },
  )

  // 第一张推理结果产生后立即展示，不必等待整个视频处理结束。
  watch(
    () => autoLabelJob.items.value.length,
    async (length) => {
      if (length === 1 && currentQueueIndex.value === -1) {
        await openQueueItem(0)
      }
    },
  )

  onMounted(() => window.addEventListener('keydown', handleShortcut))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleShortcut)
    releaseLocalImage()
  })

  return {
    projects: PROJECTS,
    classes,
    project,
    activeClass,
    videoName,
    imageUrl,
    imageName,
    currentQueueIndex,
    queueItems,
    queueFilter,
    autoLabel,
    form,
    boxes,
    saving,
    stats,
    labeledClassCount,
    autoLabelJob,
    selectImage,
    addBox,
    removeLastBox,
    openQueueItem,
    saveLabels,
    extractFrames,
    exportDataset,
    refreshQueue,
    changePage,
  }
}
