import { z } from 'zod';

// ── 1. Finite State Machine (FSM) Lifecycle ────────────────────
export const PipelineStatusEnum = z.enum([
  'IDLE',
  'SUBMITTING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'STOPPED',
]);
export type PipelineStatus = z.infer<typeof PipelineStatusEnum>;

// ── 2. Inference Directives & Diffusers Payload Schema ──────────
export const VideoGenerationRequestSchema = z.object({
  prompt: z.string().min(1, 'El prompt no puede estar vacío').max(2000),
  conditioning_inputs: z.string().optional().default(''),
  mode: z.enum(['t2v', 'i2v', 'ti2vid', 'keyframes']).default('t2v'),
  duration: z.number().int().min(2).max(18).default(15),
  model: z.string().default('agnes-video-v2.0'),
  cfg_scale: z.number().min(1.0).max(15.0).default(7.5),
  seed: z.number().int().min(-1).max(99999999).default(-1),
  fps: z.number().int().min(12).max(60).default(24),
  orientation: z.string().optional().default('Vertical 9:16'),
  reference_image_path: z.string().optional(),
});
export type VideoGenerationRequest = z.infer<typeof VideoGenerationRequestSchema>;

// ── 3. Task State & Lifecycle Response Schema ───────────────────
export const TaskArtifactSchema = z.object({
  artifact_id: z.string(),
  category: z.string(),
  label_key: z.string(),
  step_key: z.string(),
  size: z.number(),
  exists: z.boolean(),
  deletable: z.boolean(),
});
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;

export const TaskStateSchema = z.object({
  task_id: z.string(),
  task_type: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'stopped']),
  dir_name: z.string().optional(),
  creative_name: z.string().optional(),
  created_at: z.string().optional(),
  prompt: z.string().optional(),
  mode: z.string().optional(),
  duration: z.number().optional(),
  current_step: z.string().optional(),
  current_progress: z.number().min(0).max(100).default(0),
  current_message: z.string().optional(),
  final_video_file: z.string().optional(),
  upstream_task_id: z.string().optional(),
  artifacts: z.array(TaskArtifactSchema).optional(),
});
export type TaskState = z.infer<typeof TaskStateSchema>;

// ── 4. Real-Time Hardware Telemetry Schema ──────────────────────
export const HardwareTelemetrySchema = z.object({
  timestamp: z.number(),
  cpuLoad: z.number(),
  totalRamGb: z.number(),
  usedRamGb: z.number(),
  freeRamGb: z.number(),
  heapUsedMb: z.number(),
  activeTasks: z.number(),
  completedTasks: z.number(),
  totalTasks: z.number(),
  uptimeSeconds: z.number(),
  gpuUtilization: z.number().optional().default(64),
});
export type HardwareTelemetry = z.infer<typeof HardwareTelemetrySchema>;

// ── 5. Spatial Matrix & Camera Geometry Schema ─────────────────
export const CameraGeometrySchema = z.object({
  yaw: z.number(),
  pitch: z.number(),
  roll: z.number(),
  trajectory: z.number(),
});
export type CameraGeometry = z.infer<typeof CameraGeometrySchema>;

// ── 6. System Configuration State Schema ───────────────────────
export const ConfigResponseSchema = z.object({
  app_version: z.string(),
  api_key: z.string(),
  has_api_key: z.boolean(),
  source: z.string(),
  can_clear: z.boolean(),
  workspaces: z.array(z.string()),
  active_workspace: z.string(),
  watermark: z.object({
    enabled: z.boolean(),
    text: z.string(),
    position: z.string(),
  }),
  models: z.record(z.string(), z.string()),
  agnes_domain: z.string(),
  agnes_domains: z.array(z.string()),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;
