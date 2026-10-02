import { create } from 'zustand';
import { 
  PipelineStatus, 
  HardwareTelemetry, 
  CameraGeometry,
  TaskState
} from '../contracts/schemas';
import { VideoApiClient } from '../services/videoApiClient';

export interface ImageDetails {
  filename: string;
  resolution: string;
  sizeMb: string;
}

export interface VideoStoreState {
  // ── Inference Hyperparameters ──
  prompt: string;
  conditioningInputs: string;
  model: string;
  mode: 't2v' | 'i2v' | 'ti2vid' | 'keyframes';
  duration: number;
  orientation: string;
  resolutionText: string;
  seed: number;
  cfgScale: number;
  fps: number;

  // ── Dual Ingestion (Binary references + Depth) ──
  referenceImage: string;
  depthMapUrl: string;
  referenceImageFile: File | null;
  referenceImages: string[];
  referenceImageFiles: File[];
  imageDetails: ImageDetails;

  // ── Pipeline Finite State Machine (FSM) ──
  activeTaskId: string;
  pipelineStatus: PipelineStatus;
  isProcessing: boolean;
  renderProgress: number;
  currentStepMessage: string;
  videoUrl: string | null;
  errorMessage: string | null;

  // ── Telemetry & Spatial Geometry ──
  telemetry: HardwareTelemetry;
  cameraGeometry: CameraGeometry;

  // ── Atomic Actions ──
  setParam: <K extends keyof VideoStoreState>(key: K, value: VideoStoreState[K]) => void;
  setReferenceFile: (file: File, objectUrl: string, depthMapUrl: string, details: ImageDetails) => void;
  setMultiReferenceFiles: (files: File[], urls: string[]) => void;
  updateTelemetry: (data: Partial<HardwareTelemetry>) => void;
  updateCameraGeometry: (data: Partial<CameraGeometry>) => void;
  executeGeneration: () => Promise<void>;
  stopGeneration: () => Promise<void>;
  previewScript: () => Promise<void>;
  setCompletedVideo: (url: string, taskId: string) => void;
  resetPipeline: () => void;
}

let activeAbortController: AbortController | null = null;
let activePollingInterval: ReturnType<typeof setInterval> | null = null;

// Initial state constants
const initialPrompt = `rigid ghost forward and 900 - 2i00 ponytail canvas ceer bamd höarit, ACTION first, fieme reolere ocicoa Saan Asalan shaets eek SScm reverse aripta voer Saok divun tipwin dria-cn ckien eepanding ficss, itonu, mlie Sdem aee osie foit tridoy, AtiTjOft noction: l'ds snap coovant bar estending to fully black Soo vs eotherity shoot, AGTION iwenice 1.3e anap temvem to oest ty cald on coilkst luift Vêclta. Baek km Este ee entrer ib y ye'scoif) ly PrbnoT0b, AUDIC Aodkz affibilro[1000 ye Eoklér to pronel liile . NESATIVE no wsditbrode brioge chape scer ver nat oor oat`;

export const useVideoStore = create<VideoStoreState>((set, get) => ({
  prompt: initialPrompt,
  conditioningInputs: 'blurry, low quality, artifacts, temporal jitter, flickering, deformed limbs',
  model: 'agnes-video-v2.0',
  mode: 'i2v',
  duration: 15,
  orientation: 'Vertical 9:16',
  resolutionText: '768×1152',
  seed: -1,
  cfgScale: 7.5,
  fps: 24,

  referenceImage: '',
  depthMapUrl: '',
  referenceImageFile: null,
  referenceImages: [],
  referenceImageFiles: [],
  imageDetails: {
    filename: 'videoframe_3555.png',
    resolution: '1920×1080',
    sizeMb: '102.79 MB',
  },

  activeTaskId: 'simple_628611bd600',
  pipelineStatus: 'IDLE',
  isProcessing: false,
  renderProgress: 0,
  currentStepMessage: 'MOTOR EN ESPERA',
  videoUrl: null,
  errorMessage: null,

  telemetry: {
    timestamp: Date.now(),
    cpuLoad: 24,
    totalRamGb: 4.0,
    usedRamGb: 0.52,
    freeRamGb: 3.48,
    heapUsedMb: 48.2,
    activeTasks: 0,
    completedTasks: 0,
    totalTasks: 0,
    uptimeSeconds: 0,
    gpuUtilization: 68,
  },

  cameraGeometry: {
    yaw: 33.59,
    pitch: 0.0,
    roll: 0.0,
    trajectory: 1.0,
  },

  setParam: (key, value) => {
    set((state) => ({ ...state, [key]: value }));
  },

  setReferenceFile: (file, objectUrl, depthMapUrl, details) => {
    const current = get().referenceImage;
    if (current && current.startsWith('blob:')) {
      URL.revokeObjectURL(current);
    }
    set({
      referenceImage: objectUrl,
      depthMapUrl,
      referenceImageFile: file,
      imageDetails: details,
    });
  },

  setMultiReferenceFiles: (files, urls) => {
    const prev = get().referenceImages;
    prev.forEach((u) => {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    });
    set({
      referenceImages: urls,
      referenceImageFiles: files,
    });
  },

  updateTelemetry: (data) => {
    set((state) => ({
      telemetry: { ...state.telemetry, ...data },
    }));
  },

  updateCameraGeometry: (data) => {
    set((state) => ({
      cameraGeometry: { ...state.cameraGeometry, ...data },
    }));
  },

  executeGeneration: async () => {
    const state = get();
    if (state.isProcessing) return;

    // Abort previous controllers if lingering
    if (activeAbortController) {
      activeAbortController.abort();
    }
    if (activePollingInterval) {
      clearInterval(activePollingInterval);
      activePollingInterval = null;
    }

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    set({
      pipelineStatus: 'SUBMITTING',
      isProcessing: true,
      renderProgress: 10,
      currentStepMessage: 'ENVIANDO TAREA A AGNES CLOUD...',
      videoUrl: null,
      errorMessage: null,
    });

    try {
      const formData = new FormData();
      formData.append('prompt', state.prompt);
      formData.append('mode', state.mode);
      formData.append('duration', String(state.duration));
      formData.append('model', state.model);
      formData.append('cfg_scale', String(state.cfgScale));
      formData.append('seed', String(state.seed));
      formData.append('fps', String(state.fps));
      formData.append('conditioning_inputs', state.conditioningInputs);
      formData.append('orientation', state.orientation);

      if (state.referenceImageFile) {
        formData.append('reference_image', state.referenceImageFile);
      }

      const taskId = await VideoApiClient.submitTask(formData, signal);
      set({
        activeTaskId: taskId,
        pipelineStatus: 'RUNNING',
        currentStepMessage: `INFERENCIA EN CURSO [ID: ${taskId.slice(0, 10)}]`,
        renderProgress: 20,
      });

      // Polling loop with AbortSignal checking
      activePollingInterval = setInterval(async () => {
        if (signal.aborted) {
          if (activePollingInterval) clearInterval(activePollingInterval);
          return;
        }

        try {
          const taskData: TaskState = await VideoApiClient.getTaskState(taskId, signal);

          set({
            renderProgress: taskData.current_progress,
            currentStepMessage: taskData.current_message || 'PROCESANDO CUADROS...',
          });

          if (taskData.status === 'completed') {
            if (activePollingInterval) clearInterval(activePollingInterval);
            activePollingInterval = null;
            set({
              pipelineStatus: 'COMPLETED',
              isProcessing: false,
              renderProgress: 100,
              currentStepMessage: 'COMPLETADO',
              videoUrl: `/api/video/${taskId}`,
            });
          } else if (taskData.status === 'failed') {
            if (activePollingInterval) clearInterval(activePollingInterval);
            activePollingInterval = null;
            set({
              pipelineStatus: 'FAILED',
              isProcessing: false,
              currentStepMessage: taskData.current_message || 'FALLO DE INFERENCIA',
              errorMessage: taskData.current_message || 'Inferencia detenida por error en el servidor',
            });
          } else if (taskData.status === 'stopped') {
            if (activePollingInterval) clearInterval(activePollingInterval);
            activePollingInterval = null;
            set({
              pipelineStatus: 'STOPPED',
              isProcessing: false,
              currentStepMessage: 'GENERACIÓN DETENIDA',
            });
          }
        } catch (pollErr: unknown) {
          if (signal.aborted) return;
        }
      }, 1000);
    } catch (err: unknown) {
      if (signal.aborted) {
        set({
          pipelineStatus: 'STOPPED',
          isProcessing: false,
          currentStepMessage: 'GENERACIÓN CANCELADA',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Error en la solicitud';
      set({
        pipelineStatus: 'FAILED',
        isProcessing: false,
        currentStepMessage: `ERROR: ${msg}`,
        errorMessage: msg,
      });
    }
  },

  stopGeneration: async () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (activePollingInterval) {
      clearInterval(activePollingInterval);
      activePollingInterval = null;
    }

    const { activeTaskId } = get();
    if (activeTaskId) {
      await VideoApiClient.stopTask(activeTaskId);
    }

    set({
      pipelineStatus: 'STOPPED',
      isProcessing: false,
      currentStepMessage: 'GENERACIÓN DETENIDA POR EL USUARIO',
    });
  },

  previewScript: async () => {
    const state = get();
    if (state.isProcessing) return;

    set({ isProcessing: true, currentStepMessage: 'GENERANDO VISTA PREVIA...' });
    try {
      const res = await fetch('/api/creative/preview-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: state.prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        set({
          currentStepMessage: `VISTA PREVIA: ${data.scenes?.length || 1} ESCENAS GENERADAS`,
        });
      }
    } catch {
      set({ currentStepMessage: 'ERROR EN VISTA PREVIA' });
    } finally {
      set({ isProcessing: false });
    }
  },

  setCompletedVideo: (url: string, taskId: string) => {
    set({
      videoUrl: url,
      activeTaskId: taskId,
      pipelineStatus: 'COMPLETED',
      renderProgress: 100,
      currentStepMessage: 'COMPLETADO',
    });
  },

  resetPipeline: () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (activePollingInterval) {
      clearInterval(activePollingInterval);
      activePollingInterval = null;
    }
    set({
      pipelineStatus: 'IDLE',
      isProcessing: false,
      renderProgress: 0,
      currentStepMessage: 'MOTOR EN ESPERA',
      videoUrl: null,
      errorMessage: null,
    });
  },
}));
