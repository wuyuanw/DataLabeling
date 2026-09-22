import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ANNOTATION_CLASSES, DEFAULT_EXTRACTION_FORM, PROJECTS, REVIEW_STATUS } from '../constants/annotation'
import { saveLabelFile } from '../services/labelFileService'
import { createLabelFileName, serializeYoloAnnotations } from '../utils/yolo'
import { useAutoLabelJob } from './useAutoLabelJob'

const HISTORY_LIMIT = 100
const cloneBoxes = (value) => value.map((box) => ({ ...box }))

/** 标注工作台的页面状态、编辑历史、保存与审核流程。 */
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
  const selectedBoxId = ref(null)
  const undoStack = ref([])
  const redoStack = ref([])
  const saving = ref(false)
  const localImageObjectUrl = ref('')
  const standaloneDirty = ref(false)
  const standaloneSavedAt = ref(null)

  const videoName = computed(() => autoLabelJob.video.value?.name || '')
  const queueItems = computed(() => autoLabelJob.items.value)
  const currentQueueItem = computed(() => queueItems.value[currentQueueIndex.value] || null)
  const selectedBox = computed(() => boxes.value.find((box) => box.id === selectedBoxId.value) || null)
  const isDirty = computed(() => currentQueueItem.value?.dirty ?? standaloneDirty.value)
  const currentReviewStatus = computed(() => currentQueueItem.value?.reviewStatus || REVIEW_STATUS.PENDING)
  const currentSavedAt = computed(() => currentQueueItem.value?.savedAt || standaloneSavedAt.value)
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  const stats = computed(() => {
    const items = queueItems.value
    return {
      images: items.length || (imageUrl.value ? 1 : 0),
      labeled: items.length ? items.filter((item) => item.boxes?.length > 0).length : Number(boxes.value.length > 0),
      boxes: items.length ? items.reduce((sum, item) => sum + (item.boxes?.length || 0), 0) : boxes.value.length,
      videos: Number(Boolean(autoLabelJob.video.value)),
    }
  })
  const labeledClassCount = computed(() => new Set(boxes.value.map((box) => box.classIndex)).size)

  function releaseLocalImage() {
    if (!localImageObjectUrl.value) return
    URL.revokeObjectURL(localImageObjectUrl.value)
    localImageObjectUrl.value = ''
  }

  function resetEditingState() {
    selectedBoxId.value = null
    undoStack.value = []
    redoStack.value = []
  }

  async function selectImage(file) {
    if (!file || !(await saveCurrentIfDirty())) return
    releaseLocalImage()
    localImageObjectUrl.value = URL.createObjectURL(file)
    imageUrl.value = localImageObjectUrl.value
    imageName.value = file.name
    currentQueueIndex.value = -1
    boxes.value = []
    standaloneDirty.value = false
    standaloneSavedAt.value = null
    resetEditingState()
    nextTick(() => ElMessage.success('图片已加入标注区'))
  }

  function syncCurrentQueueItem() {
    const item = currentQueueItem.value
    if (!item) return
    item.boxes = cloneBoxes(boxes.value)
    item.boxCount = item.boxes.length
  }

  function markCurrentDirty() {
    const item = currentQueueItem.value
    if (item) {
      item.dirty = true
      item.reviewStatus = REVIEW_STATUS.MODIFIED
    } else {
      standaloneDirty.value = true
    }
  }

  function commitBoxes(nextBoxes) {
    undoStack.value.push(cloneBoxes(boxes.value))
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
    redoStack.value = []
    boxes.value = cloneBoxes(nextBoxes)
    syncCurrentQueueItem()
    markCurrentDirty()
  }

  function addBox(box) {
    commitBoxes([...boxes.value, { ...box, source: 'manual' }])
  }

  function selectBox(id) {
    selectedBoxId.value = id || null
  }

  function updateBox(id, changes) {
    if (!boxes.value.some((box) => box.id === id)) return
    commitBoxes(boxes.value.map((box) => box.id === id
      ? { ...box, ...changes, source: box.source === 'model' ? 'edited' : box.source }
      : box))
  }

  function removeSelectedBox() {
    if (!selectedBox.value) {
      ElMessage.info('请先选择一个标注框')
      return
    }
    commitBoxes(boxes.value.filter((box) => box.id !== selectedBoxId.value))
    selectedBoxId.value = null
    ElMessage.success('已删除选中的标注框')
  }

  function undo() {
    if (!canUndo.value) return
    redoStack.value.push(cloneBoxes(boxes.value))
    boxes.value = undoStack.value.pop()
    selectedBoxId.value = null
    syncCurrentQueueItem()
    markCurrentDirty()
  }

  function redo() {
    if (!canRedo.value) return
    undoStack.value.push(cloneBoxes(boxes.value))
    boxes.value = redoStack.value.pop()
    selectedBoxId.value = null
    syncCurrentQueueItem()
    markCurrentDirty()
  }

  function changeActiveClass(classIndex) {
    activeClass.value = classIndex
    if (selectedBox.value && selectedBox.value.classIndex !== classIndex) {
      updateBox(selectedBox.value.id, { classIndex })
    }
  }

  async function openQueueItem(index) {
    const item = queueItems.value[index]
    if (!item || index === currentQueueIndex.value || !(await saveCurrentIfDirty())) return
    releaseLocalImage()
    const loadedImage = await autoLabelJob.loadImage(index)
    if (!loadedImage) return
    currentQueueIndex.value = index
    imageUrl.value = loadedImage
    imageName.value = item.fileName
    boxes.value = cloneBoxes(item.boxes || [])
    standaloneDirty.value = false
    resetEditingState()
  }

  async function saveLabels({ silent = false } = {}) {
    if (!imageUrl.value) {
      if (!silent) ElMessage.warning('请先选择一张图片')
      return false
    }
    if (saving.value) return false
    saving.value = true
    try {
      const content = serializeYoloAnnotations(boxes.value)
      if (currentQueueItem.value) {
        const result = await autoLabelJob.saveLabel(currentQueueIndex.value, content)
        syncCurrentQueueItem()
        currentQueueItem.value.dirty = false
        currentQueueItem.value.savedAt = new Date().toISOString()
        if (!silent) ElMessage.success('标注已保存：' + result.filePath)
      } else {
        const result = await saveLabelFile({ content, suggestedName: createLabelFileName(imageName.value) })
        if (result.canceled) return false
        standaloneDirty.value = false
        standaloneSavedAt.value = new Date().toISOString()
        if (!silent) ElMessage.success('标注已保存：' + result.filePath)
      }
      return true
    } catch (error) {
      console.error('保存标注失败', error)
      ElMessage.error(error?.message || '保存标注失败，请重试')
      return false
    } finally {
      saving.value = false
    }
  }

  async function saveCurrentIfDirty() {
    return !isDirty.value || saveLabels({ silent: true })
  }

  async function setReviewStatus(status) {
    const item = currentQueueItem.value
    if (!item) {
      ElMessage.info('独立图片不支持任务审核状态')
      return
    }
    if (status === REVIEW_STATUS.NO_TARGET && boxes.value.length) {
      ElMessage.warning('当前仍有标注框，删除全部标注后才能确认无目标')
      return
    }
    if (status === REVIEW_STATUS.REVIEWED && !boxes.value.length) {
      ElMessage.warning('当前没有标注框，请使用“确认无目标”')
      return
    }
    if (!(await saveCurrentIfDirty())) return
    item.reviewStatus = status
    item.reviewedAt = new Date().toISOString()
    ElMessage.success(status === REVIEW_STATUS.NO_TARGET ? '已确认当前图片无目标' : '当前图片已审核')
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
    ElMessage.success('队列中共有 ' + queueItems.value.length + ' 张图片')
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
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault()
      saveLabels()
    } else if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      event.shiftKey ? redo() : undo()
    } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault()
      redo()
    } else if (event.key === 'Delete') {
      event.preventDefault()
      removeSelectedBox()
    } else if (event.key === 'Escape') {
      selectedBoxId.value = null
    }
  }

  function handleBeforeUnload(event) {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  watch(() => autoLabelJob.modelClassNames.value, (names) => {
    if (!names.length) return
    const palette = ANNOTATION_CLASSES.map((item) => item.color)
    classes.value = names.map((name, index) => ({ name, color: palette[index % palette.length] }))
    activeClass.value = 0
  })

  watch(() => autoLabelJob.items.value.length, async (length) => {
    if (length === 1 && currentQueueIndex.value === -1) await openQueueItem(0)
  })

  onMounted(() => {
    window.addEventListener('keydown', handleShortcut)
    window.addEventListener('beforeunload', handleBeforeUnload)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleShortcut)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    releaseLocalImage()
  })

  return {
    projects: PROJECTS, classes, project, activeClass, videoName, imageUrl, imageName,
    currentQueueIndex, queueItems, queueFilter, autoLabel, form, boxes, selectedBoxId,
    selectedBox, saving, isDirty, currentReviewStatus, currentSavedAt, canUndo, canRedo,
    stats, labeledClassCount, autoLabelJob, selectImage, addBox, selectBox, updateBox,
    removeSelectedBox, undo, redo, changeActiveClass, setReviewStatus, openQueueItem,
    saveLabels, extractFrames, exportDataset, refreshQueue, changePage,
  }
}
