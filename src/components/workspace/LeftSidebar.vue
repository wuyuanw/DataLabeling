<script setup>
import { computed } from 'vue'
import { REVIEW_STATUS_META } from '../../constants/annotation'

const props = defineProps({
  projects: { type: Array, required: true },
  project: { type: String, required: true },
  stats: { type: Object, required: true },
  imageName: { type: String, default: '' },
  queueItems: { type: Array, required: true },
  currentQueueIndex: { type: Number, default: -1 },
  queueFilter: { type: String, default: 'all' },
  autoLabel: { type: Boolean, default: true },
  interval: { type: Number, required: true },
  maxFrames: { type: Number, required: true },
  confidence: { type: Number, required: true },
  imageSize: { type: Number, required: true },
  device: { type: [String, Number], required: true },
  autoLabelJob: { type: Object, required: true },
})

const emit = defineEmits([
  'update:project', 'update:queueFilter', 'update:autoLabel',
  'update:interval', 'update:maxFrames', 'update:confidence',
  'update:imageSize', 'update:device',
  'selectImage', 'pickPython', 'pickVideo', 'pickModel', 'pickOutput',
  'extractFrames', 'cancelJob', 'refreshQueue', 'openQueueItem',
])

const filteredItems = computed(() => {
  const entries = props.queueItems.map((item, index) => ({ item, index }))
  if (props.queueFilter === 'all') return entries
  return entries.filter(({ item }) => item.reviewStatus === props.queueFilter)
})

const statusMeta = (status) => REVIEW_STATUS_META[status] || REVIEW_STATUS_META.pending

function emitSelectedImage(event) {
  const file = event.target.files?.[0]
  if (file) emit('selectImage', file)
  event.target.value = ''
}
</script>

<template>
  <aside class="sidebar left-sidebar">
    <section class="panel project-panel">
      <h2>项目</h2>
      <label>数据集项目</label>
      <el-select :model-value="project" @update:model-value="emit('update:project', $event)">
        <el-option v-for="item in projects" :key="item" :label="item" :value="item" />
      </el-select>
      <div class="stats-grid">
        <div><span>图片</span><strong>{{ stats.images }}</strong></div>
        <div><span>已标注</span><strong>{{ stats.labeled }}</strong></div>
        <div><span>框数</span><strong>{{ stats.boxes }}</strong></div>
        <div><span>视频</span><strong>{{ stats.videos }}</strong></div>
      </div>
    </section>

    <section class="panel extract-panel">
      <h2>视频抽帧与预标注</h2>

      <label>Conda Python</label>
      <div class="path-picker">
        <el-button :loading="autoLabelJob.runtimeChecking.value" @click="emit('pickPython')">选择 Python</el-button>
        <span :class="{ success: autoLabelJob.runtime.value.ready, error: autoLabelJob.runtime.value.configured && !autoLabelJob.runtime.value.ready }">
          {{ autoLabelJob.runtime.value.ready
            ? `${autoLabelJob.runtime.value.pythonVersion} · ${autoLabelJob.runtime.value.deviceName}`
            : autoLabelJob.runtime.value.error || '未配置环境' }}
        </span>
      </div>

      <label>视频文件</label>
      <div class="path-picker">
        <el-button @click="emit('pickVideo')">选择视频</el-button>
        <span>{{ autoLabelJob.video.value?.name || '未选择视频' }}</span>
      </div>

      <label>YOLO 模型</label>
      <div class="path-picker">
        <el-button @click="emit('pickModel')">选择模型</el-button>
        <span>{{ autoLabelJob.model.value?.name || '未选择模型' }}</span>
      </div>

      <label>输出目录</label>
      <div class="path-picker">
        <el-button @click="emit('pickOutput')">选择目录</el-button>
        <span>{{ autoLabelJob.output.value?.path || '未选择目录' }}</span>
      </div>

      <label class="file-button secondary-file">
        <input type="file" accept="image/*" @change="emitSelectedImage" />
        单独上传图片
      </label>

      <div class="form-grid">
        <label><span>间隔帧数</span><el-input-number :model-value="interval" :controls="false" :min="1" @update:model-value="emit('update:interval', $event)" /></label>
        <label><span>最多抽帧</span><el-input-number :model-value="maxFrames" :controls="false" :min="1" @update:model-value="emit('update:maxFrames', $event)" /></label>
        <label><span>置信度</span><el-input-number :model-value="confidence" :controls="false" :min="0" :max="1" :step="0.05" @update:model-value="emit('update:confidence', $event)" /></label>
        <label><span>推理尺寸</span><el-input-number :model-value="imageSize" :controls="false" :min="320" :max="2048" :step="32" @update:model-value="emit('update:imageSize', $event)" /></label>
      </div>
      <label>推理设备</label>
      <el-select :model-value="device" @update:model-value="emit('update:device', $event)">
        <el-option label="自动选择" value="auto" />
        <el-option label="GPU 0" :value="0" />
        <el-option label="CPU" value="cpu" />
      </el-select>

      <el-checkbox :model-value="autoLabel" @update:model-value="emit('update:autoLabel', $event)">自动预标注</el-checkbox>
      <div class="job-actions">
        <el-button type="primary" :disabled="!autoLabelJob.canStart.value" :loading="autoLabelJob.status.value === 'running'" @click="emit('extractFrames')">开始抽帧</el-button>
        <el-button v-if="autoLabelJob.status.value === 'running'" type="danger" @click="emit('cancelJob')">取消</el-button>
      </div>

      <div v-if="autoLabelJob.status.value !== 'idle'" class="job-progress">
        <el-progress
          :percentage="autoLabelJob.progress.value"
          :status="autoLabelJob.status.value === 'failed' ? 'exception' : autoLabelJob.status.value === 'completed' ? 'success' : undefined"
        />
        <p>{{ autoLabelJob.message.value || autoLabelJob.phase.value }} {{ autoLabelJob.current.value }}/{{ autoLabelJob.total.value }}</p>
        <p v-if="autoLabelJob.error.value" class="error">{{ autoLabelJob.error.value }}</p>
        <p v-if="autoLabelJob.outputDirectory.value" :title="autoLabelJob.outputDirectory.value">输出：{{ autoLabelJob.outputDirectory.value }}</p>
      </div>
    </section>

    <section class="panel queue-panel">
      <h2>图片队列</h2>
      <div class="segmented">
        <button :class="{ active: queueFilter === 'all' }" @click="emit('update:queueFilter', 'all')">全部</button>
        <button :class="{ active: queueFilter === 'pending' }" @click="emit('update:queueFilter', 'pending')">待审核</button>
        <button :class="{ active: queueFilter === 'modified' }" @click="emit('update:queueFilter', 'modified')">已修改</button>
        <button :class="{ active: queueFilter === 'reviewed' }" @click="emit('update:queueFilter', 'reviewed')">已审核</button>
        <button :class="{ active: queueFilter === 'no_target' }" @click="emit('update:queueFilter', 'no_target')">无目标</button>
        <button @click="emit('refreshQueue')">刷新</button>
      </div>
      <div class="queue-list">
        <button
          v-for="entry in filteredItems"
          :key="entry.item.fileName"
          class="queue-item"
          :class="{ active: currentQueueIndex === entry.index }"
          @click="emit('openQueueItem', entry.index)"
        >
          <span>{{ entry.item.fileName }}</span>
          <small :class="'status-' + entry.item.reviewStatus">
            {{ entry.item.dirty ? '未保存' : statusMeta(entry.item.reviewStatus).label }}
          </small>
          <b>{{ entry.item.boxes?.length || 0 }}</b>
        </button>
        <div v-if="!filteredItems.length && imageName" class="queue-item standalone"><span>{{ imageName }}</span></div>
        <p v-if="!filteredItems.length && !imageName" class="queue-empty">暂无图片</p>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.left-sidebar { border-right: 1px solid #2b3541; }
.panel > label, .form-grid label > span { display: block; margin: 8px 0 6px; color: var(--muted); font-size: 12px; font-weight: 500; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 10px; }
.stats-grid div { min-height: 66px; padding: 11px; display: flex; flex-direction: column; gap: 7px; background: #111820; border: 1px solid #27323e; border-radius: 4px; }
.stats-grid span { font-size: 14px; color: #bcc6cf; }
.stats-grid strong { font-size: 23px; line-height: 1; color: #fff; }
.path-picker { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 7px; }
.path-picker span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #aeb8c3; font-size: 12px; }
.path-picker span.success { color: var(--primary); }
.path-picker span.error, .job-progress .error { color: #ff7781; }
.file-button input { display: none; }
.file-button { cursor: pointer; }
.secondary-file { display: inline-flex !important; width: auto; height: 32px; align-items: center; margin: 10px 0 2px !important; padding: 0 12px; border-radius: 4px; color: #071b18 !important; background: #2bc9ab; font-size: 13px !important; font-weight: 700 !important; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; }
.form-grid label { min-width: 0; }
.extract-panel :deep(.el-checkbox) { margin: 8px 0; display: flex; }
.job-actions { display: flex; gap: 7px; }
.job-progress { margin-top: 10px; padding: 8px; border-radius: 5px; background: #111820; }
.job-progress p { margin: 5px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8493a1; font-size: 11px; }
.segmented { display: flex; flex-wrap: wrap; gap: 4px; }
.segmented button { padding: 8px 10px; border: 1px solid transparent; border-radius: 4px; background: #27313e; font-weight: 700; cursor: pointer; }
.segmented button:hover, .segmented button.active { color: var(--primary); border-color: #2dbb9f66; background: #152d2a; }
.queue-list { max-height: 180px; margin-top: 8px; overflow-y: auto; }
.queue-item { width: 100%; display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; padding: 8px; border: 1px solid #27323e; border-radius: 4px; background: #111820; color: #d5dde4; font-size: 12px; cursor: pointer; }
.queue-item:hover, .queue-item.active { border-color: #35cdb388; background: #16302d; }
.queue-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-item small { margin-left: auto; padding: 2px 5px; border-radius: 3px; color: #8f9ba7; background: #252e38; white-space: nowrap; }
.queue-item small.status-modified { color: #f6c85f; background: #3b321c; }
.queue-item small.status-reviewed, .queue-item small.status-no_target { color: #59dfbf; background: #17362f; }
.queue-item b { color: var(--primary); }
.queue-item.standalone { cursor: default; }
.queue-empty { margin: 12px 0 2px; color: #73808d; font-size: 12px; text-align: center; }

@media (max-height: 760px) {
  .stats-grid div { min-height: 52px; padding: 8px; gap: 4px; }
  .stats-grid strong { font-size: 19px; }
}
</style>
