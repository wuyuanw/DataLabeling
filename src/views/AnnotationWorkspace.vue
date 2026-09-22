<script setup>
import AppHeader from '../components/layout/AppHeader.vue'
import AnnotationEditor from '../components/workspace/AnnotationEditor.vue'
import LeftSidebar from '../components/workspace/LeftSidebar.vue'
import RightSidebar from '../components/workspace/RightSidebar.vue'
import { useAnnotationWorkspace } from '../composables/useAnnotationWorkspace'

const workspace = useAnnotationWorkspace()
</script>

<template>
  <div class="app-shell">
    <!-- 上部 -->
    <AppHeader /> 
    <!-- 中部 -->
    <main class="workspace">
      <!-- 中部左 -->
      <LeftSidebar
        v-model:project="workspace.project.value"
        v-model:queue-filter="workspace.queueFilter.value"
        v-model:auto-label="workspace.autoLabel.value"
        v-model:interval="workspace.form.interval"
        v-model:max-frames="workspace.form.maxFrames"
        v-model:confidence="workspace.form.confidence"
        v-model:image-size="workspace.form.imageSize"
        v-model:device="workspace.form.device"
        :projects="workspace.projects"
        :stats="workspace.stats.value"
        :image-name="workspace.imageName.value"
        :queue-items="workspace.queueItems.value"
        :current-queue-index="workspace.currentQueueIndex.value"
        :auto-label-job="workspace.autoLabelJob"
        @select-image="workspace.selectImage"
        @pick-python="workspace.autoLabelJob.pickPython"
        @pick-video="workspace.autoLabelJob.pickVideo"
        @pick-model="workspace.autoLabelJob.pickModel"
        @pick-output="workspace.autoLabelJob.pickOutputDirectory"
        @extract-frames="workspace.extractFrames"
        @cancel-job="workspace.autoLabelJob.cancel"
        @refresh-queue="workspace.refreshQueue"
        @open-queue-item="workspace.openQueueItem"
      />
      <!-- 中部中 -->
      <AnnotationEditor
        v-model:active-class="workspace.activeClass.value"
        :classes="workspace.classes.value"
        :boxes="workspace.boxes.value"
        :image-url="workspace.imageUrl.value"
        :image-name="workspace.imageName.value"
        :saving="workspace.saving.value"
        @select-image="workspace.selectImage"
        @add-box="workspace.addBox"
        @save="workspace.saveLabels"
        @remove="workspace.removeLastBox"
        @change-page="workspace.changePage"
      />
      <!-- 中部右 -->
      <RightSidebar
        v-model:active-class="workspace.activeClass.value"
        v-model:ratio="workspace.form.ratio"
        :classes="workspace.classes.value"
        :boxes="workspace.boxes.value"
        :labeled-class-count="workspace.labeledClassCount.value"
        @export-dataset="workspace.exportDataset"
      />
    </main>
  </div>
</template>

<style scoped>
.app-shell { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
.workspace { min-height: 0; flex: 1; display: grid; grid-template-columns: 310px minmax(520px, 1fr) 304px; }

@media (max-width: 1280px) {
  .workspace { grid-template-columns: 260px minmax(480px, 1fr) 260px; }
}
</style>
