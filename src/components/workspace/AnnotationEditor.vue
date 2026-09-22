<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { REVIEW_STATUS, REVIEW_STATUS_META } from '../../constants/annotation'

const props = defineProps({
  classes: { type: Array, required: true },
  activeClass: { type: Number, required: true },
  boxes: { type: Array, required: true },
  selectedBoxId: { type: String, default: null },
  imageUrl: { type: String, default: '' },
  imageName: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  isDirty: { type: Boolean, default: false },
  reviewStatus: { type: String, default: REVIEW_STATUS.PENDING },
  currentIndex: { type: Number, default: -1 },
  totalImages: { type: Number, default: 0 },
  sourceFrame: { type: Number, default: null },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:activeClass', 'selectImage', 'selectBox', 'addBox', 'updateBox',
  'save', 'remove', 'undo', 'redo', 'changePage', 'setReviewStatus',
])

const canvasAreaRef = ref(null)
const stageRef = ref(null)
const drawing = ref(null)
const interaction = ref(null)
const imageAspectRatio = ref(16 / 9)
const availableSize = ref({ width: 0, height: 0 })
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const spacePressed = ref(false)
let resizeObserver

const currentClass = computed(() => props.classes[props.activeClass])
const selectedBox = computed(() => props.boxes.find((box) => box.id === props.selectedBoxId) || null)
const reviewMeta = computed(() => REVIEW_STATUS_META[props.reviewStatus] || REVIEW_STATUS_META.pending)
const zoomPercent = computed(() => Math.round(zoom.value * 100))

const stageStyle = computed(() => {
  const { width, height } = availableSize.value
  if (!width || !height) return undefined
  const ratio = props.imageUrl ? imageAspectRatio.value : 16 / 9
  const size = width / height > ratio
    ? { width: height * ratio, height }
    : { width, height: width / ratio }
  return {
    width: String(size.width) + 'px',
    height: String(size.height) + 'px',
    transform: 'translate3d(' + pan.value.x + 'px,' + pan.value.y + 'px,0) scale(' + zoom.value + ')',
  }
})

function emitImage(event) {
  const file = event.target.files?.[0]
  if (file) emit('selectImage', file)
  event.target.value = ''
}

function updateAvailableSize() {
  const element = canvasAreaRef.value
  if (!element) return
  const style = getComputedStyle(element)
  availableSize.value = {
    width: Math.max(0, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
    height: Math.max(0, element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
  }
}

function handleImageLoad(event) {
  const { naturalWidth, naturalHeight } = event.currentTarget
  if (naturalWidth && naturalHeight) imageAspectRatio.value = naturalWidth / naturalHeight
}

function getRelativePoint(event) {
  const rect = stageRef.value.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
  }
}

function startPan(event) {
  interaction.value = {
    type: 'pan',
    clientX: event.clientX,
    clientY: event.clientY,
    originalPan: { ...pan.value },
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function startStagePointer(event) {
  if (!props.imageUrl) return
  if (event.button === 1 || (spacePressed.value && event.button === 0)) {
    startPan(event)
    return
  }
  if (event.button !== 0) return

  emit('selectBox', null)
  const point = getRelativePoint(event)
  drawing.value = {
    x: point.x, y: point.y, startX: point.x, startY: point.y,
    w: 0, h: 0, classIndex: props.activeClass,
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function startBoxMove(event, box) {
  if (event.button !== 0) return
  if (spacePressed.value) {
    startPan(event)
    return
  }
  event.stopPropagation()
  emit('selectBox', box.id)
  interaction.value = {
    type: 'move',
    boxId: box.id,
    start: getRelativePoint(event),
    original: { ...box },
    draft: { ...box },
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function startResize(event, box, handle) {
  if (event.button !== 0) return
  event.stopPropagation()
  emit('selectBox', box.id)
  interaction.value = {
    type: 'resize',
    boxId: box.id,
    handle,
    original: { ...box },
    draft: { ...box },
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function resizeBox(original, point, handle) {
  const right = original.x + original.w
  const bottom = original.y + original.h
  let left = original.x
  let top = original.y
  let nextRight = right
  let nextBottom = bottom
  if (handle.includes('w')) left = Math.min(point.x, right - 0.5)
  if (handle.includes('e')) nextRight = Math.max(point.x, original.x + 0.5)
  if (handle.includes('n')) top = Math.min(point.y, bottom - 0.5)
  if (handle.includes('s')) nextBottom = Math.max(point.y, original.y + 0.5)
  return { x: left, y: top, w: nextRight - left, h: nextBottom - top }
}

function handlePointerMove(event) {
  if (drawing.value) {
    const point = getRelativePoint(event)
    drawing.value = {
      ...drawing.value,
      x: Math.min(drawing.value.startX, point.x),
      y: Math.min(drawing.value.startY, point.y),
      w: Math.abs(point.x - drawing.value.startX),
      h: Math.abs(point.y - drawing.value.startY),
    }
    return
  }

  const active = interaction.value
  if (!active) return
  if (active.type === 'pan') {
    pan.value = {
      x: active.originalPan.x + event.clientX - active.clientX,
      y: active.originalPan.y + event.clientY - active.clientY,
    }
    return
  }

  const point = getRelativePoint(event)
  if (active.type === 'move') {
    const dx = point.x - active.start.x
    const dy = point.y - active.start.y
    active.draft = {
      ...active.original,
      x: Math.max(0, Math.min(100 - active.original.w, active.original.x + dx)),
      y: Math.max(0, Math.min(100 - active.original.h, active.original.y + dy)),
    }
  } else {
    active.draft = { ...active.original, ...resizeBox(active.original, point, active.handle) }
  }
}

function finishPointer() {
  if (drawing.value) {
    if (drawing.value.w > 0.5 && drawing.value.h > 0.5) {
      emit('addBox', {
        ...drawing.value,
        id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + String(Math.random()),
      })
    }
    drawing.value = null
  }

  if (interaction.value?.draft) {
    const { original, draft } = interaction.value
    const changed = ['x', 'y', 'w', 'h'].some((key) => original[key] !== draft[key])
    if (changed) {
      const { id, ...changes } = draft
      emit('updateBox', interaction.value.boxId, changes)
    }
  }
  interaction.value = null
}

function displayedBox(box) {
  return interaction.value?.boxId === box.id && interaction.value.draft
    ? interaction.value.draft
    : box
}

function boxStyle(box) {
  return {
    left: String(box.x) + '%',
    top: String(box.y) + '%',
    width: String(box.w) + '%',
    height: String(box.h) + '%',
    borderColor: props.classes[box.classIndex]?.color,
  }
}

function sourceLabel(box) {
  if (box.source === 'manual') return '人工'
  if (box.source === 'edited') return '已修正'
  return Number.isFinite(box.confidence) ? Math.round(box.confidence * 100) + '%' : '自动'
}

function setZoom(nextZoom) {
  zoom.value = Math.max(0.5, Math.min(4, nextZoom))
  if (zoom.value === 1) pan.value = { x: 0, y: 0 }
}

function resetView() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

function handleWheel(event) {
  if (!props.imageUrl) return
  setZoom(zoom.value + (event.deltaY < 0 ? 0.1 : -0.1))
}

function handleKeyDown(event) {
  if (event.code === 'Space' && !event.repeat) {
    spacePressed.value = true
    event.preventDefault()
  }
}

function handleKeyUp(event) {
  if (event.code === 'Space') spacePressed.value = false
}

onMounted(() => {
  resizeObserver = new ResizeObserver(updateAvailableSize)
  if (canvasAreaRef.value) resizeObserver.observe(canvasAreaRef.value)
  updateAvailableSize()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<template>
  <section class="editor">
    <div class="editor-toolbar">
      <el-select :model-value="activeClass" class="class-select" @update:model-value="emit('update:activeClass', $event)">
        <el-option v-for="(item, index) in classes" :key="item.name" :label="item.name" :value="index">
          <span class="option-color" :style="{ background: item.color }"></span>{{ item.name }}
        </el-option>
      </el-select>
      <el-button-group>
        <el-button :disabled="!canUndo" title="撤销 Ctrl+Z" @click="emit('undo')">撤销</el-button>
        <el-button :disabled="!canRedo" title="重做 Ctrl+Y" @click="emit('redo')">重做</el-button>
      </el-button-group>
      <el-button type="primary" :loading="saving" @click="emit('save')">保存</el-button>
      <el-button type="danger" :disabled="!selectedBox" @click="emit('remove')">删除选中框</el-button>
      <el-tag v-if="imageUrl" :type="isDirty ? 'warning' : 'success'" effect="dark">{{ isDirty ? '未保存' : '已保存' }}</el-tag>
      <el-tag v-if="currentIndex >= 0" :type="reviewMeta.type" effect="plain">{{ reviewMeta.label }}</el-tag>
      <span v-if="imageName" class="current-file">{{ imageName }}</span>
    </div>

    <div class="review-toolbar" v-if="currentIndex >= 0">
      <span>自动框为实线，人工框为虚线，修改后的自动框为点线</span>
      <el-button size="small" type="success" :disabled="!boxes.length" @click="emit('setReviewStatus', REVIEW_STATUS.REVIEWED)">标记已审核</el-button>
      <el-button size="small" :disabled="boxes.length > 0" @click="emit('setReviewStatus', REVIEW_STATUS.NO_TARGET)">确认无目标</el-button>
    </div>

    <div
      ref="canvasAreaRef"
      class="canvas-area"
      :class="{ panning: spacePressed || interaction?.type === 'pan' }"
      @wheel.prevent="handleWheel"
    >
      <div
        ref="stageRef"
        class="image-stage"
        :class="{ empty: !imageUrl }"
        :style="stageStyle"
        @pointerdown="startStagePointer"
        @pointermove="handlePointerMove"
        @pointerup="finishPointer"
        @pointercancel="finishPointer"
      >
        <template v-if="imageUrl">
          <img :src="imageUrl" alt="待标注图片" draggable="false" @load="handleImageLoad" />
          <div
            v-for="box in boxes"
            :key="box.id"
            class="bbox"
            :class="{ selected: selectedBoxId === box.id, manual: box.source === 'manual', edited: box.source === 'edited' }"
            :style="boxStyle(displayedBox(box))"
            @pointerdown.stop="startBoxMove($event, displayedBox(box))"
          >
            <span class="bbox-label" :style="{ background: classes[box.classIndex]?.color }">
              {{ classes[box.classIndex]?.name }} · {{ sourceLabel(box) }}
            </span>
            <template v-if="selectedBoxId === box.id">
              <i v-for="handle in ['nw', 'ne', 'sw', 'se']" :key="handle" class="resize-handle" :class="handle" @pointerdown.stop="startResize($event, displayedBox(box), handle)"></i>
            </template>
          </div>
          <div v-if="drawing" class="bbox drawing" :style="{ ...boxStyle(drawing), borderColor: currentClass?.color }"></div>
        </template>
        <div v-else class="empty-state">
          <strong>暂无待标注图片</strong>
          <p>可在左侧上传视频自动抽帧，或单独选择图片</p>
          <label class="empty-upload"><input type="file" accept="image/*" @change="emitImage" />选择图片</label>
        </div>
      </div>

      <div v-if="imageUrl" class="zoom-controls">
        <el-button size="small" @click="setZoom(zoom - 0.1)">−</el-button>
        <button class="zoom-value" @click="resetView">{{ zoomPercent }}%</button>
        <el-button size="small" @click="setZoom(zoom + 0.1)">＋</el-button>
      </div>
    </div>

    <footer class="editor-footer">
      <el-button @click="emit('changePage', -1)">上一张</el-button>
      <span>
        <b v-if="currentIndex >= 0">第 {{ currentIndex + 1 }} / {{ totalImages }} 张</b>
        <em v-if="sourceFrame !== null">原视频帧 {{ sourceFrame }}</em>
        拖拽空白处创建框 · 空格拖动画布 · 滚轮缩放
      </span>
      <el-button @click="emit('changePage', 1)">下一张</el-button>
    </footer>
  </section>
</template>

<style scoped>
.editor { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #090b10; }
.editor-toolbar { min-height: 60px; display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: #111721; border-bottom: 1px solid #29323e; }
.class-select { width: 220px; }
.option-color { display: inline-block; width: 10px; height: 10px; margin-right: 8px; border-radius: 3px; }
.current-file { min-width: 0; margin-left: auto; color: #71808f; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.review-toolbar { min-height: 38px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 5px 12px; background: #0f151d; border-bottom: 1px solid #232d38; }
.review-toolbar span { margin-right: auto; color: #758391; font-size: 11px; }
.canvas-area { position: relative; min-height: 0; flex: 1; display: flex; align-items: center; justify-content: center; padding: clamp(24px, 5vw, 70px); overflow: hidden; background-color: #090a0f; background-image: radial-gradient(#222a33 0.7px, transparent 0.7px); background-size: 18px 18px; }
.canvas-area.panning, .canvas-area.panning .image-stage { cursor: grab; }
.image-stage { position: relative; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; user-select: none; background: #000; box-shadow: 0 0 0 1px #252c36, 0 22px 55px #000a; cursor: crosshair; transform-origin: center; }
.image-stage img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.image-stage.empty { max-width: 900px; aspect-ratio: 16 / 9; background: #07090d; cursor: default; border: 1px dashed #29323a; }
.empty-state { display: flex; flex-direction: column; align-items: center; color: #7f8b98; text-align: center; }
.empty-state strong { color: #c9d2da; font-size: 17px; }
.empty-state p { margin: 8px 0 16px; font-size: 13px; }
.empty-upload { padding: 8px 14px; border: 1px solid #3d4b59; border-radius: 5px; color: #d9e2e9; background: #1b2631; cursor: pointer; }
.empty-upload input { display: none; }
.bbox { position: absolute; border: 2px solid; cursor: move; }
.bbox.manual { border-style: dashed; }
.bbox.edited { border-style: dotted; border-width: 3px; }
.bbox.selected { z-index: 3; box-shadow: 0 0 0 1px #fff, 0 0 14px #fff5; }
.bbox-label { position: absolute; top: -22px; left: -2px; height: 20px; padding: 2px 6px; color: #08110f; font-size: 11px; font-weight: 800; white-space: nowrap; pointer-events: none; }
.bbox.drawing { background: #24d3b00e; pointer-events: none; }
.resize-handle { position: absolute; width: 10px; height: 10px; border: 1px solid #08110f; border-radius: 2px; background: #fff; }
.resize-handle.nw { left: -6px; top: -6px; cursor: nwse-resize; }
.resize-handle.ne { right: -6px; top: -6px; cursor: nesw-resize; }
.resize-handle.sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
.resize-handle.se { right: -6px; bottom: -6px; cursor: nwse-resize; }
.zoom-controls { position: absolute; right: 16px; bottom: 14px; display: flex; align-items: center; gap: 4px; padding: 5px; border: 1px solid #303b47; border-radius: 6px; background: #111821dd; }
.zoom-value { width: 56px; border: 0; color: #cbd4dd; background: transparent; cursor: pointer; }
.editor-footer { min-height: 54px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; padding: 8px 12px; background: #111721; border-top: 1px solid #29323e; }
.editor-footer span { min-width: 0; text-align: center; color: #778593; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-footer b { margin-right: 12px; color: #c6d0da; }
.editor-footer em { margin-right: 12px; color: var(--primary); font-style: normal; }
@media (max-width: 1280px) { .canvas-area { padding: 28px; } .class-select { width: 170px; } }
</style>
