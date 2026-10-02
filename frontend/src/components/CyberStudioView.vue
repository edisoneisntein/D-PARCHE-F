<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { t, currentLang } from '@/i18n'
import { appState } from '@/store'
import * as api from '@/api'
import { useToast } from '@/composables/useToast'
import ConfigPanel from './ConfigPanel.vue'
import GalleryPanel from './GalleryPanel.vue'
import TaskListPanel from './TaskListPanel.vue'
import CreatePanel from './CreatePanel.vue'

const { showToast } = useToast()

// ── Props & Emits ──
const emit = defineEmits<{
  (e: 'open-config'): void
}>()

// ── Tab Management ──
const currentTab = ref<'simple' | 'creative' | 'manuscript' | 'anchor' | 'poetry' | 'gallery'>('simple')
const activeSidebarTool = ref<'prompt' | 'magic' | 'flow' | 'camera' | 'sliders' | 'crop'>('prompt')

// ── Form State (Exact match to screenshot) ──
const promptText = ref(
  'rigid street forward and 900 - 2iso ponytail canvas ceer bamd fr6arit, ACTION first, frame reclere eclcca Soun Asialan sheels eek S8Cm reverse anipta voer Seck drvun tippin drivo-chicken eepanding ficss, itonu, mie S0em aoe osie. fo1t tridoj, ATi7lOft noction: l-ids snap coovant bar estending to fully black Soo vs eotherity shoot, ACTION iwenice 1.3e anap femvem to oedt ty calcl on colket luift Vëcita. Baek km Este ee entret vb y ye\'scoi/ ly prbnoTDb, AUDIC Aodkz afiibilro0t000 ye boklcr to pronel liiie... NEGATIVE no wsdlbrode brioge chape scer ver nat oor oat'
)
const selectedVideoModel = ref('config')
const videoMode = ref<'i2v' | 't2v' | 'ti2vid' | 'keyframes'>('i2v')
const durationSeconds = ref(15)
const orientation = ref<'portrait' | 'landscape' | 'square'>('portrait')
const seedValue = ref(-1)
const seedFineTune = ref(0)
const negativePrompt = ref('')
const selectedSeedImage = ref('videoforame_3555.png')
const showConfigModal = ref(false)

// Reference images mock/actual list
const referenceImages = ref([
  { id: 1, name: '1.png', label: 'Image 1', src: '/assets/depth_map_portrait_1790913022571.jpg' },
  { id: 2, name: '2.png', label: 'Image 2', src: '/assets/cinematic_street_scene_1790912918581.jpg' },
  { id: 3, name: '3.png', label: 'Image 3', src: '/assets/depth_map_portrait_1790913022571.jpg' },
  { id: 4, name: '4.png', label: 'Image 4', src: '/assets/cinematic_street_scene_1790912918581.jpg' },
  { id: 5, name: '5.png', label: 'Image 5', src: '/assets/depth_map_portrait_1790913022571.jpg' },
])

// ── Computed Token Counter ──
const tokenCount = computed(() => {
  const words = promptText.value.trim().split(/\s+/).filter(Boolean)
  return Math.min(1299, Math.max(1, words.length * 3 + Math.floor(promptText.value.length / 5)))
})

// ── Generation State & Telemetry ──
const isGenerating = ref(false)
const generationProgress = ref(100)
const activeGenerationId = ref('338511976')
const activeTaskId = ref('simple_628611bd600')
const lastGeneratedVideoUrl = ref('')
const isVideoPlaying = ref(false)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)

// Current live HUD time
const hudTime = ref('14:02:33.35:39')
let hudInterval: number | undefined

// ── Canvas References for 3D Mesh and Radar ──
const wireframeCanvasRef = ref<HTMLCanvasElement | null>(null)
const radarCanvasRef = ref<HTMLCanvasElement | null>(null)
let animFrameId: number | undefined
let wireframeRotation = 0

// ── Format helpers ──
const resolutionDisplay = computed(() => {
  if (orientation.value === 'portrait') return '768×1152 (9:16)'
  if (orientation.value === 'landscape') return '1280×720 (16:9)'
  return '1024×1024 (1:1)'
})

// ── Actions ──
function randomizeSeed() {
  seedValue.value = Math.floor(Math.random() * 99999999)
}

function resetSeed() {
  seedValue.value = -1
}

function toggleVideoPlayback() {
  if (!videoPlayerRef.value) return
  if (videoPlayerRef.value.paused) {
    videoPlayerRef.value.play()
    isVideoPlaying.value = true
  } else {
    videoPlayerRef.value.pause()
    isVideoPlaying.value = false
  }
}

async function handleGenerateVideo() {
  if (!promptText.value.trim()) {
    showToast('Introduce un prompt para generar el video', 3000)
    return
  }

  isGenerating.value = true
  generationProgress.value = 10
  activeGenerationId.value = String(Math.floor(100000000 + Math.random() * 900000000))

  try {
    const formData = new FormData()
    formData.append('prompt', promptText.value.trim())
    formData.append('mode', videoMode.value)
    formData.append('duration', String(durationSeconds.value))
    
    const [w, h] = orientation.value === 'portrait' ? [768, 1152] : orientation.value === 'landscape' ? [1280, 720] : [1024, 1024]
    formData.append('video_width', String(w))
    formData.append('video_height', String(h))
    
    if (seedValue.value >= 0) {
      formData.append('seed', String(seedValue.value))
    }
    if (negativePrompt.value.trim()) {
      formData.append('negative_prompt', negativePrompt.value.trim())
    }

    // Call real backend endpoint
    const res = await api.submitSimple(formData)
    if (res.task_id) {
      activeTaskId.value = res.task_id
      showToast('Tarea iniciada con éxito. Renderizando...', 4000)
      
      // Simulate/wait progress
      let p = 15
      const timer = setInterval(async () => {
        p += 15
        if (p >= 95) p = 95
        generationProgress.value = p
        
        try {
          const taskData = await api.getTask(res.task_id)
          if (taskData.status === 'completed') {
            clearInterval(timer)
            generationProgress.value = 100
            isGenerating.value = false
            lastGeneratedVideoUrl.value = `/api/video/${res.task_id}`
            showToast('¡Video generado con éxito!', 4000)
          } else if (taskData.status === 'failed') {
            clearInterval(timer)
            isGenerating.value = false
            showToast(taskData.error || 'Error al generar video', 5000)
          }
        } catch {
          // ignore
        }
      }, 3000)
    } else {
      throw new Error(res.detail || 'Error al enviar tarea')
    }
  } catch (err: any) {
    isGenerating.value = false
    showToast(err?.message || 'Error en la generación. Verifica tu API Key.', 5000)
  }
}

function handlePreviewClick() {
  showToast('Generando vista previa de encuadre HUD...', 2500)
  activeGenerationId.value = String(Math.floor(100000000 + Math.random() * 900000000))
}

// ── 3D Wireframe Canvas Animation ──
function render3DWireframe() {
  const canvas = wireframeCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  wireframeRotation += 0.008

  ctx.save()
  ctx.translate(w / 2, h / 2 + 10)

  // Draw 3D isometric terrain wireframe mesh
  const rows = 12
  const cols = 12
  const scale = 8

  ctx.strokeStyle = 'rgba(100, 140, 180, 0.45)'
  ctx.lineWidth = 1

  const points: { x: number; y: number }[][] = []

  for (let r = -rows / 2; r <= rows / 2; r++) {
    const rowPoints: { x: number; y: number }[] = []
    for (let c = -cols / 2; c <= cols / 2; c++) {
      // 3D coordinates
      const x0 = c * scale
      const z0 = r * scale
      // Height variation using sine wave
      const y0 = Math.sin(r * 0.5 + wireframeRotation) * Math.cos(c * 0.5 + wireframeRotation) * 8

      // Rotate around Y axis
      const cosR = Math.cos(wireframeRotation)
      const sinR = Math.sin(wireframeRotation)
      const rx = x0 * cosR - z0 * sinR
      const rz = x0 * sinR + z0 * cosR

      // Isometric projection
      const px = (rx - rz) * Math.cos(0.46)
      const py = (rx + rz) * Math.sin(0.46) - y0

      rowPoints.push({ x: px, y: py })
    }
    points.push(rowPoints)
  }

  // Draw grid lines
  for (let r = 0; r < points.length; r++) {
    ctx.beginPath()
    for (let c = 0; c < points[r].length; c++) {
      if (c === 0) ctx.moveTo(points[r][c].x, points[r][c].y)
      else ctx.lineTo(points[r][c].x, points[r][c].y)
    }
    ctx.stroke()
  }

  for (let c = 0; c < points[0].length; c++) {
    ctx.beginPath()
    for (let r = 0; r < points.length; r++) {
      if (r === 0) ctx.moveTo(points[r][c].x, points[r][c].y)
      else ctx.lineTo(points[r][c].x, points[r][c].y)
    }
    ctx.stroke()
  }

  // Draw central subject vector marker (standing human wireframe silhouette)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  // Head
  ctx.arc(0, -22, 3, 0, Math.PI * 2)
  // Spine
  ctx.moveTo(0, -19)
  ctx.lineTo(0, -8)
  // Legs
  ctx.lineTo(-4, 0)
  ctx.moveTo(0, -8)
  ctx.lineTo(4, 0)
  // Arms
  ctx.moveTo(-6, -15)
  ctx.lineTo(6, -15)
  ctx.stroke()

  // Camera trajectory vector ray
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)'
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(-45, -35)
  ctx.lineTo(0, -15)
  ctx.stroke()
  ctx.setLineDash([])

  // Camera origin symbol
  ctx.fillStyle = '#38bdf8'
  ctx.fillRect(-47, -37, 4, 4)

  ctx.restore()
}

// ── Radar Contour Graph Canvas Animation ──
let radarAngle = 0
function renderRadarGraph() {
  const canvas = radarCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  radarAngle += 0.02

  const cx = w * 0.65
  const cy = h * 0.45

  // Draw 3D axis projection lines
  ctx.strokeStyle = 'rgba(80, 100, 120, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  // Axis X
  ctx.moveTo(cx, cy)
  ctx.lineTo(w - 15, cy - 25)
  // Axis Y
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + 25, 15)
  // Axis Z
  ctx.moveTo(cx, cy)
  ctx.lineTo(15, h - 20)
  ctx.stroke()

  // Draw concentric elliptical radar contours
  for (let r = 1; r <= 3; r++) {
    ctx.strokeStyle = `rgba(100, 130, 160, ${0.15 * r})`
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 22, r * 12, -0.3, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Draw topographic spectral wire lines at bottom left
  ctx.strokeStyle = 'rgba(70, 95, 120, 0.5)'
  ctx.lineWidth = 1
  for (let l = 0; l < 4; l++) {
    ctx.beginPath()
    const baseY = h - 20 - l * 8
    ctx.moveTo(15, baseY)
    for (let x = 15; x < w * 0.55; x += 10) {
      const ny = baseY - Math.sin((x + l * 20) * 0.05 + radarAngle) * (4 + l * 2)
      ctx.lineTo(x, ny)
    }
    ctx.stroke()
  }

  // Animated sweeping radar dot
  const dotX = cx + Math.cos(radarAngle) * 35
  const dotY = cy + Math.sin(radarAngle) * 18
  ctx.fillStyle = 'rgba(74, 222, 128, 0.8)'
  ctx.beginPath()
  ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

function animateCanvases() {
  render3DWireframe()
  renderRadarGraph()
  animFrameId = requestAnimationFrame(animateCanvases)
}

onMounted(() => {
  // Update HUD live clock
  hudInterval = window.setInterval(() => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    const ms = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0')
    hudTime.value = `${hh}:${mm}:${ss}.${ms}`
  }, 50)

  animFrameId = requestAnimationFrame(animateCanvases)
})

onUnmounted(() => {
  if (hudInterval) clearInterval(hudInterval)
  if (animFrameId) cancelAnimationFrame(animFrameId)
})
</script>

<template>
  <div class="min-h-screen bg-[#0d1117] text-[#c9d1d9] font-sans antialiased select-none flex flex-col">
    <!-- ── TOP BAR (Exact match to screenshot) ── -->
    <header class="h-12 border-b border-[#21262d] bg-[#161b22] px-4 flex items-center justify-between z-20">
      <!-- Logo -->
      <div class="flex items-center gap-2.5">
        <svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <line x1="7" y1="2" x2="7" y2="22"></line>
          <line x1="17" y1="2" x2="17" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="2" y1="7" x2="7" y2="7"></line>
          <line x1="2" y1="17" x2="7" y2="17"></line>
          <line x1="17" y1="17" x2="22" y2="17"></line>
          <line x1="17" y1="7" x2="22" y2="7"></line>
        </svg>
        <span class="text-sm font-semibold tracking-wider text-slate-100 uppercase">Agnes Video Generator</span>
      </div>

      <!-- Right Actions: Status & Config Button -->
      <div class="flex items-center gap-3">
        <!-- Status Indicator: CONECTADO -->
        <div class="flex items-center gap-1.5 px-3 py-1 rounded bg-[#0d281e] border border-emerald-500/40 text-emerald-400 text-xs font-mono font-medium shadow-[0_0_10px_rgba(16,185,129,0.15)]">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>CONECTADO</span>
        </div>

        <!-- ⚙ Config Button (Opens modal rather than taking up screen!) -->
        <button
          class="flex items-center gap-1.5 px-3 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-slate-200 border border-[#30363d] text-xs font-medium transition cursor-pointer"
          @click="showConfigModal = true"
        >
          <span>⚙</span>
          <span>Config</span>
        </button>
      </div>
    </header>

    <!-- ── SECONDARY TAB BAR (Exact tabs: Simple, Creative, Manuscrito, Anchor, Poesía, Galería) ── -->
    <div class="h-10 bg-[#0d1117] border-b border-[#21262d] px-4 flex items-center gap-1">
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition"
        :class="currentTab === 'simple' ? 'bg-[#1f2937] text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'"
        @click="currentTab = 'simple'"
      >
        <span>🎬</span>
        <span>Simple</span>
      </button>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition"
        :class="currentTab === 'creative' ? 'bg-[#1f2937] text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'"
        @click="currentTab = 'creative'"
      >
        <span>🎨</span>
        <span>Creative</span>
      </button>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition"
        :class="currentTab === 'manuscript' ? 'bg-[#1f2937] text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'"
        @click="currentTab = 'manuscript'"
      >
        <span>📝</span>
        <span>Manuscrito</span>
      </button>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition"
        :class="currentTab === 'anchor' ? 'bg-[#1f2937] text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'"
        @click="currentTab = 'anchor'"
      >
        <span>👤</span>
        <span>Anchor</span>
      </button>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition"
        :class="currentTab === 'poetry' ? 'bg-[#1f2937] text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'"
        @click="currentTab = 'poetry'"
      >
        <span>📜</span>
        <span>Poesía</span>
      </button>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition"
        :class="currentTab === 'gallery' ? 'bg-[#1f2937] text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'"
        @click="currentTab = 'gallery'"
      >
        <span>📁</span>
        <span>Galería</span>
      </button>
    </div>

    <!-- ── MAIN CONTENT WORKSPACE ── -->
    <div class="flex-1 flex overflow-hidden">
      <!-- ── LEFT TOOL STRIP (Cyber Rail) ── -->
      <aside class="w-12 bg-[#161b22] border-r border-[#21262d] flex flex-col items-center py-3 gap-3 shrink-0">
        <!-- Tool 1: Document / Script -->
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center transition"
          :class="activeSidebarTool === 'prompt' ? 'bg-[#0e273c] text-sky-400 border border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.3)]' : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]'"
          @click="activeSidebarTool = 'prompt'"
          title="Editor de prompt y guión"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        </button>

        <!-- Tool 2: Magic Wand / AI Generator -->
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center transition"
          :class="activeSidebarTool === 'magic' ? 'bg-[#0e273c] text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]'"
          @click="activeSidebarTool = 'magic'"
          title="Mejora inteligente de prompts"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
        </button>

        <!-- Tool 3: Flow Pipeline -->
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center transition"
          :class="activeSidebarTool === 'flow' ? 'bg-[#0e273c] text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]'"
          @click="activeSidebarTool = 'flow'"
          title="Flujo de generación y nodos"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM9 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
        </button>

        <!-- Tool 4: 3D Camera / Spatial Calibrator -->
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center transition"
          :class="activeSidebarTool === 'camera' ? 'bg-[#0e273c] text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]'"
          @click="activeSidebarTool = 'camera'"
          title="Calibrador espacial 3D"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        </button>

        <!-- Tool 5: Sliders / Settings -->
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center transition"
          :class="activeSidebarTool === 'sliders' ? 'bg-[#0e273c] text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]'"
          @click="activeSidebarTool = 'sliders'"
          title="Parámetros avanzados de render"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
        </button>

        <!-- Tool 6: Aspect / Crop -->
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center transition"
          :class="activeSidebarTool === 'crop' ? 'bg-[#0e273c] text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]'"
          @click="activeSidebarTool = 'crop'"
          title="Encuadre y relaciones de aspecto"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        </button>

        <div class="mt-auto">
          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-[#21262d] transition"
            @click="showConfigModal = true"
            title="Configuración"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>
      </aside>

      <!-- ── IF USER CLICKS OTHER TABS (Creative, Galería, etc.) ── -->
      <main v-if="currentTab === 'gallery'" class="flex-1 overflow-y-auto p-4 bg-[#0d1117]">
        <GalleryPanel />
      </main>

      <main v-else-if="currentTab === 'creative' || currentTab === 'manuscript' || currentTab === 'anchor' || currentTab === 'poetry'" class="flex-1 overflow-y-auto p-6 bg-[#0d1117] flex justify-center">
        <div class="max-w-4xl w-full">
          <CreatePanel />
        </div>
      </main>

      <!-- ── PRIMARY 3-COLUMN CYBER-STUDIO VIEWPORT (Exact match to screenshot) ── -->
      <main v-else class="flex-1 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden p-3 gap-3 bg-[#0d1117]">
        <!-- ── COLUMN 1: CONTROLS & PARAMETERS ── -->
        <section class="w-full xl:w-[480px] shrink-0 bg-[#161b22] border border-[#21262d] rounded-xl p-3.5 flex flex-col gap-3 overflow-y-auto">
          <!-- Prompt Textarea -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <label class="font-medium text-slate-300">Prompt <span class="text-red-400">*</span></label>
              <span class="font-mono text-slate-400 text-[11px]">Token counts: {{ tokenCount }}/1299</span>
            </div>
            <textarea
              v-model="promptText"
              rows="4"
              class="w-full bg-[#0d1117] border border-[#30363d] focus:border-sky-500 rounded-lg p-2.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none leading-relaxed resize-none transition"
              placeholder="Describe detalladamente el video que deseas generar..."
            ></textarea>
          </div>

          <!-- Row: Modelo de video & Modo -->
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] font-medium text-slate-400 mb-1">Modelo de video</label>
              <select
                v-model="selectedVideoModel"
                class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                <option value="config">Modelo configurado (config)</option>
                <option value="agnes-video-v2.0">agnes-video-v2.0 (Predeterminado)</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-medium text-slate-400 mb-1">Modo</label>
              <select
                v-model="videoMode"
                class="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                <option value="i2v">Imagen → Video</option>
                <option value="t2v">Texto → Video</option>
                <option value="ti2vid">Texto e Imagen → Video</option>
                <option value="keyframes">Fotogramas clave (Keyframes)</option>
              </select>
            </div>
          </div>

          <!-- Row: Imagen principal / semilla & Imágenes de referencia -->
          <div class="grid grid-cols-2 gap-2.5">
            <!-- Imagen principal / semilla -->
            <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-2 flex flex-col justify-between">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Imagen principal / semilla</span>
                <span class="text-slate-500 cursor-pointer hover:text-slate-300">✕</span>
              </div>
              <div class="flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs mb-2">
                <span class="text-[10px] text-slate-400 truncate flex-1">{{ selectedSeedImage }}</span>
                <span class="text-[10px] text-slate-500">▼</span>
              </div>
              <div class="flex items-center gap-2">
                <img
                  src="/assets/cinematic_street_scene_1790912918581.jpg"
                  alt="Seed thumbnail"
                  class="w-12 h-10 object-cover rounded border border-[#30363d]"
                />
                <div class="text-[10px] text-slate-400 leading-tight">
                  <div class="font-medium text-slate-300">Detalles</div>
                  <div>Resolución: 1920×1080</div>
                  <div>Tamaño: 1024 KB</div>
                </div>
                <img
                  src="/assets/depth_map_portrait_1790913022571.jpg"
                  alt="Depth preview"
                  class="w-9 h-10 object-cover rounded border border-[#30363d] ml-auto opacity-80"
                />
              </div>
            </div>

            <!-- Imágenes de referencia (hasta 5) -->
            <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-2">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Imágenes de referencia (hasta 5)</span>
                <span class="text-slate-500 cursor-pointer hover:text-slate-300">✕</span>
              </div>
              <div class="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs mb-2 text-slate-400 text-[10px]">
                <span class="flex-1">Elegir archivos: 5 archivos</span>
                <span class="text-[10px] text-slate-500">▼</span>
              </div>
              <div class="grid grid-cols-5 gap-1">
                <div v-for="img in referenceImages" :key="img.id" class="relative group cursor-pointer">
                  <img :src="img.src" :alt="img.name" class="w-full h-10 object-cover rounded border border-[#30363d] group-hover:border-sky-500 transition" />
                  <span class="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-center text-slate-300 truncate px-0.5">{{ img.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Row: Duración & Orientación -->
          <div class="grid grid-cols-2 gap-2.5">
            <!-- Duración -->
            <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-2.5">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                <span>Duración (s)</span>
                <span class="px-1.5 py-0.5 rounded bg-[#1f2937] text-sky-400 font-mono text-[10px] font-semibold">{{ durationSeconds }}s</span>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="durationSeconds"
                  type="range"
                  min="5"
                  max="15"
                  step="5"
                  class="flex-1 accent-sky-400 h-1.5 bg-[#21262d] rounded-lg appearance-none cursor-pointer"
                />
                <span class="text-[10px] font-mono text-slate-400">15s</span>
              </div>
            </div>

            <!-- Orientación -->
            <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-2.5">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                <span>Orientación</span>
                <span class="px-1.5 py-0.5 rounded bg-[#1f2937] text-sky-400 font-mono text-[10px] font-semibold">
                  {{ orientation === 'portrait' ? 'Vertical 9:16' : orientation === 'landscape' ? 'Horizontal 16:9' : 'Cuadrado 1:1' }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex items-center gap-1 flex-1">
                  <button
                    class="px-2 py-1 text-[10px] rounded transition flex-1"
                    :class="orientation === 'portrait' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-[#161b22] text-slate-400 hover:text-slate-200'"
                    @click="orientation = 'portrait'"
                  >9:16</button>
                  <button
                    class="px-2 py-1 text-[10px] rounded transition flex-1"
                    :class="orientation === 'landscape' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-[#161b22] text-slate-400 hover:text-slate-200'"
                    @click="orientation = 'landscape'"
                  >16:9</button>
                  <button
                    class="px-2 py-1 text-[10px] rounded transition flex-1"
                    :class="orientation === 'square' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-[#161b22] text-slate-400 hover:text-slate-200'"
                    @click="orientation = 'square'"
                  >1:1</button>
                </div>
                <span class="text-[10px] font-mono text-slate-400">768X</span>
              </div>
            </div>
          </div>

          <!-- Row: Seed (-1 = aleatorio) & Seed Rotary -->
          <div class="grid grid-cols-2 gap-2.5">
            <!-- Seed Input -->
            <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-2.5">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                <span>Seed (-1 = aleatorio)</span>
                <button class="text-[10px] text-sky-400 hover:underline cursor-pointer" @click="randomizeSeed">🎲 Azar</button>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="seedValue"
                  type="number"
                  class="w-16 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs font-mono text-slate-200"
                />
                <input
                  v-model.number="seedValue"
                  type="range"
                  min="-1"
                  max="99999"
                  class="flex-1 accent-sky-400 h-1.5 bg-[#21262d] rounded appearance-none cursor-pointer"
                />
                <span class="text-[10px] font-mono text-slate-400">1</span>
              </div>
            </div>

            <!-- Seed Rotary / Fine tune -->
            <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-2.5">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                <span>Seed (-1)</span>
                <span class="font-mono text-[10px] text-slate-400">0.000</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-slate-300">-1</span>
                <input
                  v-model.number="seedFineTune"
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  class="flex-1 accent-sky-400 h-1.5 bg-[#21262d] rounded appearance-none cursor-pointer"
                />
                <!-- Tactile rotary knob indicator -->
                <div class="w-6 h-6 rounded-full bg-[#1e2530] border border-[#485466] flex items-center justify-center relative shadow-inner cursor-pointer" title="Perilla giratoria">
                  <div class="w-1 h-2.5 bg-sky-400 rounded-full -translate-y-1"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Conditioning Inputs (Prompt negativo) -->
          <div class="space-y-1">
            <label class="block text-[11px] font-medium text-slate-400">Conditioning Inputs</label>
            <input
              v-model="negativePrompt"
              type="text"
              placeholder="Qué evitar... (ej. borroso, baja calidad, artefactos)"
              class="w-full bg-[#0d1117] border border-[#30363d] focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition"
            />
          </div>

          <!-- Action Buttons Bar (Cyber Bevel Cockpit Styling) -->
          <div class="mt-auto pt-2 grid grid-cols-3 gap-2">
            <!-- ✨ Generar Video -->
            <button
              class="col-span-2 relative group overflow-hidden rounded-xl border border-sky-500/50 bg-gradient-to-r from-sky-600/40 via-blue-600/30 to-sky-700/40 hover:from-sky-500/60 hover:to-blue-600/50 p-[1px] shadow-[0_0_20px_rgba(56,189,248,0.25)] transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              :disabled="isGenerating"
              @click="handleGenerateVideo"
            >
              <div class="h-10 px-4 rounded-[11px] bg-[#111822]/90 flex items-center justify-center gap-2 text-sm font-semibold text-sky-200 group-hover:text-white transition">
                <span v-if="isGenerating" class="animate-spin text-sky-400">◌</span>
                <span v-else class="text-sky-400">✨</span>
                <span>{{ isGenerating ? `Generando (${generationProgress}%)` : 'Generar Video' }}</span>
              </div>
            </button>

            <!-- 👁 Vista previa -->
            <button
              class="col-span-1 rounded-xl border border-[#30363d] hover:border-slate-400 bg-[#161b22] hover:bg-[#21262d] text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition active:scale-[0.99] cursor-pointer"
              @click="handlePreviewClick"
            >
              <span>👁</span>
              <span>Vista previa</span>
            </button>
          </div>
        </section>

        <!-- ── COLUMN 2: CENTER CINEMATIC HUD VIEWFINDER PLAYER ── -->
        <section class="flex-1 min-w-[320px] bg-[#111419] border border-[#21262d] rounded-xl p-3 flex flex-col justify-between relative overflow-hidden">
          <!-- Top HUD Telemetry Bar -->
          <div class="h-7 border-b border-[#21262d] flex items-center justify-between text-[11px] font-mono text-slate-400 px-2 bg-[#161b22]/50 rounded-t-lg">
            <div>Frame rate: <span class="text-slate-200">75%</span></div>
            <div>Generation ID: <span class="text-slate-200">{{ activeGenerationId }}</span></div>
            <div>Time: <span class="text-sky-400">{{ hudTime }}</span></div>
          </div>

          <!-- Viewfinder Frame with Reticle & Video/Scene Preview -->
          <div class="relative flex-1 my-2 bg-black rounded-lg border border-[#262c36] overflow-hidden flex items-center justify-center group">
            <!-- Actual Scene Image or Video Player -->
            <video
              v-if="lastGeneratedVideoUrl"
              ref="videoPlayerRef"
              :src="lastGeneratedVideoUrl"
              class="w-full h-full object-contain"
              loop
              controls
              autoplay
            ></video>
            <img
              v-else
              src="/assets/cinematic_street_scene_1790912918581.jpg"
              alt="Cinematic Viewport Scene"
              class="w-full h-full object-cover select-none"
            />

            <!-- High-Tech Viewfinder Reticle Overlay -->
            <div class="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
              <!-- Top corner brackets -->
              <div class="flex justify-between">
                <div class="w-6 h-6 border-t-2 border-l-2 border-slate-400/40"></div>
                <div class="w-6 h-6 border-t-2 border-r-2 border-slate-400/40"></div>
              </div>

              <!-- Rule of thirds subtle grid lines -->
              <div class="absolute inset-x-0 top-1/3 border-b border-white/10 pointer-events-none"></div>
              <div class="absolute inset-x-0 top-2/3 border-b border-white/10 pointer-events-none"></div>
              <div class="absolute inset-y-0 left-1/3 border-r border-white/10 pointer-events-none"></div>
              <div class="absolute inset-y-0 left-2/3 border-r border-white/10 pointer-events-none"></div>

              <!-- Center Crosshair Reticle -->
              <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none">
                <div class="absolute top-1/2 left-0 right-0 h-[1px] bg-sky-400/50"></div>
                <div class="absolute left-1/2 top-0 bottom-0 w-[1px] bg-sky-400/50"></div>
                <div class="absolute inset-1 rounded-full border border-sky-400/30"></div>
              </div>

              <!-- Bottom corner brackets -->
              <div class="flex justify-between">
                <div class="w-6 h-6 border-b-2 border-l-2 border-slate-400/40"></div>
                <div class="w-6 h-6 border-b-2 border-r-2 border-slate-400/40"></div>
              </div>
            </div>

            <!-- Hover Playback Controls Overlay -->
            <div class="absolute bottom-4 inset-x-6 flex items-center justify-between bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="flex items-center gap-1.5 text-xs text-white hover:text-sky-400 transition"
                @click="toggleVideoPlayback"
              >
                <span>{{ isVideoPlaying ? '❚❚ Pausar' : '▶ Reproducir' }}</span>
              </button>
              <div class="text-[11px] font-mono text-slate-300">
                <span>{{ durationSeconds }}s</span> · <span>{{ resolutionDisplay }}</span>
              </div>
              <a
                v-if="lastGeneratedVideoUrl"
                :href="lastGeneratedVideoUrl"
                download="video_generado.mp4"
                class="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <span>⬇</span> <span>Descargar</span>
              </a>
            </div>
          </div>

          <!-- Bottom HUD Telemetry Bar -->
          <div class="h-7 border-t border-[#21262d] flex items-center justify-between text-[11px] font-mono text-slate-400 px-2 bg-[#161b22]/50 rounded-b-lg">
            <div>Frame: <span class="text-slate-200">10%</span></div>
            <div>Generation ID: <span class="text-slate-300">2019898700 / 3555.png</span></div>
            <div class="text-slate-500">13.14.3.33.033</div>
          </div>
        </section>

        <!-- ── COLUMN 3: SPATIAL TELEMETRY & 3D RADAR INSPECTOR ── -->
        <section class="w-full xl:w-[320px] shrink-0 flex flex-col gap-3">
          <!-- Card 1: 3D Wireframe Mesh & Camera Trajectory -->
          <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-3 flex flex-col flex-1">
            <div class="flex items-center justify-between text-xs text-slate-300 font-medium mb-1">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                <span>3D wireframe mesh</span>
              </div>
              <button class="text-slate-500 hover:text-slate-300 text-xs" title="Expandir">⛶</button>
            </div>
            <div class="text-[10px] font-mono text-slate-400 mb-2">
              <div>Camera trajectory: 0</div>
              <div>Camera trajectory</div>
            </div>

            <!-- Canvas 3D Mesh Grid -->
            <div class="flex-1 bg-[#0d1117] rounded-lg border border-[#21262d] p-1 flex items-center justify-center relative overflow-hidden min-h-[140px]">
              <canvas ref="wireframeCanvasRef" width="280" height="140" class="w-full h-full block"></canvas>

              <!-- Corner Orientation Cube Widget -->
              <div class="absolute bottom-2 right-2 flex flex-col items-center opacity-70">
                <div class="w-6 h-6 border border-slate-500/60 rounded transform rotate-45 flex items-center justify-center text-[7px] font-mono text-slate-400">
                  YZ
                </div>
              </div>
            </div>

            <!-- Camera Geometry Readouts -->
            <div class="mt-2 text-[10px] font-mono text-slate-400 flex items-center justify-between border-t border-[#21262d] pt-2">
              <div>
                <div>Camera geometry</div>
                <div>Rotation: <span class="text-slate-200">33.59°</span></div>
              </div>
              <div class="text-right">
                <div>Trajectory: <span class="text-slate-200">0.00</span></div>
                <div class="text-slate-500">L2 / R0</div>
              </div>
            </div>
          </div>

          <!-- Card 2: GPU load & Latency Radar / Spectral Graph -->
          <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-3 flex flex-col flex-1">
            <div class="flex items-center justify-between text-xs text-slate-300 font-medium mb-1">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>GPU load</span>
              </div>
              <span class="text-[10px] font-mono text-slate-400">90.000</span>
            </div>
            <div class="text-[10px] font-mono text-slate-400 mb-2">
              <div>GPU load: <span class="text-slate-200">42%</span></div>
              <div>Render time estimate: <span class="text-slate-200">4.2s</span></div>
            </div>

            <!-- Canvas Radar Graph -->
            <div class="flex-1 bg-[#0d1117] rounded-lg border border-[#21262d] p-1 flex items-center justify-center relative overflow-hidden min-h-[130px]">
              <canvas ref="radarCanvasRef" width="280" height="130" class="w-full h-full block"></canvas>

              <!-- Coordinate Markers -->
              <div class="absolute top-2 right-2 text-[9px] font-mono text-slate-500">90</div>
              <div class="absolute top-1/2 right-12 text-[9px] font-mono text-slate-500">200.50</div>
              <div class="absolute bottom-6 right-8 text-[9px] font-mono text-slate-500">305.20</div>
            </div>

            <div class="mt-2 text-[9px] font-mono text-slate-500 flex justify-between border-t border-[#21262d] pt-2">
              <span>209.200</span>
              <span>8051.15.15.76.00</span>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- ── BOTTOM STATUS & GENERATION DOCK (Exact match to screenshot) ── -->
    <footer class="h-12 bg-[#161b22] border-t border-[#21262d] px-4 flex items-center justify-between text-xs z-20">
      <div class="flex items-center gap-4">
        <span class="font-medium text-slate-200">Video generado: <span class="font-mono text-sky-400">{{ activeTaskId }}</span></span>
        <div class="hidden sm:flex items-center gap-3 text-slate-400 text-[11px]">
          <span>Tipo: <span class="text-slate-300">simple</span></span>
          <span>·</span>
          <span>Duración: <span class="text-slate-300">{{ durationSeconds }}s</span></span>
          <span>·</span>
          <span>Escenas: <span class="text-slate-300">1</span></span>
          <span>·</span>
          <span>Resolución: <span class="text-slate-300">{{ orientation === 'portrait' ? '768×1152' : orientation === 'landscape' ? '1280×720' : '1024×1024' }}</span></span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div class="px-2.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 text-[11px] font-bold tracking-wider font-mono">
          {{ isGenerating ? 'GENERANDO...' : 'COMPLETADO' }}
        </div>
      </div>
    </footer>

    <!-- ── CLEAN CONFIG MODAL (Prevents asking for Host or confusion with external text provider!) ── -->
    <teleport to="body">
      <div v-if="showConfigModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center justify-between pb-4 border-b border-[#21262d] mb-4">
            <div class="flex items-center gap-2">
              <span class="text-lg">⚙</span>
              <h2 class="text-base font-semibold text-slate-100">Configuración de Agnes Video Generator</h2>
            </div>
            <button
              class="w-7 h-7 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              @click="showConfigModal = false"
            >✕</button>
          </div>

          <!-- Embedded Config Panel -->
          <ConfigPanel />

          <div class="mt-4 pt-3 border-t border-[#21262d] flex justify-end">
            <button
              class="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
              @click="showConfigModal = false"
            >Cerrar configuración</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* Slider styling */
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 14px;
  width: 14px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
}
</style>
