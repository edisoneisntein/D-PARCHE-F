# Especificación Técnica: Conditioning Inputs & Inferencia de Video

Este documento detalla la especificación de comunicación cliente-servidor para la transmisión de parámetros de condicionamiento (`Conditioning Inputs`), restricciones negativas y mapas de profundidad hacia el motor de inferencia en **Agnes Video Generator**.

---

## 1. Endpoint de Creación de Tarea (`POST /api/tasks/simple`)

- **URL:** `/api/tasks/simple`
- **Método:** `POST`
- **Content-Type:** `multipart/form-data` (recomendado con archivos) o `application/json`

### Parámetros de Solicitud (Request Payload)

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `prompt` | `string` | **Sí** | Directiva textual positiva para la generación cinemática. Longitud recomendada: 10 - 1280 tokens. |
| `conditioning_inputs` | `string` | No | Restricciones de condicionamiento / prompt negativo (p. ej.: desenfoque, distorsión, baja resolución, pérdida de coherencia temporal). |
| `mode` | `string` | **Sí** | Modo de síntesis: `t2v` (texto a video), `i2v` (imagen a video), `ti2vid` (texto + imagen), `keyframes`. |
| `duration` | `integer` | No | Duración en segundos del video (rango: 2 a 18 s). Predeterminado: `15`. |
| `model` | `string` | No | Modelo neuronal seleccionado (`agnes-video-2.5-flash`, `agnes-video-2.0-flash`). |
| `cfg_scale` | `float` | No | Escala de guía de clasificador libre (CFG Guidance Scale). Rango: `1.0` a `15.0`. Predeterminado: `7.5`. |
| `seed` | `integer` | No | Semilla estocástica para reproducibilidad. `-1` para aleatorio. Rango: `-1` a `99999999`. |
| `fps` | `integer` | No | Tasa de cuadros por segundo de salida. Predeterminado: `24`. |
| `reference_image` | `file` (binario) | No | Archivo de imagen de referencia semilla (`image/png`, `image/jpeg`). |
| `reference_image_data` | `string` (base64) | No | Alternativa en base64 cuando se envía como JSON. |

---

## 2. Ejemplo de Petición (cURL)

```bash
curl -X POST http://localhost:3000/api/tasks/simple \
  -F "prompt=rigid ghost forward and 900 - 2i00 ponytail canvas ceer bamd höarit, ACTION first" \
  -F "conditioning_inputs=blurry, low quality, artifacts, temporal jitter, flickering" \
  -F "mode=i2v" \
  -F "duration=15" \
  -F "cfg_scale=7.5" \
  -F "seed=42918" \
  -F "fps=24" \
  -F "reference_image=@/ruta/a/videoframe_3555.png"
```

### Respuesta Exitosa (`200 OK`)

```json
{
  "ok": true,
  "task_id": "628611bd600"
}
```

---

## 3. Consulta de Estado en Tiempo Real (`GET /api/tasks/{taskId}`)

- **URL:** `/api/tasks/:taskId`
- **Método:** `GET`

### Respuesta de Polling (`200 OK`)

```json
{
  "task_id": "628611bd600",
  "task_type": "simple",
  "status": "running", // "pending" | "running" | "completed" | "failed"
  "current_step": "submit",
  "current_progress": 68,
  "current_message": "SYNTHESIZING_TEMPORAL_CONVOLUTIONS",
  "final_video_file": "/workspace_tasks/628611bd600/final_video.mp4"
}
```

---

## 4. Transmisión de Telemetría por Server-Sent Events (`GET /api/telemetry/stream`)

- **URL:** `/api/telemetry/stream`
- **Protocolo:** HTTP Server-Sent Events (`text/event-stream`)
- **Frecuencia:** 1000 ms

### Payload del Evento

```json
{
  "timestamp": 1790913700000,
  "cpuLoad": 28,
  "totalRamGb": 16.0,
  "usedRamGb": 6.4,
  "freeRamGb": 9.6,
  "heapUsedMb": 128.4,
  "activeTasks": 1,
  "completedTasks": 4,
  "totalTasks": 5,
  "uptimeSeconds": 1420
}
```

---

## 5. Visualización 3D y Depth Maps

El frontend proyecta los mapas de profundidad (`Depth Maps`) en una malla tridimensional utilizando **Three.js (WebGL)**:
1. La imagen cargada se analiza píxel a píxel extrayendo la luminancia ponderada $Y = 0.299R + 0.587G + 0.114B$.
2. Se genera la textura de mapa de profundidad `DEPTH_Z` con corrección de perspectiva.
3. Se desplazan los vértices de una geometría plana (`THREE.PlaneGeometry`) en el eje Y en tiempo real.
4. Los vectores de trayectoria y geometría de cámara (`Camera Geometry` y `Camera Trajectory`) se actualizan interactivamente mediante rotación orbital con arrastre del cursor.
