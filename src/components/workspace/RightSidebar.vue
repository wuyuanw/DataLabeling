<script setup>
defineProps({
  classes: { type: Array, required: true },
  activeClass: { type: Number, required: true },
  boxes: { type: Array, required: true },
  labeledClassCount: { type: Number, required: true },
  ratio: { type: Number, required: true },
})

const emit = defineEmits(['update:activeClass', 'update:ratio', 'exportDataset'])
</script>

<template>
  <aside class="sidebar right-sidebar">
    <section class="panel class-panel">
      <h2>类别</h2>
      <button v-for="(item, index) in classes" :key="item.name" class="class-row" :class="{ active: activeClass === index }" @click="emit('update:activeClass', index)">
        <span class="class-color" :style="{ background: item.color, boxShadow: `0 0 12px ${item.color}55` }"></span>
        <em>{{ item.name }}</em><b>#{{ index }}</b>
      </button>
    </section>

    <section class="panel annotation-panel">
      <h2>当前图片标注</h2>
      <p v-if="!boxes.length">当前图片没有标注框</p>
      <div v-else class="annotation-summary">
        <span>{{ boxes.length }} 个标注框</span><small>{{ labeledClassCount }} 个类别</small>
      </div>
    </section>

    <section class="panel export-panel">
      <h2>导出训练集</h2>
      <label>验证集比例</label>
      <el-input-number :model-value="ratio" :controls="false" :min="0.05" :max="0.5" :step="0.05" @update:model-value="emit('update:ratio', $event)" />
      <el-button type="primary" @click="emit('exportDataset')">导出 YOLO 数据集</el-button>
      <el-input type="textarea" :rows="3" readonly placeholder="导出后会显示 dataset.yaml 和训练命令" />
    </section>
  </aside>
</template>

<style scoped>
.right-sidebar { border-left: 1px solid #2b3541; }
.class-panel { padding: 11px; }
.class-row { width: 100%; height: 37px; display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 9px; margin-bottom: 6px; padding: 0 9px; border: 1px solid #293541; border-radius: 4px; background: #111821; cursor: pointer; box-shadow: 0 2px 4px #0004; transition: transform 0.15s, border-color 0.15s, background 0.15s; }
.class-row:last-child { margin-bottom: 0; }
.class-row:hover { transform: translateX(-2px); border-color: #455565; }
.class-row.active { border-color: #42dbc055; background: #172b2c; }
.class-color { width: 12px; height: 12px; border-radius: 3px; }
.class-row em { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font-style: normal; font-size: 14px; }
.class-row b { color: #b7c1ca; font-size: 13px; font-weight: 500; }
.annotation-panel p { margin: 0; color: #8996a2; font-size: 12px; }
.annotation-summary { display: flex; justify-content: space-between; color: var(--primary); font-size: 13px; }
.annotation-summary small { color: #83919f; }
.export-panel > label { display: block; margin: 8px 0 6px; color: var(--muted); font-size: 12px; font-weight: 500; }
.export-panel :deep(.el-input-number) { width: 100%; margin-bottom: 9px; }
.export-panel :deep(.el-button) { margin-bottom: 9px; }

@media (max-width: 1280px) {
  .class-row { height: 34px; }
}
</style>
