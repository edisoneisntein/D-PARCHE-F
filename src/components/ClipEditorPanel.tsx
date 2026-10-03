import React, { useRef, useState } from 'react';
import { Plus, Trash2, Link, FolderOpen, Sparkles, Square, AlertTriangle, ChevronDown, X } from 'lucide-react';
import { useVideoStore } from '../store/videoStore';

interface ClipForm {
  prompt: string;
  seed: number;
  chain: boolean;
  files: File[];          // up to 5 reference images
  previews: string[];     // object URLs
}

const newClip = (): ClipForm => ({ prompt: '', seed: -1, chain: false, files: [], previews: [] });

export const ClipEditorPanel: React.FC = () => {
  const [clips, setClips] = useState<ClipForm[]>([newClip(), newClip()]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Shared inference controls (same store as Simple panel)
  const model = useVideoStore((s) => s.model);
  const mode = useVideoStore((s) => s.mode);
  const duration = useVideoStore((s) => s.duration);
  const orientation = useVideoStore((s) => s.orientation);
  const cfgScale = useVideoStore((s) => s.cfgScale);
  const conditioningInputs = useVideoStore((s) => s.conditioningInputs);
  const isProcessing = useVideoStore((s) => s.isProcessing);
  const setParam = useVideoStore((s) => s.setParam);

  const updateClip = (i: number, patch: Partial<ClipForm>) => {
    setClips((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const addClip = () => setClips((prev) => [...prev, { ...newClip(), chain: prev.length > 0 }]);

  const removeClip = (i: number) => {
    setClips((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  };

  const handleRefsChange = (i: number, fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList).slice(0, 5);
    updateClip(i, { files, previews: files.map((f) => URL.createObjectURL(f)) });
  };

  const removeRef = (i: number, j: number) => {
    setClips((prev) =>
      prev.map((c, idx) =>
        idx === i
          ? { ...c, files: c.files.filter((_, k) => k !== j), previews: c.previews.filter((_, k) => k !== j) }
          : c,
      ),
    );
  };

  const handleOrientationChange = (val: string) => {
    if (val === '2') {
      setParam('orientation', 'Horizontal 16:9');
    } else if (val === '3') {
      setParam('orientation', 'Cuadrado 1:1');
    } else {
      setParam('orientation', 'Vertical 9:16');
    }
  };

  const handleExecute = async () => {
    if (clips.some((c) => !c.prompt.trim())) {
      setValidationError('Error: todos los clips necesitan un prompt.');
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    setValidationError(null);

    try {
      setParam('pipelineStatus', 'SUBMITTING');
      setParam('isProcessing', true);
      setParam('videoUrl', null);
      setParam('currentStepMessage', `ENVIANDO ${clips.length} CLIPS A AGNES CLOUD...`);
      setParam('renderProgress', 5);

      const formData = new FormData();
      formData.append(
        'clips_json',
        JSON.stringify(clips.map((c) => ({ prompt: c.prompt.trim(), seed: c.seed, chain: c.chain }))),
      );
      clips.forEach((c, i) => {
        c.files.forEach((f, j) => formData.append(`ref_${i}_${j}`, f));
      });
      const store = useVideoStore.getState();
      formData.append('duration', String(store.duration));
      formData.append('model', store.model);
      formData.append('orientation', store.orientation);
      formData.append('cfg_scale', String(store.cfgScale));
      formData.append('conditioning_inputs', store.conditioningInputs);

      const res = await fetch('/api/tasks/clip-editor', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.task_id) {
        throw new Error(data.detail || `Error HTTP ${res.status}`);
      }

      const taskId = data.task_id as string;
      setParam('activeTaskId', taskId);
      setParam('pipelineStatus', 'RUNNING');
      setParam('renderProgress', 10);

      const timer = setInterval(async () => {
        try {
          const r = await fetch(`/api/tasks/${taskId}`);
          if (!r.ok) return;
          const t = await r.json();
          if (t.current_progress !== undefined) setParam('renderProgress', t.current_progress);
          if (t.current_message) setParam('currentStepMessage', t.current_message);
          if (t.status === 'completed') {
            clearInterval(timer);
            setParam('pipelineStatus', 'COMPLETED');
            setParam('isProcessing', false);
            setParam('renderProgress', 100);
            setParam('currentStepMessage', 'COMPLETADO');
            setParam('videoUrl', `/api/video/${taskId}`);
          } else if (t.status === 'failed' || t.status === 'stopped') {
            clearInterval(timer);
            setParam('pipelineStatus', t.status === 'failed' ? 'FAILED' : 'STOPPED');
            setParam('isProcessing', false);
            setParam('currentStepMessage', t.current_message || 'DETENIDO');
          }
        } catch {}
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error en la solicitud';
      setParam('pipelineStatus', 'FAILED');
      setParam('isProcessing', false);
      setParam('currentStepMessage', `ERROR: ${msg}`);
      setParam('errorMessage', msg);
    }
  };

  return (
    <aside className="h-full flex flex-col bg-[#0b0e14] border-r border-[#21262d] overflow-y-auto select-none p-3 space-y-2.5 font-mono text-[11px]">
      <div className="text-[10px] text-[#00f0ff] font-bold flex items-center justify-between">
        <span>EDITOR MULTI-CLIP</span>
        <span className="text-[#8b949e] font-normal">{clips.length} clip(s)</span>
      </div>

      {/* ── CONFIG GLOBALE DE INFERENCIA ── */}
      <div className="panel-inset p-2 space-y-2 border border-[#30363d]">
        <div className="text-[10px] text-[#8b949e] font-bold">CONFIG. GLOBAL DE SÍNTESIS</div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[9px] text-[#8b949e] block">Modelo Neuronal</label>
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

          <div className="space-y-1">
            <label className="text-[9px] text-[#8b949e] block">Modo de Síntesis</label>
            <div className="relative">
              <select
                value={mode}
                onChange={(e) => setParam('mode', e.target.value as 't2v' | 'i2v' | 'ti2vid' | 'keyframes')}
                className="w-full h-7 bg-[#090c10] border border-[#21262d] text-[#f0f6fc] text-[10px] px-1.5 font-mono outline-none appearance-none cursor-pointer focus:border-[#00f0ff]"
              >
                <option value="i2v">i2v (Imagen a video)</option>
                <option value="t2v">t2v (Texto a video)</option>
                <option value="ti2vid">ti2vid (Texto+Imagen)</option>
                <option value="keyframes">keyframes (Animación)</option>
              </select>
              <ChevronDown size={12} className="absolute right-1.5 top-2 text-[#8b949e] pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <label className="text-[#8b949e]">Duración por clip</label>
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

          <div className="space-y-1">
            <label className="text-[9px] text-[#8b949e] block">Orientación</label>
            <div className="relative">
              <select
                value={orientation.includes('16:9') ? '2' : orientation.includes('1:1') ? '3' : '1'}
                onChange={(e) => handleOrientationChange(e.target.value)}
                className="w-full h-6 bg-[#090c10] border border-[#21262d] text-[#f0f6fc] text-[10px] px-1.5 font-mono outline-none appearance-none cursor-pointer focus:border-[#00f0ff]"
              >
                <option value="1">Vertical 9:16</option>
                <option value="2">Horizontal 16:9</option>
                <option value="3">Cuadrado 1:1</option>
              </select>
              <ChevronDown size={10} className="absolute right-1.5 top-2 text-[#8b949e] pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[9px]">
            <label className="text-[#8b949e]">Escala CFG</label>
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

        <textarea
          value={conditioningInputs}
          onChange={(e) => setParam('conditioningInputs', e.target.value)}
          placeholder="Condicionamiento negativo (blurry, low quality...)"
          rows={2}
          className="w-full bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[9px] p-1.5 font-mono outline-none resize-none focus:border-[#00f0ff]"
        />
        <p className="text-[8px] text-[#8b949e] leading-tight">
          La semilla, el prompt y las referencias son por clip. Si subes imágenes o encadenas, el clip corre en i2v automáticamente.
        </p>
      </div>

      {/* ── CLIPS ── */}
      {clips.map((clip, i) => (
        <div key={i} className="panel-inset p-2 space-y-2 border border-[#30363d]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#00f0ff] font-bold">CLIP {i + 1}</span>
            <button
              type="button"
              onClick={() => removeClip(i)}
              className="text-[#8b949e] hover:text-[#f85149] cursor-pointer"
              title="Eliminar clip"
              disabled={clips.length <= 1}
            >
              <Trash2 size={12} />
            </button>
          </div>

          <textarea
            value={clip.prompt}
            onChange={(e) => updateClip(i, { prompt: e.target.value })}
            placeholder={`Prompt de la escena ${i + 1}...`}
            rows={2}
            className="w-full bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[10px] p-2 font-mono outline-none resize-none focus:border-[#00f0ff] shadow-inner"
          />

          <div className="flex items-center gap-2 text-[10px]">
            <label className="text-[#8b949e] shrink-0">Semilla</label>
            <input
              type="number"
              value={clip.seed}
              onChange={(e) => updateClip(i, { seed: parseInt(e.target.value || '-1', 10) })}
              className="w-20 bg-[#090c10] border border-[#21262d] text-[#c9d1d9] text-[10px] p-1 font-mono outline-none focus:border-[#00f0ff]"
              min={-1}
              max={99999999}
            />
            <span className="text-[8px] text-[#8b949e]">-1 = aleatoria</span>
          </div>

          {/* Multi-referencias del clip (hasta 5) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#8b949e]">Referencias del clip ({clip.files.length}/5)</span>
              <button
                type="button"
                onClick={() => fileInputRefs.current[i]?.click()}
                className="text-[9px] text-[#00f0ff] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <FolderOpen size={10} />
                <span>Elegir</span>
              </button>
            </div>
            <input
              type="file"
              ref={(el) => { fileInputRefs.current[i] = el; }}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleRefsChange(i, e.target.files)}
            />
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4].map((j) => {
                const url = clip.previews[j];
                return (
                  <div
                    key={j}
                    onClick={() => fileInputRefs.current[i]?.click()}
                    className="w-full h-11 bg-[#090c10] border border-[#21262d] relative overflow-hidden flex items-center justify-center cursor-pointer hover:border-[#00f0ff]"
                  >
                    {url ? (
                      <>
                        <img src={url} alt={`Ref ${j + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeRef(i, j); }}
                          className="absolute top-0 right-0 bg-black/80 text-[#f85149] cursor-pointer"
                        >
                          <X size={8} />
                        </button>
                      </>
                    ) : (
                      <span className="text-[9px] text-[#30363d]">#{j + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {i > 0 && (
            <label className="flex items-center gap-1.5 text-[10px] text-[#8b949e] cursor-pointer">
              <input
                type="checkbox"
                checked={clip.chain}
                onChange={(e) => updateClip(i, { chain: e.target.checked })}
                className="accent-[#00f0ff]"
              />
              <Link size={10} className={clip.chain ? 'text-[#00f0ff]' : ''} />
              <span>🔗 Encadenar último frame del clip {i} (tus refs tienen prioridad)</span>
            </label>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addClip}
        className="w-full py-1.5 border border-dashed border-[#30363d] text-[#8b949e] hover:text-[#00f0ff] hover:border-[#00f0ff] text-[10px] flex items-center justify-center gap-1 cursor-pointer"
      >
        <Plus size={11} />
        <span>Añadir clip</span>
      </button>

      {validationError && (
        <div className="p-2 bg-[#ff003c]/15 border border-[#ff003c] text-[#ffaa00] text-[9px] font-mono flex items-center gap-1.5">
          <AlertTriangle size={11} className="shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {isProcessing ? (
        <div className="panel-bevel-frame p-1.5 bg-[#12161f] border border-[#ff003c] flex">
          <div className="flex-1 h-9 bg-[#ff003c]/20 text-[#ff003c] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2">
            <Square size={13} fill="currentColor" />
            <span>Generando clips...</span>
          </div>
        </div>
      ) : (
        <div className="panel-bevel-frame p-1.5 bg-[#12161f] border border-[#30363d] flex">
          <button
            type="button"
            onClick={handleExecute}
            className="flex-1 h-9 border border-[#00f0ff] text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 select-none transition-none shadow-[0_0_12px_rgba(0,240,255,0.4)] bg-gradient-to-r from-[#00f0ff]/20 via-[#00f0ff]/30 to-[#00f0ff]/20 hover:from-[#00f0ff]/35 hover:to-[#00f0ff]/35 active:bg-[#00f0ff] active:text-[#000] text-[#f0f6fc] cursor-pointer"
          >
            <Sparkles size={13} className="text-[#00f0ff]" />
            <span>Generar todo ({clips.length} clips)</span>
          </button>
        </div>
      )}
    </aside>
  );
};
