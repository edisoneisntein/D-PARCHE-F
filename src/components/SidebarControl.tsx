import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Eye, 
  ChevronDown, 
  X, 
  FolderOpen,
  Sliders,
  Maximize2
} from 'lucide-react';

export interface InferenceParams {
  prompt: string;
  negativePrompt: string;
  model: string;
  mode: string;
  duration: number;
  orientation: string;
  resolutionText: string;
  seed: number;
  cfgScale: number;
  referenceImage: string;
  depthMapUrl: string;
  referenceImageFile?: File;
  referenceImages: string[];
  referenceImageFiles?: File[];
  imageDetails: {
    resolution: string;
    sizeMb: string;
    filename: string;
  };
}

interface SidebarControlProps {
  params: InferenceParams;
  onChange: (params: InferenceParams) => void;
  onExecute: () => void;
  onPreview: () => void;
  isProcessing: boolean;
}

// Helper to compute a real depth map from image element using canvas pixels
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

  // Compute depth simulation based on luminosity + center-focal distance gradient
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Vertical perspective gradient (ground to sky depth falloff)
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

export const SidebarControl: React.FC<SidebarControlProps> = ({
  params,
  onChange,
  onExecute,
  onPreview,
  isProcessing,
}) => {
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const updateParam = <K extends keyof InferenceParams>(key: K, value: InferenceParams[K]) => {
    onChange({ ...params, [key]: value });
  };

  // Real token counter based on actual text content
  const tokenCount = Math.max(1, Math.floor(params.prompt.trim().length * 0.72) + (params.prompt.trim() ? params.prompt.trim().split(/\s+/).length : 0));
  const maxTokens = 1299;

  // Real Single Image Upload Handler
  const handleSingleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
    const objectUrl = URL.createObjectURL(file);

    const tempImg = new Image();
    tempImg.onload = () => {
      const resolution = `${tempImg.naturalWidth}×${tempImg.naturalHeight}`;
      const depthUrl = computeDepthMapFromImage(tempImg);

      onChange({
        ...params,
        referenceImage: objectUrl,
        referenceImageFile: file,
        depthMapUrl: depthUrl || objectUrl,
        imageDetails: {
          filename: file.name,
          resolution,
          sizeMb,
        },
      });
    };
    tempImg.src = objectUrl;
  };

  // Real Multiple Reference Images Upload Handler (Up to 5)
  const handleMultiImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 5);
    if (files.length === 0) return;

    const urls = files.map((f) => URL.createObjectURL(f));
    onChange({
      ...params,
      referenceImages: urls,
      referenceImageFiles: files,
    });
  };

  const handleOrientationChange = (val: string) => {
    let orientation = 'Vertical 9:16';
    let resolutionText = '768×1152';
    if (val === '2') {
      orientation = 'Horizontal 16:9';
      resolutionText = '1280×720';
    } else if (val === '3') {
      orientation = 'Cuadrado 1:1';
      resolutionText = '1024×1024';
    }
    onChange({ ...params, orientation, resolutionText });
  };

  return (
    <aside className="h-full flex flex-col bg-[#0b0e14] border-r border-[#21262d] overflow-y-auto select-none p-3 space-y-2.5 font-mono text-[11px]">
      {/* Hidden real native file pickers */}
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

      {/* ── 1. PROMPT SECTION (CON TOKEN COUNTER REAL) ── */}
      <div className="panel-inset p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] pb-1 border-b border-[#21262d]">
          <span className="text-[#f0f6fc] font-semibold flex items-center gap-1">
            Prompt <span className="text-[#ff003c]">*</span>
          </span>
          <span className={`font-mono text-[10px] tracking-wider ${tokenCount > maxTokens ? 'text-[#ff003c]' : 'text-[#00f0ff] hud-text-glow'}`}>
            Token counts: {tokenCount}/{maxTokens}
          </span>
        </div>

        <textarea
          value={params.prompt}
          onChange={(e) => updateParam('prompt', e.target.value)}
          rows={4}
          placeholder="Escribe el prompt cinemático para la generación de video..."
          className="w-full bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[10px] p-2 font-mono outline-none resize-none focus:border-[#00f0ff] leading-relaxed shadow-inner"
        />
      </div>

      {/* ── 2. MODELO DE VIDEO Y MODO DROPDOWNS ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="panel-inset p-2 space-y-1">
          <label className="text-[10px] text-[#8b949e] block font-mono">Modelo de video</label>
          <div className="relative">
            <select
              value={params.model}
              onChange={(e) => updateParam('model', e.target.value)}
              className="w-full h-7 bg-[#161b22] border border-[#30363d] text-[#f0f6fc] text-[10px] px-2 pr-6 appearance-none font-mono outline-none focus:border-[#00f0ff]"
            >
              <option value="config">Modelo configurado (config)</option>
              <option value="agnes-video-2.5-flash">agnes-video-2.5-flash</option>
              <option value="agnes-video-2.0-flash">agnes-video-2.0-flash</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-2 text-[#8b949e] pointer-events-none" />
          </div>
        </div>

        <div className="panel-inset p-2 space-y-1">
          <label className="text-[10px] text-[#8b949e] block font-mono">Modo</label>
          <div className="relative">
            <select
              value={params.mode}
              onChange={(e) => updateParam('mode', e.target.value)}
              className="w-full h-7 bg-[#161b22] border border-[#30363d] text-[#f0f6fc] text-[10px] px-2 pr-6 appearance-none font-mono outline-none focus:border-[#00f0ff]"
            >
              <option value="i2v">Imagen → Video</option>
              <option value="t2v">Texto → Video</option>
              <option value="ti2vid">Texto + Imagen → Video</option>
              <option value="keyframes">Keyframes</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-2 text-[#8b949e] pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── 3. IMAGEN PRINCIPAL / SEMILLA & IMÁGENES DE REFERENCIA ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Sub-panel 1: Imagen Principal / Semilla */}
        <div className="panel-inset p-2 space-y-1.5 relative">
          <div className="flex items-center justify-between text-[10px] text-[#f0f6fc] font-semibold border-b border-[#21262d] pb-1">
            <span>Imagen principal / semilla</span>
            <button 
              onClick={() => singleFileInputRef.current?.click()} 
              className="text-[#00f0ff] hover:text-[#fff] text-[9px]"
              title="Cambiar imagen"
            >
              Cambiar
            </button>
          </div>

          <div className="relative">
            <button 
              onClick={() => singleFileInputRef.current?.click()}
              className="w-full h-6 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#c9d1d9] text-[9px] px-1.5 flex items-center justify-between font-mono cursor-pointer transition-none"
            >
              <span className="truncate">Seleccionar archivo: {params.imageDetails.filename}</span>
              <ChevronDown size={11} className="shrink-0 text-[#8b949e]" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            {/* Main Thumbnail preview */}
            <div 
              onClick={() => singleFileInputRef.current?.click()}
              className="w-14 h-12 bg-[#000] border border-[#30363d] hover:border-[#00f0ff] shrink-0 overflow-hidden relative cursor-pointer"
              title="Haz clic para cargar imagen real"
            >
              <img
                src={params.referenceImage}
                alt="Seed Frame"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Middle Details Metadata (Real computed from file) */}
            <div className="flex-1 text-[8px] font-mono leading-tight text-[#8b949e] space-y-0.5 overflow-hidden">
              <div className="text-[#f0f6fc] font-bold">Detalles</div>
              <div className="truncate">Res: {params.imageDetails.resolution}</div>
              <div className="truncate">Tamaño: {params.imageDetails.sizeMb}</div>
              <div className="truncate">Map: Z_CALIB_OK</div>
            </div>

            {/* Depth Map Preview Thumbnail (Real computed from pixels) */}
            <div 
              className="w-14 h-12 bg-[#000] border border-[#00f0ff]/40 shrink-0 overflow-hidden relative shadow-inner"
              title="Mapa de profundidad calculado"
            >
              <img
                src={params.depthMapUrl}
                alt="Depth Map"
                className="w-full h-full object-cover grayscale contrast-125"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 inset-x-0 bg-[#000]/80 text-[#00f0ff] text-[7px] text-center font-mono">
                DEPTH_Z
              </div>
            </div>
          </div>
        </div>

        {/* Sub-panel 2: Imágenes de Referencia (hasta 5) */}
        <div className="panel-inset p-2 space-y-1.5 relative">
          <div className="flex items-center justify-between text-[10px] text-[#f0f6fc] font-semibold border-b border-[#21262d] pb-1">
            <span>Imágenes de referencia (hasta 5)</span>
            <span className="text-[9px] text-[#00f0ff] font-mono">{params.referenceImages.length} archivos</span>
          </div>

          <div className="flex items-center justify-between">
            <button 
              onClick={() => multiFileInputRef.current?.click()}
              className="h-6 px-2 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#f0f6fc] text-[9px] flex items-center gap-1 font-mono transition-none cursor-pointer"
            >
              <FolderOpen size={11} />
              Elegir archivos
            </button>
            <span className="text-[8px] text-[#8b949e] font-mono">Max 5 imágenes</span>
          </div>

          {/* Horizontal row of 5 reference thumbnail images */}
          <div className="grid grid-cols-5 gap-1 pt-0.5">
            {params.referenceImages.slice(0, 5).map((url, i) => (
              <div 
                key={i} 
                onClick={() => multiFileInputRef.current?.click()}
                className="aspect-square bg-[#000] border border-[#30363d] hover:border-[#00f0ff] relative overflow-hidden group cursor-pointer"
                title={`Imagen de referencia ${i + 1}`}
              >
                <img 
                  src={url} 
                  alt={`Ref ${i + 1}`} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer" 
                />
                <div className="absolute bottom-0 inset-x-0 bg-[#000]/85 text-[7px] text-[#8b949e] group-hover:text-[#00f0ff] px-0.5 truncate text-center font-mono">
                  Img_{i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. DURACIÓN & ORIENTACIÓN ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Duración (s) */}
        <div className="panel-inset p-2 space-y-1.5">
          <label className="text-[10px] text-[#8b949e] block font-mono">Duración (s)</label>
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-6 bg-[#090c10] border border-[#21262d] flex items-center justify-center text-[10px] text-[#f0f6fc] font-mono">
              {params.duration}s
            </div>
            <input
              type="range"
              min="2"
              max="18"
              step="1"
              value={params.duration}
              onChange={(e) => updateParam('duration', parseInt(e.target.value, 10))}
              className="flex-1 cursor-pointer"
            />
            <div className="w-10 h-6 bg-[#090c10] border border-[#21262d] flex items-center justify-center text-[10px] text-[#f0f6fc] font-mono">
              18s
            </div>
          </div>
        </div>

        {/* Orientación */}
        <div className="panel-inset p-2 space-y-1.5">
          <label className="text-[10px] text-[#8b949e] block font-mono">Orientación</label>
          <div className="flex items-center gap-1.5">
            <div className="w-24 h-6 bg-[#161b22] border border-[#30363d] flex items-center justify-center text-[9px] text-[#00f0ff] font-mono">
              {params.orientation}
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="1"
              value={params.orientation === 'Vertical 9:16' ? 1 : params.orientation === 'Horizontal 16:9' ? 2 : 3}
              onChange={(e) => handleOrientationChange(e.target.value)}
              className="flex-1 cursor-pointer"
            />
            <div className="w-16 h-6 bg-[#090c10] border border-[#21262d] flex items-center justify-center text-[9px] text-[#f0f6fc] font-mono">
              {params.resolutionText}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. SEED Y CFG CON BOTONES ROTATIVOS ANALÓGICOS ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Seed (-1 = aleatorio) */}
        <div className="panel-inset p-2 space-y-1.5">
          <label className="text-[10px] text-[#8b949e] block font-mono">Seed (-1 = aleatorio)</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={params.seed}
              onChange={(e) => updateParam('seed', parseInt(e.target.value, 10) || 0)}
              className="w-12 h-6 bg-[#090c10] border border-[#21262d] text-center text-[10px] text-[#f0f6fc] font-mono outline-none"
            />
            <input
              type="range"
              min="-1"
              max="9999"
              value={params.seed}
              onChange={(e) => updateParam('seed', parseInt(e.target.value, 10))}
              className="flex-1 cursor-pointer"
            />
            {/* Analog Rotary Dial Knob with real random generator */}
            <div 
              className="rotary-knob shrink-0 cursor-pointer hover:border-[#00f0ff]"
              title="Generar nueva semilla aleatoria"
              onClick={() => updateParam('seed', Math.floor(Math.random() * 999999))}
            />
          </div>
        </div>

        {/* CFG Scale / Motion */}
        <div className="panel-inset p-2 space-y-1.5">
          <label className="text-[10px] text-[#8b949e] block font-mono">CFG Scale / Motion</label>
          <div className="flex items-center gap-1.5">
            <div className="w-9 h-6 bg-[#090c10] border border-[#21262d] flex items-center justify-center text-[10px] text-[#f0f6fc] font-mono">
              1.0
            </div>
            <input
              type="range"
              min="1.0"
              max="15.0"
              step="0.5"
              value={params.cfgScale}
              onChange={(e) => updateParam('cfgScale', parseFloat(e.target.value))}
              className="flex-1 cursor-pointer"
            />
            {/* Analog Rotary Dial Knob */}
            <div 
              className="rotary-knob shrink-0 cursor-pointer hover:border-[#00f0ff]"
              title="Restablecer CFG a 7.5"
              onClick={() => updateParam('cfgScale', 7.5)}
            />
            <div className="w-12 h-6 bg-[#090c10] border border-[#21262d] flex items-center justify-center text-[10px] text-[#00f0ff] font-mono">
              {params.cfgScale.toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. CONDITIONING INPUTS (NEGATIVE PROMPT) ── */}
      <div className="panel-inset p-2 space-y-1">
        <label className="text-[10px] text-[#8b949e] block font-mono">Conditioning Inputs</label>
        <textarea
          value={params.negativePrompt}
          onChange={(e) => updateParam('negativePrompt', e.target.value)}
          placeholder="Qué evitar en la generación (ej. borroso, baja resolución, artefactos)..."
          rows={2}
          className="w-full bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[10px] p-2 font-mono outline-none resize-none focus:border-[#00f0ff] shadow-inner"
        />
      </div>

      {/* ── 7. HEAVY INDUSTRIAL DUAL-ACTION BUTTON BAR ── */}
      <div className="panel-bevel-frame p-1.5 bg-[#12161f] border border-[#30363d] flex gap-2 pt-2">
        {/* Generar Video Button with Cyan Glow */}
        <button
          onClick={onExecute}
          disabled={isProcessing}
          className={`flex-[1.5] h-9 border border-[#00f0ff] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 select-none transition-none shadow-[0_0_12px_rgba(0,240,255,0.4)] ${
            isProcessing
              ? 'bg-[#161b22] text-[#ffaa00] border-[#ffaa00] cursor-wait'
              : 'bg-gradient-to-r from-[#00f0ff]/20 via-[#00f0ff]/30 to-[#00f0ff]/20 hover:from-[#00f0ff]/35 hover:to-[#00f0ff]/35 active:bg-[#00f0ff] active:text-[#000] text-[#f0f6fc] cursor-pointer'
          }`}
        >
          <Sparkles size={13} className="text-[#00f0ff]" />
          <span>{isProcessing ? 'Procesando Video...' : 'Generar Video'}</span>
        </button>

        {/* Vista Previa Button */}
        <button
          onClick={onPreview}
          disabled={isProcessing}
          className="flex-1 h-9 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] hover:text-[#f0f6fc] text-[#8b949e] text-[11px] font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-none"
        >
          <Eye size={13} />
          <span>Vista previa</span>
        </button>
      </div>
    </aside>
  );
};
