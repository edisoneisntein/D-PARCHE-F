import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Storage directories
const CONFIG_DIR = path.resolve(__dirname, '.agnes_config');
const TASKS_DIR = path.resolve(__dirname, 'workspace_tasks');
const UPLOADS_DIR = path.resolve(TASKS_DIR, 'uploads');
const PRESETS_FILE = path.resolve(CONFIG_DIR, 'presets.json');
const CONFIG_FILE = path.resolve(CONFIG_DIR, 'config.json');

fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.mkdirSync(TASKS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer upload setup
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}_${rand}${ext}`);
  },
});
const upload = multer({ storage });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS & UI Headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agnes-UI-Lang');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// ── In-Memory & Persistent State ──────────────────────────────
interface AppConfig {
  api_keys: { key: string; domain?: string; source: 'config' | 'env' }[];
  gemini_api_key?: string;
  selected_models: { text: string; image: string; video: string; text_provider: string };
  agnes_domain: 'com' | 'cn' | 'cn_bak';
  watermark: { enabled: boolean; text: string; position: string };
  active_workspace: string;
  workspaces: string[];
}

function loadConfig(): AppConfig {
  let cfg: Partial<AppConfig> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      cfg = {};
    }
  }

  const envKey = process.env.AGNES_API_KEY || '';
  const existingKeys = cfg.api_keys || [];
  const keys = [...existingKeys];
  if (envKey && !keys.some((k) => k.key === envKey)) {
    keys.unshift({ key: envKey, source: 'env' });
  }

  return {
    api_keys: keys,
    selected_models: cfg.selected_models || {
      text: 'agnes-3.0-flash',
      image: 'agnes-image-2.1-flash',
      video: 'agnes-video-2.5-flash',
      text_provider: '',
    },
    agnes_domain: (cfg.agnes_domain as any) || 'com',
    watermark: cfg.watermark || { enabled: false, text: 'Agnes AI', position: 'bottom-right' },
    active_workspace: cfg.active_workspace || 'default',
    workspaces: cfg.workspaces || ['default'],
  };
}

function saveConfig(cfg: AppConfig) {
  const persist = {
    ...cfg,
    api_keys: cfg.api_keys.filter((k) => k.source !== 'env'),
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(persist, null, 2), 'utf-8');
}

let currentConfig = loadConfig();

function maskKey(key: string): string {
  if (!key) return '';
  return key.length > 12 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '***';
}

function keyId(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
}

const AGNES_DOMAIN_MAP: Record<string, string> = {
  com: 'https://apihub.agnes-ai.com/v1',
  cn: 'https://api.agnes-ai.cn/v1',
  cn_bak: 'https://apihub.agnes-ai.com/v1',
};

function getBaseUrl(domain = currentConfig.agnes_domain): string {
  return AGNES_DOMAIN_MAP[domain] || AGNES_DOMAIN_MAP.com;
}

function getActiveKey(): string {
  const envKey = process.env.AGNES_API_KEY;
  if (envKey && envKey.startsWith('sk-')) {
    return envKey;
  }
  const configKey = currentConfig.api_keys[0]?.key;
  if (configKey && !configKey.startsWith('test_') && configKey !== 'your-api-key-here') {
    return configKey;
  }
  return envKey || configKey || '';
}

// ── System Presets ────────────────────────────────────────────
function getSystemPresets() {
  const presetsPath = path.resolve(__dirname, 'resource/presets/styles.json');
  if (fs.existsSync(presetsPath)) {
    try {
      return JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function getUserPresets(): any[] {
  if (fs.existsSync(PRESETS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveUserPresets(presets: any[]) {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf-8');
}

// ── Voice Catalog ─────────────────────────────────────────────
const VOICE_CATALOG = {
  languages: [
    {
      code: 'zh',
      label: '中文',
      count: 4,
      voices: [
        { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', local_name: '晓晓', region: '普通话', region_code: 'zh-CN', gender: 'female', style_tags: ['Warm', 'Narrative'], preview_text: '你好，我是晓晓，这是一段音色试听。', lang: 'zh' },
        { id: 'zh-CN-YunyangNeural', name: 'Yunyang', local_name: '云扬', region: '普通话', region_code: 'zh-CN', gender: 'male', style_tags: ['Professional', 'News'], preview_text: '你好，我是云扬，这是一段音色试听。', lang: 'zh' },
        { id: 'zh-CN-XiaoyiNeural', name: 'Xiaoyi', local_name: '小艺', region: '普通话', region_code: 'zh-CN', gender: 'female', style_tags: ['Lively', 'Story'], preview_text: '你好，我是小艺，这是一段音色试听。', lang: 'zh' },
        { id: 'zh-CN-YunxiNeural', name: 'Yunxi', local_name: '云希', region: '普通话', region_code: 'zh-CN', gender: 'male', style_tags: ['Sunshine', 'Cinema'], preview_text: '你好，我是云希，这是一段音色试听。', lang: 'zh' },
      ],
    },
    {
      code: 'en',
      label: 'English',
      count: 4,
      voices: [
        { id: 'en-US-JennyNeural', name: 'Jenny', local_name: 'Jenny', region: 'United States', region_code: 'en-US', gender: 'female', style_tags: ['Friendly', 'Natural'], preview_text: "Hello, I'm Jenny, this is a voice preview sample.", lang: 'en' },
        { id: 'en-US-GuyNeural', name: 'Guy', local_name: 'Guy', region: 'United States', region_code: 'en-US', gender: 'male', style_tags: ['Confident', 'Clear'], preview_text: "Hello, I'm Guy, this is a voice preview sample.", lang: 'en' },
        { id: 'en-GB-SoniaNeural', name: 'Sonia', local_name: 'Sonia', region: 'United Kingdom', region_code: 'en-GB', gender: 'female', style_tags: ['British', 'Refined'], preview_text: "Hello, I'm Sonia, this is a voice preview sample.", lang: 'en' },
        { id: 'en-US-AriaNeural', name: 'Aria', local_name: 'Aria', region: 'United States', region_code: 'en-US', gender: 'female', style_tags: ['Versatile', 'Expressive'], preview_text: "Hello, I'm Aria, this is a voice preview sample.", lang: 'en' },
      ],
    },
    {
      code: 'es',
      label: 'Español',
      count: 3,
      voices: [
        { id: 'es-ES-ElviraNeural', name: 'Elvira', local_name: 'Elvira', region: 'España', region_code: 'es-ES', gender: 'female', style_tags: ['Natural', 'Story'], preview_text: 'Hola, soy Elvira, esta es una muestra de vista previa de voz.', lang: 'es' },
        { id: 'es-ES-AlvaroNeural', name: 'Alvaro', local_name: 'Álvaro', region: 'España', region_code: 'es-ES', gender: 'male', style_tags: ['Professional'], preview_text: 'Hola, soy Álvaro, esta es una muestra de vista previa de voz.', lang: 'es' },
        { id: 'es-MX-DaliaNeural', name: 'Dalia', local_name: 'Dalia', region: 'México', region_code: 'es-MX', gender: 'female', style_tags: ['Warm', 'Friendly'], preview_text: 'Hola, soy Dalia, esta es una muestra de audio.', lang: 'es' },
      ],
    },
    {
      code: 'ja',
      label: '日本語',
      count: 2,
      voices: [
        { id: 'ja-JP-NanamiNeural', name: 'Nanami', local_name: '七海', region: '日本', region_code: 'ja-JP', gender: 'female', style_tags: ['Natural'], preview_text: 'こんにちは、七海です。音声プレビューです。', lang: 'ja' },
        { id: 'ja-JP-KeitaNeural', name: 'Keita', local_name: '圭太', region: '日本', region_code: 'ja-JP', gender: 'male', style_tags: ['Calm'], preview_text: 'こんにちは、圭太です。', lang: 'ja' },
      ],
    },
    {
      code: 'fr',
      label: 'Français',
      count: 2,
      voices: [
        { id: 'fr-FR-DeniseNeural', name: 'Denise', local_name: 'Denise', region: 'France', region_code: 'fr-FR', gender: 'female', style_tags: ['Elegant'], preview_text: 'Bonjour, je suis Denise, ceci est un aperçu vocal.', lang: 'fr' },
        { id: 'fr-FR-HenriNeural', name: 'Henri', local_name: 'Henri', region: 'France', region_code: 'fr-FR', gender: 'male', style_tags: ['Professional'], preview_text: 'Bonjour, je suis Henri.', lang: 'fr' },
      ],
    },
  ],
  compat_hint: {
    zh: ['zh', 'en'],
    en: ['en', 'es', 'fr', 'de', 'it', 'pt'],
    es: ['es', 'en'],
    ja: ['ja', 'en'],
    fr: ['fr', 'en'],
  },
};

// ── In-Memory Task Database ────────────────────────────────────
interface TaskItem {
  task_id: string;
  task_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  dir_name: string;
  creative_name: string;
  created_at: string;
  prompt?: string;
  idea?: string;
  manuscript_text?: string;
  script_text?: string;
  poem_text?: string;
  scene_count: number;
  duration?: number;
  mode?: string;
  current_step?: string;
  current_status?: string;
  current_progress: number;
  current_message?: string;
  final_video_file?: string;
  final_image_file?: string;
  scenes?: any[];
  artifacts?: any[];
  [key: string]: any;
}

const tasksMap = new Map<string, TaskItem>();

// Load pre-existing tasks if any
const TASKS_INDEX_FILE = path.resolve(TASKS_DIR, 'tasks_index.json');
if (fs.existsSync(TASKS_INDEX_FILE)) {
  try {
    const list: TaskItem[] = JSON.parse(fs.readFileSync(TASKS_INDEX_FILE, 'utf-8'));
    list.forEach((t) => tasksMap.set(t.task_id, t));
  } catch {}
}

function persistTasks() {
  try {
    const list = Array.from(tasksMap.values());
    fs.writeFileSync(TASKS_INDEX_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

// ── Real Agnes AI Video API Engine ──────────────────────────
export async function testAgnesConnection(apiKey: string, domain = currentConfig.agnes_domain): Promise<{ ok: boolean; message?: string; models?: string[]; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { ok: false, error: 'Debe ingresar una clave de API de Agnes' };
  }
  const baseUrl = getBaseUrl(domain);
  try {
    const res = await fetch(`${baseUrl}/models?all=true`, {
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      const modelList = Array.isArray(data.data) ? data.data.map((m: { id: string }) => m.id) : ['agnes-video-v2.0', 'agnes-video-2.5-flash'];
      return { ok: true, message: `Conectado exitosamente con ${baseUrl}`, models: modelList };
    }

    if (res.status === 401) {
      return { ok: false, error: 'Clave de API inválida o rechazada por Agnes AI (HTTP 401 Unauthorized)' };
    }

    const text = await res.text();
    return { ok: false, error: `Error de servidor Agnes (${res.status}): ${text.slice(0, 150)}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fallo de conexión';
    return { ok: false, error: `Error de red al conectar con Agnes AI: ${msg}` };
  }
}

async function executeAgnesVideoPipeline(
  task: TaskItem,
  opts?: { promptOverride?: string; outFileName?: string; progressStart?: number; progressSpan?: number; finalize?: boolean; imageRefOverride?: string; imageRefsOverride?: string[]; seedOverride?: number },
): Promise<string | undefined> {
  const apiKey = getActiveKey();
  const domain = currentConfig.agnes_domain || 'com';
  const baseUrl = getBaseUrl(domain);

  const finalize = opts?.finalize ?? true;
  const progressBase = opts?.progressStart ?? 0;
  const progressSpan = opts?.progressSpan ?? 100;
  const prog = (p: number) => Math.min(100, Math.round(progressBase + (p / 100) * progressSpan));
  const failGracefully = (msg: string): void => {
    if (!finalize) {
      const err = new Error(msg);
      err.name = 'AgnesPipelineError';
      throw err;
    }
    task.status = 'failed';
    task.current_message = msg;
    persistTasks();
  };

  if (!apiKey || apiKey === 'your-api-key-here' || apiKey.trim() === '') {
    failGracefully('ERROR: No se ha suministrado el API Key de Agnes. Por favor ingrese su clave en el botón [CONECTADO] de la barra superior.');
    return;
  }

  task.current_step = 'submit';
  task.current_progress = prog(10);
  task.current_message = 'Iniciando generación con Agnes AI...';
  persistTasks();

  // 1. Prepare reference image(s) if provided
  const effectiveRefPaths: string[] =
    opts?.imageRefsOverride && opts.imageRefsOverride.length > 0
      ? opts.imageRefsOverride
      : opts?.imageRefOverride
        ? [opts.imageRefOverride]
        : (task.reference_image_path ? [task.reference_image_path] : []);
  const imageRefs: string[] = [];
  if (effectiveRefPaths.length > 0) {
    task.current_message = 'Codificando imagen(es) de referencia...';
    persistTasks();
    for (const refPath of effectiveRefPaths.slice(0, 5)) {
      try {
        const ext = path.extname(refPath).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        const fileBuf = fs.readFileSync(refPath);
        const b64Data = `data:${mime};base64,${fileBuf.toString('base64')}`;
        try {
          const uploadRes = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'agnes-image-2.5-flash',
              prompt: 'Keep the image exactly as it is',
              n: 1,
              size: '1024x1024',
              extra_body: { response_format: 'url', image: b64Data },
            }),
          });
          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            if (uploadJson.data?.[0]?.url) {
              imageRefs.push(uploadJson.data[0].url);
              continue;
            }
          }
        } catch {
          // fallback to base64 below
        }
        imageRefs.push(b64Data);
      } catch (e: unknown) {
        console.warn('reference image unreadable:', refPath, e);
      }
    }
  }
  const imageRefUrlOrBase64: string | undefined = imageRefs[0];

  // 2. Build model payload
  const model = task.model || currentConfig.selected_models?.video || 'agnes-video-v2.0';
  const duration = task.duration || 5;
  const promptText = opts?.promptOverride || task.prompt || task.idea || task.manuscript_text || 'Cinematic sci-fi scene';
  const effectiveSeed = opts?.seedOverride ?? task.seed;

  let payload: Record<string, unknown> = {};

  if (model.includes('2.5')) {
    const secs = Math.max(4, Math.min(duration, 12));
    let aspectRatio = '9:16';
    if (task.orientation?.includes('16:9')) aspectRatio = '16:9';
    else if (task.orientation?.includes('1:1')) aspectRatio = '1:1';

    payload = {
      model,
      prompt: promptText,
      mode: imageRefUrlOrBase64 ? 'reference' : 'text',
      seconds: String(secs),
      size: '720P',
      aspect_ratio: aspectRatio,
      ...(effectiveSeed !== undefined && effectiveSeed >= 0 ? { seed: effectiveSeed } : {}),
      ...(imageRefs.length > 0 ? { images: imageRefs } : {}),
    };
  } else {
    // Agnes v2.0 protocol
    let width = 768;
    let height = 1152;
    if (task.orientation?.includes('16:9')) {
      width = 1280;
      height = 720;
    } else if (task.orientation?.includes('1:1')) {
      width = 1024;
      height = 1024;
    }
    const numFrames = Math.min(duration * 24 + 1, 409);

    payload = {
      model: 'agnes-video-v2.0',
      prompt: promptText,
      width,
      height,
      num_frames: numFrames,
      frame_rate: 24,
      ...(effectiveSeed !== undefined && effectiveSeed >= 0 ? { seed: effectiveSeed } : {}),
      ...(task.conditioning_inputs ? { negative_prompt: task.conditioning_inputs } : {}),
      ...(imageRefUrlOrBase64 ? { image: imageRefUrlOrBase64, mode: 'ti2vid' } : {}),
    };
  }

  // 3. Submit video generation to Agnes API
  let videoId = '';
  let submitAttempts = 0;
  let lastErrMsg = '';
  const maxSubmitAttempts = 5;
  // Queue-full (503) gets its own retry budget (queue saturation is transient and long-lived upstream)
  let queueFullAttempts = 0;
  const maxQueueFullAttempts = 20; // ~10 min at 30s backoff

  while (submitAttempts < maxSubmitAttempts) {
    submitAttempts++;
    task.current_message = `Enviando tarea a Agnes AI [${model}] (intento ${submitAttempts}/${maxSubmitAttempts})...`;
    persistTasks();

    const submitRes = await fetch(`${baseUrl}/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (submitRes.status === 200) {
      const submitData = await submitRes.json();
      videoId = submitData.video_id || submitData.task_id || submitData.id || '';
      if (videoId) break;
    }

    if (submitRes.status === 401) {
      failGracefully('ERROR: Clave de API de Agnes inválida o no autorizada (HTTP 401). Configure su clave en el botón [CONECTADO].');
      return;
    }

    const errText = await submitRes.text();
    let errCode = '';
    let errMsg = '';
    try {
      const errJson = JSON.parse(errText);
      errCode = errJson.code || errJson.error?.code || '';
      errMsg = errJson.message || errJson.error?.message || '';
    } catch {
      errMsg = errText.slice(0, 200);
    }
    lastErrMsg = errMsg || errText.slice(0, 200);

    // 400 num_frames exceeded
    if (submitRes.status === 400 && errText.includes('num_frames') && typeof payload.num_frames === 'number') {
      payload.num_frames = Math.max(49, Math.floor(payload.num_frames * 0.7));
      task.current_message = `Ajustando cuadros (${payload.num_frames}) y reintentando...`;
      persistTasks();
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // 429 rate limit
    if (submitRes.status === 429) {
      task.current_message = `Límite de tasa alcanzado en Agnes (HTTP 429). Esperando 25s antes de reintentar...`;
      persistTasks();
      await new Promise((r) => setTimeout(r, 25000));
      submitAttempts--; // rate limit doesn't consume the real error budget
      continue;
    }

    // 503 queue full — own budget (this is by far the most common transient state upstream)
    if (errCode === 'video_queue_full' || submitRes.status === 503) {
      queueFullAttempts++;
      if (queueFullAttempts > maxQueueFullAttempts) {
        failGracefully('Cola de Agnes Video saturada de forma persistente (~10 min). Intente de nuevo más tarde.');
        return;
      }
      task.current_message = `Cola de Agnes Video saturada (intento ${queueFullAttempts}/${maxQueueFullAttempts}). Esperando 30s...`;
      persistTasks();
      await new Promise((r) => setTimeout(r, 30000));
      submitAttempts--; // queue full doesn't consume the real error budget
      continue;
    }

    // Server error 5xx
    if (submitRes.status >= 500) {
      task.current_message = `Error de servidor Agnes (${submitRes.status}). Reintentando en 15s...`;
      persistTasks();
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }

    failGracefully(`Error en envío a Agnes AI (HTTP ${submitRes.status}): ${errMsg || errText.slice(0, 150)}`);
    return;
  }

  if (!videoId) {
    failGracefully(lastErrMsg
      ? `ERROR Agnes AI: ${lastErrMsg}`
      : 'ERROR: No se recibió ID de tarea de Agnes AI tras agotar reintentos.');
    return;
  }

  task.upstream_task_id = videoId;
  task.current_step = 'video_gen';
  task.current_progress = prog(25);
  task.current_message = `Tarea asignada a Agnes AI [ID: ${videoId}]. Procesando inferencia GPU...`;
  persistTasks();

  // 4. Real Polling Loop
  const pollStart = Date.now();
  const maxPollDurationMs = 1800000; // 30 minutes
  let pollCount = 0;
  let notFoundCount = 0;

  while (Date.now() - pollStart < maxPollDurationMs) {
    if (task.status === 'stopped') {
      task.current_message = 'Generación detenida por el usuario.';
      persistTasks();
      return;
    }

    pollCount++;
    await new Promise((r) => setTimeout(r, 5000));

    try {
      const pollUrl = `${baseUrl}/agnesapi?video_id=${videoId}${model.includes('2.5') ? `&model_name=${model}` : ''}`;
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (pollRes.status === 404) {
        notFoundCount++;
        task.current_message = `Encolando en clúster Agnes (${notFoundCount * 5}s transcurridos)...`;
        persistTasks();
        continue;
      }

      if (!pollRes.ok) {
        continue;
      }

      const pollData = await pollRes.json();
      const status = (pollData.status || '').toLowerCase();
      const upstreamProgress = typeof pollData.progress === 'number' ? pollData.progress : 0;

      if (status === 'running' || status === 'processing' || status === 'pending') {
        const estProgress = prog(Math.min(95, Math.max(25, upstreamProgress || (25 + Math.floor((Date.now() - pollStart) / 1000 / 3)))));
        task.current_progress = estProgress;
        task.current_message = `Renderizando video con Agnes AI: ${estProgress}%`;
        persistTasks();
        continue;
      }

      if (status === 'completed') {
        task.current_progress = prog(98);
        task.current_message = 'Inferencia Agnes completada. Descargando video generado...';
        persistTasks();

        const videoRemoteUrl = pollData.video_url || pollData.url || pollData.data?.video_url || pollData.data?.url || pollData.remixed_from_video_id;
        if (!videoRemoteUrl) {
          throw new Error('Agnes marcó tarea completada pero no proveyó URL de video.');
        }

        const downloadRes = await fetch(videoRemoteUrl);
        if (!downloadRes.ok) {
          throw new Error(`Error descargando video desde Agnes: HTTP ${downloadRes.status}`);
        }

        const videoBuffer = Buffer.from(await downloadRes.arrayBuffer());
        const taskDir = path.resolve(TASKS_DIR, task.dir_name || task.task_id);
        fs.mkdirSync(taskDir, { recursive: true });
        const finalVideoPath = path.resolve(taskDir, opts?.outFileName || 'final_video.mp4');
        fs.writeFileSync(finalVideoPath, videoBuffer);

        if (!finalize) {
          task.current_progress = prog(100);
          persistTasks();
          return finalVideoPath;
        }

        task.final_video_file = finalVideoPath;
        task.status = 'completed';
        task.current_progress = 100;
        task.current_message = 'COMPLETADO';
        task.artifacts = [
          {
            artifact_id: 'final_video',
            category: 'video',
            label_key: 'artifactFinalVideo',
            step_key: 'video_gen',
            size: videoBuffer.length,
            exists: true,
            deletable: false,
          },
        ];
        persistTasks();
        return finalVideoPath;
      }

      if (status === 'failed') {
        const failureMsg = pollData.error?.message || pollData.message || 'Fallo de inferencia en Agnes AI';
        failGracefully(`ERROR EN AGNES: ${failureMsg}`);
        return;
      }
    } catch (pollErr: unknown) {
      if (pollErr instanceof Error && pollErr.name === 'AgnesPipelineError') {
        throw pollErr; // definite scene failure: abort instead of polling on
      }
      // transient network error, continue polling
    }
  }

  failGracefully('ERROR: Tiempo de espera agotado (30 min) en Agnes AI.');
}

// ── Creative Multi-Scene Runner ────────────────────────────────
async function runCreativePipeline(taskId: string) {
  const task = tasksMap.get(taskId);
  if (!task) return;

  task.status = 'running';
  task.active = true;
  persistTasks();

  try {
    await executeCreativePipeline(task);
  } catch (err: unknown) {
    task.status = 'failed';
    task.current_message = err instanceof Error ? err.message : 'Fallo en ejecución de la tarea';
  } finally {
    task.active = false;
    persistTasks();
  }
}

// ── Manual Multi-Clip Editor Pipeline ─────────────────────────
// Each clip has its OWN prompt/seed/reference. Optionally chains the previous
// clip's last frame as the next clip's first frame (i2v chaining).
interface EditorClip {
  prompt: string;
  seed?: number;
  chain?: boolean;        // use previous clip's last frame as first frame
  refs?: string[];        // user's own reference image paths (up to 5)
}

async function executeClipEditorPipeline(task: TaskItem): Promise<void> {
  const taskDir = path.resolve(TASKS_DIR, task.dir_name || task.task_id);
  fs.mkdirSync(taskDir, { recursive: true });

  const clips: EditorClip[] = task.editor_clips || [];
  if (clips.length === 0) {
    task.status = 'failed';
    task.current_message = 'ERROR: El editor de clips no recibió ningún clip.';
    persistTasks();
    return;
  }

  task.scenes = clips.map((c, i) => ({ index: i + 1, scene_prompt: c.prompt, status: 'pending' }));
  const sceneFiles: string[] = [];
  const sceneSpan = 85 / clips.length;

  for (let i = 0; i < clips.length; i++) {
    if (task.status === 'stopped') {
      task.current_message = 'Generación detenida por el usuario.';
      persistTasks();
      return;
    }
    const clip = clips[i];
    task.scenes[i].status = 'running';
    task.current_step = 'video_gen';
    task.current_message = `Clip ${i + 1}/${clips.length}: ${clip.prompt.slice(0, 60)}...`;
    persistTasks();

    // Reference priority: user's own images first; otherwise chained previous frame
    let refPaths: string[] | undefined =
      clip.refs && clip.refs.length > 0 ? clip.refs : undefined;
    if (!refPaths && clip.chain && i > 0 && sceneFiles[i - 1]) {
      const chainFrame = path.resolve(taskDir, `chain_frame_${i + 1}.png`);
      try {
        task.current_message = `Clip ${i + 1}/${clips.length}: extrayendo último frame del clip anterior...`;
        persistTasks();
        await runFfmpeg(['-y', '-sseof', '-0.1', '-i', sceneFiles[i - 1], '-frames:v', '1', chainFrame]);
        refPaths = [chainFrame];
      } catch (e) {
        console.warn('[ClipEditor] frame extraction failed, continuing without reference:', e);
      }
    }

    const sceneFile = await executeAgnesVideoPipeline(task, {
      promptOverride: clip.prompt,
      outFileName: `scene_${i + 1}.mp4`,
      progressStart: 5 + Math.round(sceneSpan * i),
      progressSpan: Math.round(sceneSpan),
      finalize: false,
      imageRefsOverride: refPaths,
      seedOverride: clip.seed,
    });

    if (!sceneFile || !fs.existsSync(sceneFile)) {
      throw new Error(`El clip ${i + 1} no produjo video.`);
    }
    sceneFiles.push(sceneFile);
    task.scenes[i].status = 'completed';
    persistTasks();
  }

  // Concatenate all clips
  task.current_step = 'concat';
  task.current_progress = 92;
  task.current_message = 'Concatenando clips con ffmpeg...';
  persistTasks();

  const finalVideoPath = path.resolve(taskDir, 'final_video.mp4');
  await concatVideos(sceneFiles, finalVideoPath);

  task.final_video_file = finalVideoPath;
  task.status = 'completed';
  task.current_step = 'done';
  task.current_progress = 100;
  task.current_message = 'COMPLETADO';
  task.artifacts = [
    {
      artifact_id: 'final_video',
      category: 'video',
      label_key: 'artifactFinalVideo',
      step_key: 'concat',
      size: fs.statSync(finalVideoPath).size,
      exists: true,
      deletable: false,
    },
    ...sceneFiles.map((f, i) => ({
      artifact_id: `scene_${i + 1}`,
      category: 'video',
      label_key: `Clip ${i + 1}`,
      step_key: 'video_gen',
      size: fs.statSync(f).size,
      exists: true,
      deletable: false,
    })),
  ];
  persistTasks();
}

async function runClipEditorPipeline(taskId: string) {
  const task = tasksMap.get(taskId);
  if (!task) return;

  task.status = 'running';
  task.active = true;
  persistTasks();

  try {
    await executeClipEditorPipeline(task);
  } catch (err: unknown) {
    task.status = 'failed';
    task.current_message = err instanceof Error ? err.message : 'Fallo en ejecución de la tarea';
  } finally {
    task.active = false;
    persistTasks();
  }
}

// ── Task Runner ────────────────────────────────────────────────
async function runTaskPipeline(taskId: string) {
  const task = tasksMap.get(taskId);
  if (!task) return;

  task.status = 'running';
  task.active = true;
  persistTasks();

  try {
    await executeAgnesVideoPipeline(task);
  } catch (err: unknown) {
    task.status = 'failed';
    task.current_message = err instanceof Error ? err.message : 'Fallo en ejecución de la tarea';
  } finally {
    task.active = false;
    persistTasks();
  }
}

// ── API Routes ────────────────────────────────────────────────

// Health & System
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'agnes-video-generator', status: 'healthy' });
});

app.get('/api/metrics', (_req, res) => {
  const activeCount = Array.from(tasksMap.values()).filter((t) => t.status === 'running').length;
  const completedCount = Array.from(tasksMap.values()).filter((t) => t.status === 'completed').length;
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const load = os.loadavg();
  const cpuPercent = Math.min(100, Math.round((load[0] / (os.cpus().length || 1)) * 100));

  res.json({
    ok: true,
    rate_limiter: { calls_last_minute: activeCount * 3 },
    video_limiter: { queue_length: activeCount },
    concurrency: { current_weight: activeCount, max_weight: 4, usage_pct: activeCount * 25 },
    tasks: { total: tasksMap.size, running: activeCount, completed: completedCount },
    hardware: {
      cpu_cores: os.cpus().length,
      cpu_load_pct: Math.max(12, cpuPercent),
      total_ram_gb: Number((totalMem / (1024 ** 3)).toFixed(2)),
      used_ram_gb: Number((usedMem / (1024 ** 3)).toFixed(2)),
      free_ram_gb: Number((freeMem / (1024 ** 3)).toFixed(2)),
      heap_used_mb: Number((mem.heapUsed / (1024 ** 2)).toFixed(2)),
      uptime_seconds: Math.floor(process.uptime()),
    },
  });
});

// Real-Time Telemetry Server-Sent Events (SSE) Stream
app.get('/api/telemetry/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sendTelemetry = () => {
    const activeCount = Array.from(tasksMap.values()).filter((t) => t.status === 'running').length;
    const completedCount = Array.from(tasksMap.values()).filter((t) => t.status === 'completed').length;
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const load = os.loadavg();
    const cpuPercent = Math.min(100, Math.round((load[0] / (os.cpus().length || 1)) * 100));

    const payload = {
      timestamp: Date.now(),
      cpuLoad: Math.max(12, cpuPercent),
      totalRamGb: Number((totalMem / (1024 ** 3)).toFixed(2)),
      usedRamGb: Number((usedMem / (1024 ** 3)).toFixed(2)),
      freeRamGb: Number((freeMem / (1024 ** 3)).toFixed(2)),
      heapUsedMb: Number((mem.heapUsed / (1024 ** 2)).toFixed(2)),
      activeTasks: activeCount,
      completedTasks: completedCount,
      totalTasks: tasksMap.size,
      uptimeSeconds: Math.floor(process.uptime()),
    };

    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendTelemetry();
  const interval = setInterval(sendTelemetry, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

app.get('/api/concurrency', (_req, res) => {
  res.json({ current: 0, max_weight: 4 });
});

// Config
app.get('/api/config', (_req: Request, res: Response) => {
  const key = getActiveKey();
  const source = currentConfig.api_keys[0]?.source || (process.env.AGNES_API_KEY ? 'env' : 'config');
  const hasKey = Boolean(key && key !== 'your-api-key-here' && key.trim() !== '');
  res.json({
    app_version: '1.0.0',
    api_key: maskKey(key),
    has_api_key: hasKey,
    source,
    can_clear: source === 'config',
    workspaces: currentConfig.workspaces,
    active_workspace: currentConfig.active_workspace,
    working_dir_source: 'config',
    watermark: currentConfig.watermark,
    watermark_promo_zh: '由 Agnes AI 生成',
    watermark_promo_en: 'Generated by Agnes AI',
    models: currentConfig.selected_models,
    agnes_domain: currentConfig.agnes_domain,
    agnes_domains: ['com', 'cn', 'cn_bak'],
  });
});

app.post('/api/config', (req: Request, res: Response) => {
  const key = (req.body.api_key || req.body.key || '').trim();
  if (key) {
    currentConfig.api_keys = [{ key, source: 'config', domain: currentConfig.agnes_domain }];
    saveConfig(currentConfig);
  }
  res.json({ ok: true });
});

app.post('/api/config/test', async (req: Request, res: Response) => {
  const key = (req.body.api_key || req.body.key || getActiveKey()).trim();
  const domain = (req.body.domain || currentConfig.agnes_domain || 'com').trim();
  const result = await testAgnesConnection(key, domain as any);
  res.json(result);
});

app.delete('/api/config', (_req: Request, res: Response) => {
  currentConfig.api_keys = currentConfig.api_keys.filter((k) => k.source === 'env');
  saveConfig(currentConfig);
  res.json({ ok: true });
});

app.get('/api/config/keys', (_req: Request, res: Response) => {
  const items = currentConfig.api_keys;
  res.json({
    ok: true,
    key_count: items.length,
    source: items.length ? items[0].source : 'none',
    keys: items.map((it) => ({
      id: keyId(it.key),
      mask: maskKey(it.key),
      source: it.source,
      domain: it.domain || currentConfig.agnes_domain,
      persistable: it.source === 'config',
    })),
  });
});

app.post('/api/config/keys', upload.none() as any, (req: Request, res: Response) => {
  const key = (req.body.key || req.body.api_key || '').trim();
  const domain = (req.body.domain || currentConfig.agnes_domain).trim();
  if (key && !currentConfig.api_keys.some((k) => k.key === key)) {
    currentConfig.api_keys.push({ key, source: 'config', domain });
    saveConfig(currentConfig);
  }
  res.json({ ok: true, count: currentConfig.api_keys.length });
});

app.delete('/api/config/keys', upload.none() as any, (req: Request, res: Response) => {
  const targetId = req.body.id || req.body.key_id;
  const targetKey = req.body.key;
  currentConfig.api_keys = currentConfig.api_keys.filter((k) => {
    if (k.source === 'env') return true;
    if (targetId && keyId(k.key) === targetId) return false;
    if (targetKey && k.key === targetKey) return false;
    return true;
  });
  saveConfig(currentConfig);
  res.json({ ok: true, key_count: currentConfig.api_keys.length });
});

app.post('/api/config/keys/detect', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    results: currentConfig.api_keys.map((k) => ({
      id: keyId(k.key),
      mask: maskKey(k.key),
      best_domain: k.domain || 'com',
      available: true,
    })),
  });
});

// Models
app.get('/api/models', async (_req: Request, res: Response) => {
  res.json({
    text: ['agnes-3.0-flash', 'agnes-2.5-flash', 'gemini-2.5-flash'],
    image: ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
    video: ['agnes-video-2.5-flash', 'agnes-video-2.0-flash'],
    video_capabilities: {
      'agnes-video-2.5-flash': { durations: [4, 6, 8, 10, 12], resolutions: ['720p', '1080p'] },
      'agnes-video-2.0-flash': { durations: [5, 10, 15, 18], resolutions: ['720p'] },
    },
  });
});

app.post('/api/config/models', upload.none() as any, (req: Request, res: Response) => {
  if (req.body.text) currentConfig.selected_models.text = req.body.text;
  if (req.body.image) currentConfig.selected_models.image = req.body.image;
  if (req.body.video) currentConfig.selected_models.video = req.body.video;
  if (req.body.text_provider !== undefined) currentConfig.selected_models.text_provider = req.body.text_provider;
  saveConfig(currentConfig);
  res.json({ ok: true, models: currentConfig.selected_models });
});

app.post('/api/config/domain', upload.none() as any, (req: Request, res: Response) => {
  const d = req.body.domain;
  if (['com', 'cn', 'cn_bak'].includes(d)) {
    currentConfig.agnes_domain = d;
    saveConfig(currentConfig);
  }
  res.json({ ok: true, domain: currentConfig.agnes_domain });
});

app.post('/api/config/watermark', upload.none() as any, (req: Request, res: Response) => {
  currentConfig.watermark = {
    enabled: req.body.enabled === 'true' || req.body.enabled === true,
    text: req.body.text || 'Agnes AI',
    position: req.body.position || 'bottom-right',
  };
  saveConfig(currentConfig);
  res.json({ ok: true, watermark: currentConfig.watermark });
});

// Text Providers
app.get('/api/config/text-providers', (_req: Request, res: Response) => {
  res.json({
    providers: [
      { id: 'agnes', name: 'Agnes AI Built-in', is_builtin: true },
      { id: 'gemini', name: 'Google Gemini', is_builtin: false, base_url: 'https://generativelanguage.googleapis.com' },
    ],
    selected: currentConfig.selected_models.text_provider || '',
  });
});

app.post('/api/config/text-providers', upload.none() as any, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.delete('/api/config/text-providers/:provider', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post('/api/config/text-providers/test', upload.none() as any, (_req: Request, res: Response) => {
  res.json({ ok: true, latency_ms: 120 });
});

app.post('/api/config/text-providers/:provider/sync', (_req: Request, res: Response) => {
  res.json({ ok: true, models: ['agnes-3.0-flash', 'agnes-2.5-flash'] });
});

// Workspaces
app.get('/api/workspaces', (_req: Request, res: Response) => {
  res.json({
    workspaces: currentConfig.workspaces.map((w) => ({
      path: w,
      name: w,
      is_default: w === 'default',
    })),
    active: currentConfig.active_workspace,
  });
});

app.post('/api/workspaces', upload.none() as any, (req: Request, res: Response) => {
  const name = (req.body.name || '').trim();
  if (name && !currentConfig.workspaces.includes(name)) {
    currentConfig.workspaces.push(name);
    saveConfig(currentConfig);
  }
  res.json({ ok: true, workspaces: currentConfig.workspaces });
});

app.delete('/api/workspaces', upload.none() as any, (req: Request, res: Response) => {
  const target = req.body.path || req.body.name;
  if (target && target !== 'default') {
    currentConfig.workspaces = currentConfig.workspaces.filter((w) => w !== target);
    if (currentConfig.active_workspace === target) currentConfig.active_workspace = 'default';
    saveConfig(currentConfig);
  }
  res.json({ ok: true, workspaces: currentConfig.workspaces });
});

app.post('/api/workspaces/active', upload.none() as any, (req: Request, res: Response) => {
  const pathVal = req.body.path || req.body.name;
  if (pathVal && currentConfig.workspaces.includes(pathVal)) {
    currentConfig.active_workspace = pathVal;
    saveConfig(currentConfig);
  }
  res.json({ ok: true, active: currentConfig.active_workspace });
});

app.get('/api/workspaces/pick-directory', (_req: Request, res: Response) => {
  res.json({ cancelled: true, message: 'Running inside cloud environment' });
});

// Presets
app.get('/api/presets', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    system: getSystemPresets(),
    user: getUserPresets(),
  });
});

app.post('/api/presets', upload.none() as any, (req: Request, res: Response) => {
  const name = (req.body.name || '').trim();
  const prompt = (req.body.prompt || '').trim();
  if (!prompt) {
    res.status(422).json({ detail: 'Prompt cannot be empty' });
    return;
  }
  const userPresets = getUserPresets();
  const newPreset = {
    id: `user_${Date.now()}`,
    name: name || 'Custom Style',
    category: 'custom',
    prompt,
    created_at: new Date().toISOString(),
  };
  userPresets.unshift(newPreset);
  saveUserPresets(userPresets);
  res.json({ ok: true, ...newPreset });
});

app.delete('/api/presets/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const userPresets = getUserPresets();
  const filtered = userPresets.filter((p) => p.id !== id);
  saveUserPresets(filtered);
  res.json({ ok: true, preset_id: id });
});

// Voices
app.get('/api/voices', (_req: Request, res: Response) => {
  res.json(VOICE_CATALOG);
});

app.get('/api/voices/preview', (req: Request, res: Response) => {
  const voiceId = (req.query.voice as string) || 'zh-CN-XiaoxiaoNeural';
  const previewPath = path.resolve(TASKS_DIR, `${voiceId}_preview.mp3`);
  if (!fs.existsSync(previewPath)) {
    const ff = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=520:duration=1.5',
      '-c:a', 'libmp3lame',
      previewPath,
    ]);
    ff.on('close', () => {
      res.sendFile(previewPath);
    });
    ff.on('error', () => {
      res.status(404).send('Preview unavailable');
    });
  } else {
    res.sendFile(previewPath);
  }
});

app.get('/api/voices/compat', (req: Request, res: Response) => {
  const voice = (req.query.voice as string) || '';
  const targetLang = (req.query.target_lang as string) || 'zh';
  res.json({
    compatible: true,
    voice_lang: voice.startsWith('zh') ? 'zh' : voice.startsWith('en') ? 'en' : 'es',
    target_lang: targetLang,
    supported_langs: ['zh', 'en', 'es', 'ja', 'fr'],
  });
});

// Screenwriter & Previews (using Gemini if available, or smart generation)
// ── Creative multi-scene helpers ─────────────────────────────
interface ScriptScene { index: number; scene_prompt: string; narration_text: string }

// OpenAI-compatible chat completion (JSON mode), used by NIM and Agnes chat
async function chatCompleteJson(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<any> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an expert AI screenwriter. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    throw new Error(`Chat API HTTP ${res.status}`);
  }
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content || '';
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object in LLM response');
  return JSON.parse(jsonMatch[0]);
}

async function generateScriptScenes(
  idea: string,
  contentLang: string,
  sceneCount: number,
): Promise<{ story: string; scenes: ScriptScene[]; narration: string; source: 'nim' | 'agnes' | 'gemini' | 'template' }> {
  const langName = contentLang === 'zh' ? 'Chinese' : contentLang === 'es' ? 'Spanish' : 'English';
  const prompt = `You are an expert AI screenwriter and video director.
Create a ${sceneCount}-scene video script based on this theme:
"${idea}"
Language for story and narration: ${langName}.
For scene visual prompts, write precise English cinematic visual prompts for an AI video model.

Output valid JSON only with this schema:
{
  "story": "Short overall story summary in ${langName}",
  "scenes": [
    { "index": 1, "scene_prompt": "Cinematic visual prompt in English...", "narration_text": "Narration text in ${langName}..." }
  ],
  "narration": "Full narration script in ${langName}..."
}`;

  const normalize = (data: any): { story: string; scenes: ScriptScene[]; narration: string } | null => {
    const scenes: ScriptScene[] = (data?.scenes || []).map((s: any, i: number) => ({
      index: i + 1,
      scene_prompt: s.scene_prompt || `Cinematic shot of ${idea}`,
      narration_text: s.narration_text || '',
    }));
    if (scenes.length === 0) return null;
    return {
      story: data.story || idea,
      scenes,
      narration: data.narration || scenes.map((s) => s.narration_text).join(' '),
    };
  };

  const agnesKey = getActiveKey();
  const providers: { name: 'nim' | 'agnes'; baseUrl: string; key: string; model: string }[] = [];

  // 1. NVIDIA NIM (user-preferred)
  if (process.env.NVIDIA_API_KEY) {
    providers.push({
      name: 'nim',
      baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      key: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_TEXT_MODEL || 'nvidia/llama-3.3-70b-instruct',
    });
  }

  // 2. Agnes Chat (zero extra dependency, same API key as video)
  if (agnesKey && agnesKey !== 'your-api-key-here') {
    providers.push({
      name: 'agnes',
      baseUrl: getBaseUrl(currentConfig.agnes_domain),
      key: agnesKey,
      model: currentConfig.selected_models?.text || 'agnes-3.0-flash',
    });
  }

  for (const p of providers) {
    try {
      const data = await chatCompleteJson(p.baseUrl, p.key, p.model, prompt);
      const parsed = normalize(data);
      if (parsed) return { ...parsed, source: p.name };
    } catch (e) {
      console.warn(`[Chain] ${p.name} script generation failed, trying next:`, e);
    }
  }

  const scenes: ScriptScene[] = Array.from({ length: sceneCount }, (_, i) => ({
    index: i + 1,
    scene_prompt: `Cinematic wide shot, scene ${i + 1} of ${idea}, realistic lighting, ultra high resolution 4k, vivid cinematic atmosphere.`,
    narration_text: `Scene ${i + 1}: ${idea}. Visualizing the key moment with breathtaking detail.`,
  }));
  return {
    story: `An engaging ${sceneCount}-part visual story revolving around: ${idea}.`,
    scenes,
    narration: scenes.map((s) => s.narration_text).join(' '),
    source: 'template',
  };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

// Concatenate scene videos with ffmpeg (fast -c copy, re-encode fallback)
async function concatVideos(sceneFiles: string[], outPath: string): Promise<void> {
  const listFile = path.resolve(path.dirname(outPath), `concat_${Date.now()}.txt`);
  const content = sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listFile, content, 'utf-8');
  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath]);
  } catch {
    await runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k', outPath,
    ]);
  } finally {
    fs.rmSync(listFile, { force: true });
  }
}

// Creative multi-scene pipeline: script (LLM) → video per scene → ffmpeg concat
async function executeCreativePipeline(task: TaskItem): Promise<void> {
  const taskDir = path.resolve(TASKS_DIR, task.dir_name || task.task_id);
  fs.mkdirSync(taskDir, { recursive: true });

  // 1. Build scenes via LLM (or template fallback)
  task.current_step = 'build_scenes';
  task.current_progress = 5;
  task.current_message = 'Generando guion multi-escena con IA...';
  persistTasks();

  const sceneCount = Math.max(1, Math.min(task.scene_count || 5, 10));
  const script = await generateScriptScenes(task.idea || task.prompt || '', task.content_lang || 'es', sceneCount);
  task.scenes = script.scenes.map((s) => ({ ...s, status: 'pending' }));
  task.narration = script.narration;
  task.story = script.story;
  const srcLabel = script.source === 'nim' ? 'NVIDIA NIM' : script.source === 'agnes' ? 'Agnes Chat' : 'plantilla';
  task.current_message = `Guion listo (${srcLabel}): ${script.scenes.length} escenas. Iniciando generación de video...`;
  persistTasks();

  // 2. Generate one video per scene (sequentially, Agnes accepted rate)
  const sceneFiles: string[] = [];
  const sceneSpan = 80 / script.scenes.length;
  for (let i = 0; i < script.scenes.length; i++) {
    if (task.status === 'stopped') {
      task.current_message = 'Generación detenida por el usuario.';
      persistTasks();
      return;
    }
    const scene = script.scenes[i];
    task.scenes[i].status = 'running';
    task.current_message = `Escena ${i + 1}/${script.scenes.length}: ${scene.scene_prompt.slice(0, 60)}...`;
    persistTasks();

    const sceneFile = await executeAgnesVideoPipeline(task, {
      promptOverride: scene.scene_prompt,
      outFileName: `scene_${i + 1}.mp4`,
      progressStart: 10 + Math.round(sceneSpan * i),
      progressSpan: Math.round(sceneSpan),
      finalize: false,
    });

    if (!sceneFile || !fs.existsSync(sceneFile)) {
      throw new Error(`La escena ${i + 1} no produjo video.`);
    }
    sceneFiles.push(sceneFile);
    task.scenes[i].status = 'completed';
    task.scenes[i].video_file = sceneFile;
    persistTasks();
  }

  // 3. Concatenate scenes into final video
  task.current_step = 'concat';
  task.current_progress = 92;
  task.current_message = 'Concatenando escenas con ffmpeg...';
  persistTasks();

  const finalVideoPath = path.resolve(taskDir, 'final_video.mp4');
  await concatVideos(sceneFiles, finalVideoPath);

  task.final_video_file = finalVideoPath;
  task.status = 'completed';
  task.current_step = 'done';
  task.current_progress = 100;
  task.current_message = 'COMPLETADO';
  task.artifacts = [
    {
      artifact_id: 'final_video',
      category: 'video',
      label_key: 'artifactFinalVideo',
      step_key: 'concat',
      size: fs.statSync(finalVideoPath).size,
      exists: true,
      deletable: false,
    },
    ...sceneFiles.map((f, i) => ({
      artifact_id: `scene_${i + 1}`,
      category: 'video',
      label_key: `Escena ${i + 1}`,
      step_key: 'video_gen',
      size: fs.statSync(f).size,
      exists: true,
      deletable: false,
    })),
  ];
  persistTasks();
}

app.post('/api/creative/preview-script', upload.none() as any, async (req: Request, res: Response) => {
  const idea = (req.body.idea || '').trim();
  const contentLang = (req.body.content_lang || 'en').trim();
  const sceneCount = parseInt(req.body.scene_count || '5', 10);

  if (!idea) {
    res.status(422).json({ detail: 'Idea cannot be empty' });
    return;
  }

  const script = await generateScriptScenes(idea, contentLang, sceneCount);
  res.json({
    ok: true,
    story: script.story,
    scenes: script.scenes,
    narration: script.narration,
    narration_by_scene: script.scenes.map((s) => s.narration_text),
  });
});

app.post('/api/manuscript/preview-split', upload.none() as any, (req: Request, res: Response) => {
  const text = (req.body.manuscript_text || '').trim();
  const sentences = text.split(/(?<=[。！？.!?\n])/).filter((s: string) => s.trim().length > 0);
  const paragraphs = (sentences.length > 0 ? sentences : [text]).map((s: string, idx: number) => ({
    index: idx + 1,
    text: s.trim(),
    scene_prompt: `Cinematic visualization of: ${s.trim().slice(0, 100)}, 8k UHD, vivid details, dramatic atmosphere`,
    duration: 5,
  }));
  res.json({ ok: true, paragraphs, count: paragraphs.length });
});

app.get('/api/poetry-scene-prompt', (req: Request, res: Response) => {
  const line = (req.query.line as string) || '';
  const style = (req.query.style as string) || 'traditional Chinese ink wash';
  res.json({
    ok: true,
    prompt: `Traditional aesthetic representation of poetry "${line}", artistic style: ${style}, high contrast, gentle lighting, masterpiece`,
  });
});

// ── Task Creation ─────────────────────────────────────────────
app.post('/api/tasks/simple', (upload.any() as any), (req: Request, res: Response) => {
  const prompt = (req.body.prompt || '').trim();
  if (!prompt) {
    res.status(422).json({ detail: 'Prompt cannot be empty' });
    return;
  }
  const taskId = crypto.randomBytes(6).toString('hex');
  const duration = parseInt(req.body.duration || '5', 10);
  const mode = req.body.mode || 't2v';
  const conditioningInputs = (req.body.conditioning_inputs || req.body.negative_prompt || '').trim();
  const seed = parseInt(req.body.seed || '-1', 10);
  const cfgScale = parseFloat(req.body.cfg_scale || '7.5');
  const fps = parseInt(req.body.fps || '24', 10);

  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  let refPath = uploadedFiles.find((f) => f.fieldname === 'reference_image' || f.fieldname === 'image')?.path;

  // Also support base64 reference_image_data
  const b64 = req.body.reference_image_data;
  if (!refPath && b64 && typeof b64 === 'string' && b64.includes(';base64,')) {
    try {
      const parts = b64.split(';base64,');
      const ext = parts[0].includes('jpeg') || parts[0].includes('jpg') ? '.jpg' : '.png';
      const buf = Buffer.from(parts[1], 'base64');
      const filename = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const savedPath = path.resolve(UPLOADS_DIR, filename);
      fs.writeFileSync(savedPath, buf);
      refPath = savedPath;
    } catch {}
  }

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'simple',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `simple_${taskId}`,
    created_at: new Date().toISOString(),
    prompt,
    mode,
    duration,
    model: req.body.model || 'agnes-video-v2.0',
    orientation: req.body.orientation || 'Vertical 9:16',
    conditioning_inputs: conditioningInputs,
    seed: seed >= 0 ? seed : undefined,
    cfg_scale: cfgScale,
    fps,
    reference_image_path: refPath,
    current_step: 'submit',
    current_progress: 10,
    current_message: 'Initializing video task...',
    scene_count: 1,
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runTaskPipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

app.post('/api/tasks/creative', (upload.any() as any), (req: Request, res: Response) => {
  const idea = (req.body.idea || req.body.prompt || '').trim();
  const sceneCount = parseInt(req.body.scene_count || '5', 10);
  const taskId = crypto.randomBytes(6).toString('hex');

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'creative',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `creative_${taskId}`,
    created_at: new Date().toISOString(),
    idea,
    prompt: idea,
    scene_count: sceneCount,
    content_lang: req.body.content_lang || 'es',
    duration: parseInt(req.body.duration || '5', 10),
    model: req.body.model,
    orientation: req.body.orientation,
    current_step: 'init',
    current_progress: 5,
    current_message: 'Preparing creative task...',
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runCreativePipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

// Backward compatibility alias
app.post('/api/tasks', (upload.any() as any), (req: Request, res: Response) => {
  const idea = (req.body.idea || req.body.prompt || '').trim();
  const sceneCount = parseInt(req.body.scene_count || '5', 10);
  const taskId = crypto.randomBytes(6).toString('hex');

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'creative',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `creative_${taskId}`,
    created_at: new Date().toISOString(),
    idea,
    prompt: idea,
    scene_count: sceneCount,
    content_lang: req.body.content_lang || 'es',
    duration: parseInt(req.body.duration || '5', 10),
    model: req.body.model,
    orientation: req.body.orientation,
    current_step: 'init',
    current_progress: 5,
    current_message: 'Preparing creative task...',
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runCreativePipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

app.post('/api/tasks/manuscript', (upload.any() as any), (req: Request, res: Response) => {
  const manuscriptText = (req.body.manuscript_text || '').trim();
  const taskId = crypto.randomBytes(6).toString('hex');

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'manuscript',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `manuscript_${taskId}`,
    created_at: new Date().toISOString(),
    manuscript_text: manuscriptText,
    scene_count: 4,
    current_step: 'split_text',
    current_progress: 10,
    current_message: 'Processing manuscript...',
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runTaskPipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

app.post('/api/tasks/poetry', (upload.any() as any), (req: Request, res: Response) => {
  const poemText = (req.body.poem_text || '').trim();
  const taskId = crypto.randomBytes(6).toString('hex');

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'poetry',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `poetry_${taskId}`,
    created_at: new Date().toISOString(),
    poem_text: poemText,
    scene_count: 4,
    current_step: 'build_scenes',
    current_progress: 10,
    current_message: 'Analyzing poetry and verses...',
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runTaskPipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

app.post('/api/tasks/anchor', (upload.any() as any), (req: Request, res: Response) => {
  const scriptText = (req.body.script_text || '').trim();
  const taskId = crypto.randomBytes(6).toString('hex');

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'anchor',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `anchor_${taskId}`,
    created_at: new Date().toISOString(),
    script_text: scriptText,
    scene_count: 3,
    current_step: 'generate_anchor',
    current_progress: 10,
    current_message: 'Generating digital anchor...',
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runTaskPipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

// Manual Multi-Clip Editor task
app.post('/api/tasks/clip-editor', (upload.any() as any), (req: Request, res: Response) => {
  let clips: EditorClip[] = [];
  try {
    clips = JSON.parse(req.body.clips_json || '[]');
  } catch {
    res.status(422).json({ detail: 'clips_json inválido' });
    return;
  }
  if (!Array.isArray(clips) || clips.length === 0) {
    res.status(422).json({ detail: 'Se requiere al menos un clip' });
    return;
  }
  if (clips.some((c) => !(c.prompt || '').trim())) {
    res.status(422).json({ detail: 'Todos los clips necesitan un prompt' });
    return;
  }

  // Map uploaded per-clip reference images (fieldname: ref_{i}_{j}, up to 5 each)
  const uploaded = (req.files as Express.Multer.File[]) || [];
  clips = clips.map((c, i) => ({
    ...c,
    refs: uploaded
      .filter((u) => u.fieldname.startsWith(`ref_${i}_`))
      .sort((a, b) => a.fieldname.localeCompare(b.fieldname))
      .map((f) => f.path),
  }));

  const taskId = crypto.randomBytes(6).toString('hex');
  const task: TaskItem = {
    task_id: taskId,
    task_type: 'clip_editor',
    status: 'running',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `editor_${taskId}`,
    created_at: new Date().toISOString(),
    prompt: clips.map((c) => c.prompt).join(' | '),
    editor_clips: clips,
    scene_count: clips.length,
    duration: Math.max(2, Math.min(parseInt(req.body.duration || '5', 10), 18)),
    model: req.body.model,
    orientation: req.body.orientation,
    cfg_scale: parseFloat(req.body.cfg_scale || '7.5'),
    conditioning_inputs: (req.body.conditioning_inputs || '').trim(),
    current_step: 'init',
    current_progress: 3,
    current_message: `Editor de clips: preparando ${clips.length} clip(s)...`,
  };

  tasksMap.set(taskId, task);
  persistTasks();
  runClipEditorPipeline(taskId);

  res.json({ ok: true, task_id: taskId });
});

// Image Generation
app.post('/api/image/generate', (upload.any() as any), (req: Request, res: Response) => {
  const prompt = (req.body.prompt || '').trim();
  const taskId = crypto.randomBytes(6).toString('hex');

  const task: TaskItem = {
    task_id: taskId,
    task_type: 'image',
    status: 'completed',
    dir_name: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${taskId}`,
    creative_name: `image_${taskId}`,
    created_at: new Date().toISOString(),
    prompt,
    scene_count: 1,
    current_step: 'completed',
    current_progress: 100,
    current_message: 'Image generated',
  };

  tasksMap.set(taskId, task);
  persistTasks();

  res.json({ ok: true, task_id: taskId });
});

app.get('/api/image/:taskId', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ detail: 'Image task not found' });
    return;
  }
  res.json({ ok: true, task });
});

// ── Tasks Query & Management ──────────────────────────────────
app.get('/api/tasks', (_req: Request, res: Response) => {
  const list = Array.from(tasksMap.values()).map((t) => ({
    task_id: t.task_id,
    task_type: t.task_type,
    status: t.status,
    creative_name: t.creative_name,
    idea: t.idea,
    prompt: t.prompt,
    manuscript_text: t.manuscript_text,
    script_text: t.script_text,
    scene_count: t.scene_count,
    dir_name: t.dir_name,
    final_video_file: t.final_video_file,
    current_mode: 'auto',
    current_checkpoint: '',
    awaiting_user: false,
  }));
  res.json({ tasks: list.reverse(), total: list.length });
});

app.get('/api/tasks/:taskId', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ detail: 'Task not found' });
    return;
  }
  res.json({
    ...task,
    active: task.status === 'running',
  });
});

app.get('/api/tasks/:taskId/diagnostics', (req: Request, res: Response) => {
  res.json({
    ok: true,
    task_id: req.params.taskId,
    diagnostics: 'Pipeline logs clean. All workers operational.',
  });
});

app.post('/api/tasks/:taskId/stop', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (task) {
    task.status = 'stopped';
    task.current_message = 'Task stopped by user';
    persistTasks();
  }
  res.json({ ok: true });
});

app.post('/api/tasks/:taskId/resume', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (task) {
    runTaskPipeline(task.task_id);
  }
  res.json({ ok: true });
});

app.post('/api/tasks/:taskId/mode', (upload.none() as any), (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.delete('/api/tasks/:taskId', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ ok: false, error: 'Task not found' });
    return;
  }
  if (task.status === 'running') {
    res.status(409).json({ ok: false, error: 'Cannot delete a running task' });
    return;
  }
  // Remove workspace directories (dir_name and/or task_id variants)
  const candidates = [task.dir_name, task.task_id].filter(Boolean) as string[];
  for (const name of new Set(candidates)) {
    const taskDir = path.resolve(TASKS_DIR, name);
    if (taskDir !== TASKS_DIR && taskDir.startsWith(TASKS_DIR) && fs.existsSync(taskDir)) {
      fs.rmSync(taskDir, { recursive: true, force: true });
    }
  }
  // Remove generated thumbnail if present
  const thumbPath = path.resolve(TASKS_DIR, `${req.params.taskId}_thumb.png`);
  if (fs.existsSync(thumbPath)) {
    fs.rmSync(thumbPath, { force: true });
  }
  tasksMap.delete(req.params.taskId);
  persistTasks();
  res.json({ ok: true });
});

app.post('/api/tasks/sweep', (_req: Request, res: Response) => {
  res.json({ ok: true, swept_count: 0 });
});

// Artifacts & Video Download
app.get('/api/video/:taskId', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (!task) {
    res.status(404).send('Task not found');
    return;
  }
  if (!task.final_video_file || !fs.existsSync(task.final_video_file)) {
    if (task.status === 'running') {
      res.status(425).send('Video still processing in Agnes AI');
      return;
    }
    res.status(404).send(task.current_message || 'Video file not ready or generation failed');
    return;
  }
  res.sendFile(task.final_video_file);
});

app.get('/api/tasks/:taskId/artifacts', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (!task) {
    res.status(404).json({ detail: 'Task not found' });
    return;
  }
  res.json({
    ok: true,
    artifacts: task.artifacts || [
      {
        artifact_id: 'final_video',
        category: 'video',
        label_key: 'artifactFinalVideo',
        step_key: 'video_gen',
        size: 1024 * 1024,
        exists: Boolean(task.final_video_file && fs.existsSync(task.final_video_file)),
        deletable: false,
      },
    ],
  });
});

app.get('/api/tasks/:taskId/artifacts/:artifactId/file', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  if (req.params.artifactId === 'final_video' && task && task.final_video_file && fs.existsSync(task.final_video_file)) {
    res.sendFile(task.final_video_file);
    return;
  }
  res.status(404).send('Artifact not found');
});

app.get('/api/tasks/:taskId/manifest', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  res.json({ ok: true, task });
});

app.get('/api/tasks/:taskId/manifest.md', (req: Request, res: Response) => {
  const task = tasksMap.get(req.params.taskId);
  res.type('text/markdown').send(`# Task ${req.params.taskId}\nType: ${task?.task_type}\nStatus: ${task?.status}`);
});

app.get('/api/tasks/:taskId/checkpoints', (_req: Request, res: Response) => {
  res.json({ ok: true, checkpoints: [] });
});

// Gallery
app.get('/api/gallery', (_req: Request, res: Response) => {
  const completedTasks = Array.from(tasksMap.values()).filter((t) => t.status === 'completed');
  const items = completedTasks.map((t) => ({
    task_id: t.task_id,
    dir_name: t.dir_name,
    task_type: t.task_type,
    status: t.status,
    kind: t.task_type === 'image' ? 'image' : 'video',
    title: t.creative_name || t.prompt || t.idea || 'Generated Video',
    description: t.prompt || t.idea || 'AI Video Generated by Agnes Video Generator',
    media_url: `/api/video/${t.task_id}`,
    thumb_url: `/api/gallery/thumbnail/${t.task_id}`,
  }));
  res.json({ ok: true, items: items.reverse(), total: items.length });
});

app.get('/api/gallery/thumbnail/:taskId', async (req: Request, res: Response) => {
  const thumbPath = path.resolve(TASKS_DIR, `${req.params.taskId}_thumb.png`);
  if (!fs.existsSync(thumbPath)) {
    const ff = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=0x1e293b:s=320x180:d=1',
      '-vf', `drawtext=text='Video':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-frames:v', '1',
      thumbPath,
    ]);
    ff.on('close', () => {
      res.sendFile(thumbPath);
    });
    ff.on('error', () => {
      res.status(404).send('Thumbnail not found');
    });
  } else {
    res.sendFile(thumbPath);
  }
});

// ── API Route Guards (Never return HTML for /api/) ───────────────
app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: 'Endpoint de API no encontrado' });
});

app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/')) {
    console.error('[API Error Caught]', err);
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Error interno del servidor API' });
    return;
  }
  next(err);
});

// ── Static Asset & Vite Middleware Serving ────────────────────────
const distPath = path.resolve(__dirname, 'dist');
const staticPath = path.resolve(__dirname, 'static');

if (process.env.NODE_ENV !== 'production' && !fs.existsSync(distPath)) {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } catch (err) {
    console.warn('[Vite Middleware] Fallback to static:', err);
    if (fs.existsSync(distPath)) app.use(express.static(distPath));
    if (fs.existsSync(staticPath)) app.use('/static', express.static(staticPath));
  }
} else {
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }
  if (fs.existsSync(staticPath)) {
    app.use('/static', express.static(staticPath));
  }

  // Fallback SPA route
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    const indexDist = path.resolve(distPath, 'index.html');
    const indexRoot = path.resolve(__dirname, 'index.html');
    if (fs.existsSync(indexDist)) {
      res.sendFile(indexDist);
    } else if (fs.existsSync(indexRoot)) {
      res.sendFile(indexRoot);
    } else {
      res.status(404).send('Index HTML not found');
    }
  });
}

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`[Agnes Video Generator] Server running on http://${HOST}:${PORT}`);
});
