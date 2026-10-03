import React, { useRef, useState, useMemo } from 'react';
import { 
  Sparkles, 
  Eye, 
  ChevronDown, 
  X, 
  FolderOpen,
  Sliders,
  AlertTriangle,
  Square,
  FileCode,
  ShieldAlert
} from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import { analyzeTokens } from '../utils/tokenizer';

// Compute real depth map from an image element using luminance & depth grading
function computeDepthMapFromImage(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const w = 120;
  const h = 90;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const depthFactor = (y / h) * 0.4 + 0.6;
      const zVal = Math.min(255, Math.max(0, Math.floor(lum * depthFactor)));

      d[idx] = zVal;
      d[idx + 1] = zVal;
      d[idx + 2] = zVal;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export const VideoGeneratorPanel: React.FC = () => {
  const prompt = useVideoStore((s) => s.prompt);
  const conditioningInputs = useVideoStore((s) => s.conditioningInputs);
  const model = useVideoStore((s) => s.model);
  const mode = useVideoStore((s) => s.mode);
  const duration = useVideoStore((s) => s.duration);
  const orientation = useVideoStore((s) => s.orientation);
  const resolutionText = useVideoStore((s) => s.resolutionText);
  const seed = useVideoStore((s) => s.seed);
  const cfgScale = useVideoStore((s) => s.cfgScale);
  const fps = useVideoStore((s) => s.fps);
  const referenceImage = useVideoStore((s) => s.referenceImage);
  const depthMapUrl = useVideoStore((s) => s.depthMapUrl);
  const referenceImages = useVideoStore((s) => s.referenceImages);
  const imageDetails = useVideoStore((s) => s.imageDetails);
  const isProcessing = useVideoStore((s) => s.isProcessing);
  const pipelineStatus = useVideoStore((s) => s.pipelineStatus);
  const currentStepMessage = useVideoStore((s) => s.currentStepMessage);
  const errorMessage = useVideoStore((s) => s.errorMessage);

  const setParam = useVideoStore((s) => s.setParam);
  const setReferenceFile = useVideoStore((s) => s.setReferenceFile);
  const setMultiReferenceFiles = useVideoStore((s) => s.setMultiReferenceFiles);
  const executeGeneration = useVideoStore((s) => s.executeGeneration);
  const stopGeneration = useVideoStore((s) => s.stopGeneration);
  const previewScript = useVideoStore((s) => s.previewScript);

  const activeTab = useVideoStore((s) => s.activeTab);
  const creativeSceneCount = useVideoStore((s) => s.creativeSceneCount);
  const isCreative = activeTab === 'Creative';

  const [validationError, setValidationError] = useState<string | null>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // ── BPE / Subword Tokenizer Analysis ──
  const tokenAnalysis = useMemo(() => analyzeTokens(prompt, 1299), [prompt]);

  // Single Reference Image File Upload
  const handleSingleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
    const objectUrl = URL.createObjectURL(file);

    const tempImg = new Image();
    tempImg.onload = () => {
      const resolution = `${tempImg.naturalWidth}×${tempImg.naturalHeight}`;
      const depthUrl = computeDepthMapFromImage(tempImg);

      setReferenceFile(file, objectUrl, depthUrl || objectUrl, {
        filename: file.name,
        resolution,
        sizeMb,
      });
    };
    tempImg.src = objectUrl;
  };

  // Multiple Reference Images Upload (Up to 5)
  const handleMultiImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 5);
    if (files.length === 0) return;

    const urls = files.map((f) => URL.createObjectURL(f));
    setMultiReferenceFiles(files, urls);
  };

  const handleOrientationChange = (val: string) => {
    if (val === '2') {
      setParam('orientation', 'Horizontal 16:9');
      setParam('resolutionText', '1280×720');
    } else if (val === '3') {
      setParam('orientation', 'Cuadrado 1:1');
      setParam('resolutionText', '1024×1024');
    } else {
      setParam('orientation', 'Vertical 9:16');
      setParam('resolutionText', '768×1152');
    }
  };

  // Pre-flight consistency validation before dispatching to pipeline
  const handleExecuteWithValidation = () => {
    if (!prompt.trim()) {
      setValidationError('Error de validación: El prompt de inferencia no puede estar vacío.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    if (seed < -1 || seed > 99999999) {
      setValidationError('Error de validación: Seed fuera del rango permitido (-1 a 99999999).');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    setValidationError(null);
    executeGeneration();
  };

  return (
    <aside className="h-full flex flex-col bg-[#0b0e14] border-r border-[#21262d] overflow-y-auto select-none p-3 space-y-2.5 font-mono text-[11px]">
      {/* Hidden native file upload inputs */}
      <input
        type="file"
        ref={singleFileInputRef}
        onChange={handleSingleImageChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={multiFileInputRef}
        onChange={handleMultiImagesChange}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* ── 1. PROMPT HEADER & TOKEN COUNTER ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <label className="text-[#8b949e] font-mono flex items-center gap-1.5 font-bold">
            <FileCode size={12} className="text-[#00f0ff]" />
            <span>Prompt de Inferencia</span>
          </label>
          <span 
            className={`font-mono text-[10px] ${
              tokenAnalysis.isOverLimit ? 'text-[#ff003c] font-bold' : 'text-[#8b949e]'
            }`}
          >
            Token counts: <span className={tokenAnalysis.isOverLimit ? 'text-[#ff003c]' : 'text-[#00f0ff]'}>{tokenAnalysis.tokenCount}</span>/{tokenAnalysis.maxTokens}
          </span>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setParam('prompt', e.target.value)}
          placeholder={isCreative
            ? 'Describa la idea de su historia multi-escena...'
            : 'Escriba directivas cinematográficas y de acción...'}
          rows={3}
          className="w-full bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[10px] p-2 font-mono outline-none resize-none focus:border-[#00f0ff] shadow-inner selection:bg-[#00f0ff]/20"
        />
      </div>

      {/* ── 1b. MODO CREATIVO: MULTI-ESCENA ── */}
      {isCreative && (
        <div className="panel-inset p-2 space-y-1.5 border border-[#00f0ff]/40">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#00f0ff] font-bold">MULTI-ESCENA ACTIVADO</span>
            <span className="text-[8px] text-[#8b949e]">IA guion → video por escena → concat</span>
          </div>
          <label className="text-[10px] text-[#8b949e] flex items-center justify-between">
            <span>Número de escenas</span>
            <span className="text-[#f0f6fc] font-bold">{creativeSceneCount}</span>
          </label>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={creativeSceneCount}
            onChange={(e) => setParam('creativeSceneCount', parseInt(e.target.value, 10))}
            className="w-full accent-[#00f0ff]"
          />
          <p className="text-[8px] text-[#8b949e] leading-tight">
            Cada escena se genera como un clip independiente y luego se unen con ffmpeg en un solo video.
          </p>
        </div>
      )}

      {/* ── 2. DUAL INGESTION: REFERENCE SEED & REAL Z-BUFFER DEPTH MAP ── */}
      <div className="panel-inset p-2 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#8b949e]">Semilla & Z-Buffer</span>
          <button 
            type="button"
            onClick={() => singleFileInputRef.current?.click()}
            className="text-[9px] text-[#00f0ff] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <FolderOpen size={10} />
            <span>Cargar Imagen</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Main RGB Image Container */}
          <div 
            onClick={() => singleFileInputRef.current?.click()}
            className="w-full h-20 bg-[#090c10] border border-[#21262d] relative flex items-center justify-center overflow-hidden cursor-pointer group"
          >
            {referenceImage ? (
              <img
                src={referenceImage}
                alt="Source seed frame"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="text-[9px] text-[#484f58] text-center p-1">
                Subir referencia RGB
              </div>
            )}
            <div className="absolute bottom-1 left-1 bg-black/70 px-1 text-[8px] text-[#00f0ff]">
              RGB_SOURCE
            </div>
          </div>

          {/* Depth / Z-Buffer Viewport */}
          <div className="w-full h-20 bg-[#090c10] border border-[#21262d] relative flex items-center justify-center overflow-hidden">
            {depthMapUrl ? (
              <img
                src={depthMapUrl}
                alt="Z-Buffer Depth"
                className="w-full h-full object-cover filter invert contrast-125"
              />
            ) : (
              <div className="text-[9px] text-[#484f58] text-center p-1">
                Z_BUFFER CALCULADO
              </div>
            )}
            <div className="absolute bottom-1 left-1 bg-black/70 px-1 text-[8px] text-[#00ff41]">
              Z_BUFFER
            </div>
          </div>
        </div>

        {/* Real image metadata strip */}
        <div className="text-[9px] text-[#8b949e] flex justify-between font-mono px-0.5">
          <span className="truncate max-w-[130px]">{imageDetails.filename}</span>
          <span>{imageDetails.resolution}</span>
          <span className="text-[#00f0ff]">{imageDetails.sizeMb}</span>
        </div>
      </div>

      {/* ── 3. MULTI-REFERENCE IMAGE ARRAY (5 SLOTS) ── */}
      <div className="panel-inset p-2 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#8b949e]">Referencias Múltiples (5 Cuadros)</span>
          <button 
            type="button"
            onClick={() => multiFileInputRef.current?.click()}
            className="text-[9px] text-[#00f0ff] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <FolderOpen size={10} />
            <span>Seleccionar Lote</span>
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {[0, 1, 2, 3, 4].map((idx) => {
            const imgUrl = referenceImages[idx] || referenceImage;
            return (
              <div
                key={idx}
                onClick={() => multiFileInputRef.current?.click()}
                className="w-full h-11 bg-[#090c10] border border-[#21262d] relative overflow-hidden flex items-center justify-center cursor-pointer hover:border-[#00f0ff] transition-none"
              >
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={`Ref ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[9px] text-[#30363d]">#{idx + 1}</span>
                )}
                <div className="absolute bottom-0 right-0 bg-black/80 px-0.5 text-[7px] text-[#8b949e]">
                  {idx + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. MODEL SELECTION & INFERENCE MODE ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="panel-inset p-2 space-y-1">
          <label className="text-[10px] text-[#8b949e] block font-mono">Modelo Neuronal</label>
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setParam('model', e.target.value)}
              className="w-full h-7 bg-[#090c10] border border-[#21262d] text-[#f0f6fc] text-[10px] px-1.5 font-mono outline-none appearance-none cursor-pointer focus:border-[#00f0ff]"
            >
              <option value="agnes-video-v2.0">agnes-video-v2.0</option>
              <option value="agnes-video-2.5-flash">agnes-video-2.5-flash</option>
              <option value="agnes-video-2.5">agnes-video-2.5</option>
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-2 text-[#8b949e] pointer-events-none" />
          </div>
        </div>

        <div className="panel-inset p-2 space-y-1">
          <label className="text-[10px] text-[#8b949e] block font-mono">Modo de Síntesis</label>
          <div className="relative">
            <select
              value={mode}
              onChange={(e) => setParam('mode', e.target.value as 't2v' | 'i2v' | 'ti2vid' | 'keyframes')}
              className="w-full h-7 bg-[#090c10] border border-[#21262d] text-[#f0f6fc] text-[10px] px-1.5 font-mono outline-none appearance-none cursor-pointer focus:border-[#00f0ff]"
            >
              <option value="i2v">i2v (Image-to-Video)</option>
              <option value="t2v">t2v (Text-to-Video)</option>
              <option value="ti2vid">ti2vid (Text+Image)</option>
              <option value="keyframes">keyframes (Animación)</option>
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-2 text-[#8b949e] pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── 5. NUMERIC HYPERPARAMETERS: DURATION, ORIENTATION, SEED, CFG ── */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {/* Duration Slider */}
          <div className="panel-inset p-2 space-y-1">
            <div className="flex justify-between text-[10px]">
              <label className="text-[#8b949e]">Duración</label>
              <span className="text-[#00f0ff] font-bold">{duration}s</span>
            </div>
            <input
              type="range"
              min="2"
              max="18"
              step="1"
              value={duration}
              onChange={(e) => setParam('duration', parseInt(e.target.value, 10))}
              className="w-full cursor-pointer accent-[#00f0ff]"
            />
          </div>

          {/* Orientation */}
          <div className="panel-inset p-2 space-y-1">
            <label className="text-[10px] text-[#8b949e] block">Orientación</label>
            <div className="relative">
              <select
                value={orientation.includes('16:9') ? '2' : orientation.includes('1:1') ? '3' : '1'}
                onChange={(e) => handleOrientationChange(e.target.value)}
                className="w-full h-6 bg-[#090c10] border border-[#21262d] text-[#f0f6fc] text-[10px] px-1.5 font-mono outline-none appearance-none cursor-pointer focus:border-[#00f0ff]"
              >
                <option value="1">Vertical 9:16 (768×1152)</option>
                <option value="2">Horizontal 16:9 (1280×720)</option>
                <option value="3">Cuadrado 1:1 (1024×1024)</option>
              </select>
              <ChevronDown size={10} className="absolute right-1.5 top-2 text-[#8b949e] pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Seed & CFG Scale */}
        <div className="grid grid-cols-2 gap-2">
          <div className="panel-inset p-2 space-y-1">
            <label className="text-[10px] text-[#8b949e] block">Seed (-1 = aleatorio)</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setParam('seed', parseInt(e.target.value, 10) || -1)}
              className="w-full h-7 bg-[#090c10] border border-[#21262d] px-2 text-[#f0f6fc] text-[10px] font-mono outline-none focus:border-[#00f0ff]"
            />
          </div>

          <div className="panel-inset p-2 space-y-1">
            <div className="flex justify-between text-[10px]">
              <label className="text-[#8b949e]">CFG Scale</label>
              <span className="text-[#00f0ff] font-bold">{cfgScale.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="15.0"
              step="0.5"
              value={cfgScale}
              onChange={(e) => setParam('cfgScale', parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-[#00f0ff]"
            />
          </div>
        </div>
      </div>

      {/* ── 6. CONDITIONING INPUTS / NEGATIVE PROMPT ── */}
      <div className="panel-inset p-2 space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <label className="text-[#8b949e] block font-bold">Conditioning Inputs (Negativo)</label>
          <span className="text-[8px] text-[#00f0ff]">DIFFUSERS_GUIDANCE</span>
        </div>
        <textarea
          value={conditioningInputs}
          onChange={(e) => setParam('conditioningInputs', e.target.value)}
          placeholder="Qué evitar en la inferencia (desenfoque, artefactos, deformaciones, pérdida de coherencia temporal)..."
          rows={2}
          className="w-full bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[10px] p-2 font-mono outline-none resize-none focus:border-[#00f0ff] shadow-inner"
        />
      </div>

      {/* Validation Banner */}
      {validationError && (
        <div className="p-2 bg-[#ff003c]/20 border border-[#ff003c] text-[#ff003c] text-[10px] flex items-center gap-2 font-mono animate-pulse">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Server Ingestion Failure Banner */}
      {pipelineStatus === 'FAILED' && (
        <div className="p-2 bg-[#ff003c]/15 border border-[#ff003c] text-[#f0f6fc] text-[10px] space-y-1 font-mono">
          <div className="flex items-center gap-1.5 text-[#ff003c] font-bold">
            <ShieldAlert size={13} className="shrink-0" />
            <span>FALLO EN INFERENCIA GPU</span>
          </div>
          <div className="text-[9px] text-[#ffaa00] break-words">
            {errorMessage || currentStepMessage}
          </div>
        </div>
      )}

      {/* ── 7. HEAVY INDUSTRIAL DUAL-ACTION BUTTON BAR ── */}
      <div className="panel-bevel-frame p-1.5 bg-[#12161f] border border-[#30363d] flex gap-2 pt-2">
        {isProcessing ? (
          <button
            type="button"
            onClick={stopGeneration}
            className="flex-[1.5] h-9 bg-[#ff003c]/20 border border-[#ff003c] hover:bg-[#ff003c] hover:text-black text-[#ff003c] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer transition-none shadow-[0_0_12px_rgba(255,0,60,0.5)] select-none"
          >
            <Square size={13} fill="currentColor" />
            <span>Detener Generación</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleExecuteWithValidation}
            className="flex-[1.5] h-9 border border-[#00f0ff] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 select-none transition-none shadow-[0_0_12px_rgba(0,240,255,0.4)] bg-gradient-to-r from-[#00f0ff]/20 via-[#00f0ff]/30 to-[#00f0ff]/20 hover:from-[#00f0ff]/35 hover:to-[#00f0ff]/35 active:bg-[#00f0ff] active:text-[#000] text-[#f0f6fc] cursor-pointer"
          >
            <Sparkles size={13} className="text-[#00f0ff]" />
            <span>Generar Video</span>
          </button>
        )}

        <button
          type="button"
          onClick={previewScript}
          disabled={isProcessing}
          className={`flex-1 h-9 border text-[11px] font-mono flex items-center justify-center gap-1.5 transition-none ${
            isProcessing
              ? 'bg-[#161b22] border-[#21262d] text-[#484f58] cursor-not-allowed'
              : 'bg-[#161b22] border-[#30363d] hover:border-[#484f58] hover:text-[#f0f6fc] text-[#8b949e] cursor-pointer'
          }`}
        >
          <Eye size={13} />
          <span>Vista previa</span>
        </button>
      </div>
    </aside>
  );
};
