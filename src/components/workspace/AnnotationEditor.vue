<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  classes: { type: Array, required: true },
  activeClass: { type: Number, required: true },
  boxes: { type: Array, required: true },
  imageUrl: { type: String, default: '' },
  imageName: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:activeClass', 'selectImage', 'addBox', 'save', 'remove', 'changePage'])
const canvasAreaRef = ref(null)
const stageRef = ref(null)
const drawing = ref(null)
const imageAspectRatio = ref(16 / 9)
const availableSize = ref({ width: 0, height: 0 })
const currentClass = computed(() => props.classes[props.activeClass])
let resizeObserver

const stageStyle = computed(() => {
  const { width, height } = availableSize.value
  if (!width || !height) return undefined

  const ratio = props.imageUrl ? imageAspectRatio.value : 16 / 9
  if (width / height > ratio) {
    return { width: `${height * ratio}px`, height: `${height}px` }
  }
  return { width: `${width}px`, height: `${width / ratio}px` }
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

/** 将指针位置转换成画布内的 0-100 百分比坐标。 */
function getRelativePoint(event) {
  const rect = stageRef.value.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
  }
}

function startDraw(event) {
  if (!props.imageUrl || event.button !== 0) return
  const point = getRelativePoint(event)
  drawing.value = { x: point.x, y: point.y, startX: point.x, startY: point.y, w: 0, h: 0, classIndex: props.activeClass }
  // 捕获指针，拖动到画布外再松开时也能正常结束本次绘制。
  event.currentTarget.setPointerCapture(event.pointerId)
}

function moveDraw(event) {
  if (!drawing.value) return
  const point = getRelativePoint(event)
  drawing.value = {
    ...drawing.value,
    x: Math.min(drawing.value.startX, point.x),
    y: Math.min(drawing.value.startY, point.y),
    w: Math.abs(point.x - drawing.value.startX),
    h: Math.abs(point.y - drawing.value.startY),
  }
}

function finishDraw() {
  if (!drawing.value) return
  // 忽略小于画布 1% 的误点击，避免生成几乎不可见的框。
  if (drawing.value.w > 1 && drawing.value.h > 1) {
    emit('addBox', { ...drawing.value, id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` })
  }
  drawing.value = null
}

function boxStyle(box) {
  return {
    left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`,
    borderColor: props.classes[box.classIndex]?.color,
  }
}

onMounted(() => {
  resizeObserver = new ResizeObserver(updateAvailableSize)
  if (canvasAreaRef.value) resizeObserver.observe(canvasAreaRef.value)
  updateAvailableSize()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section class="editor">
    <div class="editor-toolbar">
      <el-select :model-value="activeClass" class="class-select" @update:model-value="emit('update:activeClass', $event)">
        <el-option v-for="(item, index) in classes" :key="item.name" :label="item.name" :value="index">
          <span class="option-color" :style="{ background: item.color }"></span>{{ item.name }}
        </el-option>
      </el-select>
      <el-button type="primary" :loading="saving" @click="emit('save')">保存标注</el-button>
      <el-button type="danger" @click="emit('remove')">删除标注</el-button>
      <span v-if="imageName" class="current-file">{{ imageName }}</span>
    </div>

    <div ref="canvasAreaRef" class="canvas-area">
      <div ref="stageRef" class="image-stage" :class="{ empty: !imageUrl }" :style="stageStyle" @pointerdown="startDraw" @pointermove="moveDraw" @pointerup="finishDraw" @pointercancel="finishDraw">
        <template v-if="imageUrl">
          <img :src="imageUrl" alt="待标注图片" draggable="false" @load="handleImageLoad" />
          <div v-for="box in boxes" :key="box.id" class="bbox" :style="boxStyle(box)">
            <span :style="{ background: classes[box.classIndex]?.color }">{{ classes[box.classIndex]?.name }}</span>
          </div>
          <div v-if="drawing" class="bbox drawing" :style="{ ...boxStyle(drawing), borderColor: currentClass.color }"></div>
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon"><span></span><b></b></div>
          <strong>暂无待标注图片</strong>
          <p>上传一张图片，开始创建标注框</p>
          <label class="empty-upload"><input type="file" accept="image/*" @change="emitImage" />选择图片</label>
        </div>
      </div>
    </div>

    <footer class="editor-footer">
      <el-button @click="emit('changePage', -1)">上一张</el-button>
      <span>鼠标拖拽创建框 · 点击已有框选中 · 保存后自动写入 YOLO txt 标签</span>
      <el-button @click="emit('changePage', 1)">下一张</el-button>
    </footer>
  </section>
</template>

<style scoped>
.editor { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #090b10; }
.editor-toolbar { height: 60px; flex: 0 0 60px; display: flex; align-items: center; gap: 9px; padding: 9px 12px; background: #111721; border-bottom: 1px solid #29323e; }
.class-select { width: 260px; }
.option-color { display: inline-block; width: 10px; height: 10px; margin-right: 8px; border-radius: 3px; }
.current-file { min-width: 0; margin-left: auto; color: #71808f; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.canvas-area { min-height: 0; flex: 1; display: flex; align-items: center; justify-content: center; padding: clamp(24px, 5vw, 70px); background-color: #090a0f; background-image: radial-gradient(#222a33 0.7px, transparent 0.7px); background-size: 18px 18px; }
.image-stage { position: relative; flex: 0 0 auto; width: 100%; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; overflow: hidden; user-select: none; background: #000; box-shadow: 0 0 0 1px #252c36, 0 22px 55px #000a; cursor: crosshair; }
.image-stage img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.image-stage.empty { max-width: 900px; background: #07090d; cursor: default; border: 1px dashed #29323a; box-shadow: inset 0 0 100px #0c1118, 0 22px 55px #0008; }
.empty-state { display: flex; flex-direction: column; align-items: center; color: #7f8b98; text-align: center; }
.empty-state strong { margin-top: 17px; color: #c9d2da; font-size: 17px; }
.empty-state p { margin: 7px 0 16px; font-size: 13px; }
.empty-icon { position: relative; width: 64px; height: 52px; border: 2px solid #37424e; border-radius: 7px; }
.empty-icon span { position: absolute; left: 10px; bottom: 10px; width: 41px; height: 19px; background: linear-gradient(145deg, transparent 45%, #37424e 47% 53%, transparent 55%), linear-gradient(35deg, transparent 45%, #37424e 47% 53%, transparent 55%); }
.empty-icon b { position: absolute; right: 10px; top: 9px; width: 8px; height: 8px; border-radius: 50%; background: #3e4a57; }
.empty-upload { padding: 8px 14px; border: 1px solid #3d4b59; border-radius: 5px; color: #d9e2e9; background: #1b2631; cursor: pointer; }
.empty-upload input { display: none; }
.empty-upload:hover { color: var(--primary); border-color: var(--primary); }
.bbox { position: absolute; border: 2px solid; pointer-events: none; }
.bbox span { position: absolute; top: -22px; left: -2px; height: 20px; padding: 2px 6px; color: #08110f; font-size: 11px; font-weight: 800; white-space: nowrap; }
.bbox.drawing { background: #24d3b00e; }
.editor-footer { height: 54px; flex: 0 0 54px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 18px; padding: 8px 12px; background: #111721; border-top: 1px solid #29323e; }
.editor-footer span { min-width: 0; text-align: center; color: #778593; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 1280px) { .canvas-area { padding: 28px; } }
@media (max-height: 760px) {
  .editor-toolbar { height: 52px; flex-basis: 52px; }
  .editor-footer { height: 48px; flex-basis: 48px; }
}
</style>
