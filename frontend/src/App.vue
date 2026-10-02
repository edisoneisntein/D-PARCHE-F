<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { t } from '@/i18n'
import { useTheme } from '@/composables/useTheme'
import { useToast } from '@/composables/useToast'
import { useConfig } from '@/composables/useConfig'
import { useVoice } from '@/composables/useVoice'
import { useTasks } from '@/composables/useTasks'
import { useProgress } from '@/composables/useProgress'
import { useNavigation } from '@/composables/useNavigation'
import { useGallery } from '@/composables/useGallery'
import { appState } from '@/store'
import ConfigPanel from '@/components/ConfigPanel.vue'
import CreatePanel from '@/components/CreatePanel.vue'
import SimplePanel from '@/components/SimplePanel.vue'
import TaskListPanel from '@/components/TaskListPanel.vue'
import GalleryPanel from '@/components/GalleryPanel.vue'
import ProgressPage from '@/components/ProgressPage.vue'
import CyberStudioView from '@/components/CyberStudioView.vue'
import VoicePickerModal from '@/components/VoicePickerModal.vue'
import Toast from '@/components/Toast.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LangSwitcher from '@/components/shared/LangSwitcher.vue'

const { themeIcon, themeLabel, cycleTheme } = useTheme()
const { visible: toastVisible, message: toastMessage, type: toastType } = useToast()
const { loadModels, renderWorkspaces } = useConfig()
const { initVoiceSelector } = useVoice()
const { loadTaskList, startTaskListTimer, stopTaskListTimer } = useTasks()
const { parseHash } = useNavigation()
const { loadGallery, startGalleryTimer, stopGalleryTimer } = useGallery()

function switchMainTab(tab: 'create' | 'list' | 'simple' | 'gallery') {
  appState.view = tab
  location.hash =
    tab === 'list' ? '#/list' : tab === 'simple' ? '#/simple' : tab === 'gallery' ? '#/gallery' : '#/create'
  if (tab === 'list') {
    loadTaskList()
    startTaskListTimer()
  } else if (tab === 'gallery') {
    loadGallery()
    startGalleryTimer()
  } else {
    stopTaskListTimer()
    stopGalleryTimer()
  }
}

const isConfigLoaded = ref(false)

onMounted(async () => {
  // 解析 hash：直达进度页 / 列表页（刷新保留视图）
  const parsed = parseHash()
  if (parsed.view === 'progress' && parsed.taskId) {
    appState.view = 'progress'
    appState.progressTaskId = parsed.taskId
    appState.currentTaskId = parsed.taskId
    // 其余恢复逻辑由 ProgressPage 挂载时统一处理
  } else {
    appState.view = parsed.view
    if (parsed.view === 'gallery') {
      loadGallery()
      startGalleryTimer()
    }
  }

  try {
    const cfg = await fetch('/api/config').then((r) => r.json())
    if (cfg.api_key) {
      appState.apiKeySource = cfg.source
    }
    // v6.1 问题反馈：记录应用版本（诊断信息用；缺失时 FeedbackPanel 自兜底拉取）
    if (cfg.app_version) {
      appState.appVersion = cfg.app_version
    }
    await renderWorkspaces()
    if (cfg.watermark !== undefined) {
      appState.watermarkEnabled = !!cfg.watermark.enabled
    }
    if (cfg.agnes_domain) {
      appState.agnesDomain = cfg.agnes_domain
    }
    await loadModels()
    isConfigLoaded.value = true
  } catch (e) {
    console.error('init config load error:', e)
  }

  try {
    await initVoiceSelector()
  } catch (e) {
    console.error('init voice selector error:', e)
  }

  // 自动重连运行中的任务（已在进度页时跳过，由 ProgressPage 恢复）
  if (appState.view !== 'progress') {
    autoReconnectRunningTask()
  }
})

async function autoReconnectRunningTask() {
  try {
    const d = await fetch('/api/tasks').then((r) => r.json())
    const running = (d.tasks || []).find((t: any) => t.status === 'running' || t.status === 'queued')
    if (running) {
      appState.currentTaskType = running.task_type || 'creative'
      appState.currentDirName = running.dir_name || running.task_id
      appState.progressTaskId = running.task_id
      appState.progressOrigin = 'create'
      appState.view = 'progress'
      location.hash = '#/progress/' + encodeURIComponent(running.task_id)
    }
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <ProgressPage v-if="appState.view === 'progress'" />
  <CyberStudioView v-else />

  <!-- Voice Picker Modal -->
  <VoicePickerModal />

  <!-- Toast / Confirm -->
  <Toast :visible="toastVisible" :message="toastMessage" :type="toastType" />
  <ConfirmModal />
</template>
