import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Maximize2, 
  Crosshair, 
  Volume2, 
  VolumeX, 
  Download,
  Square,
  AlertTriangle,
  RotateCw
} from 'lucide-react';
import { useVideoStore } from '../store/videoStore';

export const VideoMonitorHUD: React.FC = () => {
  const videoUrl = useVideoStore((s) => s.videoUrl);
  const activeTaskId = useVideoStore((s) => s.activeTaskId);
  const isProcessing = useVideoStore((s) => s.isProcessing);
  const pipelineStatus = useVideoStore((s) => s.pipelineStatus);
  const renderProgress = useVideoStore((s) => s.renderProgress);
  const currentStepMessage = useVideoStore((s) => s.currentStepMessage);
  const errorMessage = useVideoStore((s) => s.errorMessage);
  const referenceImage = useVideoStore((s) => s.referenceImage);
  const targetDuration = useVideoStore((s) => s.duration);
  const cameraGeometry = useVideoStore((s) => s.cameraGeometry);
  const stopGeneration = useVideoStore((s) => s.stopGeneration);
  const resetPipeline = useVideoStore((s) => s.resetPipeline);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(targetDuration || 15);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [reticleEnabled, setReticleEnabled] = useState<boolean>(true);
  const [fpsCounter, setFpsCounter] = useState<number>(24);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameCallbackIdRef = useRef<number | null>(null);

  // ── Frame accurate callback using requestVideoFrameCallback ──
  const setupFrameCallback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;

    let lastTime = performance.now();
    let frameCount = 0;

    const onFrame = () => {
      if (!video) return;
      setCurrentTime(video.currentTime);

      const now = performance.now();
      frameCount++;
      if (now - lastTime >= 1000) {
        setFpsCounter(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      frameCallbackIdRef.current = video.requestVideoFrameCallback(onFrame);
    };

    frameCallbackIdRef.current = video.requestVideoFrameCallback(onFrame);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      setupFrameCallback();
    }
    return () => {
      if (videoRef.current && frameCallbackIdRef.current !== null && 'cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
        videoRef.current.cancelVideoFrameCallback(frameCallbackIdRef.current);
      }
    };
  }, [isPlaying, setupFrameCallback]);

  // Format SMPTE Timecode: HH:MM:SS:FF
  const formatSMPTE = (timeSec: number): string => {
    const frameNumber = Math.floor(timeSec * 24);
    const h = String(Math.floor(timeSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((timeSec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(timeSec % 60)).padStart(2, '0');
    const f = String(frameNumber % 24).padStart(2, '0');
    return `${h}:${m}:${s}:${f}`;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(true));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const stepFrame = (delta: number) => {
    const nextTime = Math.max(0, Math.min(videoDuration, currentTime + delta * (1 / 24)));
    setCurrentTime(nextTime);
    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div 
      ref={containerRef}
      className="h-full flex flex-col bg-[#07090e] border-r border-[#21262d] p-3 overflow-hidden select-none font-mono"
    >
      {/* ── HEAVY INDUSTRIAL MONITOR HOUSING WITH METALLIC BEZEL ── */}
      <div className="flex-1 flex flex-col bg-[#0b0e14] border border-[#30363d] panel-bevel-frame overflow-hidden">
        {/* ── UPPER BEZEL HUD BAR ── */}
        <div className="h-8 px-3 bg-[#13171f] border-b border-[#30363d] flex items-center justify-between text-[10px] text-[#8b949e] font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[#8b949e]">Frame rate:</span>
            <span className="text-[#f0f6fc] font-bold">{isPlaying ? fpsCounter : 24} FPS</span>
            {isProcessing && (
              <span className="text-[#ffaa00] text-[9px] animate-pulse">● REC {renderProgress}%</span>
            )}
          </div>

          <div className="flex items-center gap-2 hud-text-glow font-bold text-[11px] tracking-wider">
            <span className="text-[#8b949e]">Generation ID:</span>
            <span className="text-[#00f0ff]">{activeTaskId.replace(/[^0-9]/g, '') || '338511976'}</span>
            {isProcessing && (
              <button
                type="button"
                onClick={stopGeneration}
                className="px-2 py-0.5 bg-[#ff003c]/20 border border-[#ff003c] text-[#ff003c] hover:bg-[#ff003c] hover:text-black font-bold text-[9px] flex items-center gap-1 cursor-pointer ml-2 transition-none"
                title="Detener inferencia inmediatamente"
              >
                <Square size={9} fill="currentColor" />
                <span>DETENER</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#8b949e]">Time:</span>
            <span className="text-[#f0f6fc] tabular-nums">{formatSMPTE(currentTime)}</span>
          </div>
        </div>

        {/* ── CENTRAL OPTICAL VIEWPORT ── */}
        <div className="flex-1 relative flex items-center justify-center bg-[#000000] overflow-hidden">
          {/* CRT / Scanline Overlay */}
          <div className="absolute inset-0 scanline-overlay z-10 pointer-events-none opacity-25" />

          {/* Real Video Player or Fallback Reference Stream */}
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              loop
              muted={isMuted}
              playsInline
              onLoadedMetadata={() => {
                if (videoRef.current) setVideoDuration(videoRef.current.duration || targetDuration);
              }}
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
              }}
              className="max-h-full max-w-full object-contain z-0"
            />
          ) : (
            <div className="w-full h-full relative flex items-center justify-center">
              {referenceImage ? (
                <img
                  src={referenceImage}
                  alt="Reference viewport"
                  className="max-h-full max-w-full object-contain filter contrast-105 brightness-95"
                />
              ) : (
                <div className="text-[#484f58] text-[11px] font-mono tracking-wider flex items-center gap-2">
                  <Crosshair size={16} className="text-[#00f0ff]" />
                  <span>SEÑAL ÓPTICA EN ESPERA</span>
                </div>
              )}
            </div>
          )}

          {/* Contextual In-Screen Banner: Task Stopped by User */}
          {pipelineStatus === 'STOPPED' && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-4 space-y-2 select-none">
              <div className="px-3 py-1 bg-[#ffaa00]/20 border border-[#ffaa00] text-[#ffaa00] font-bold text-xs flex items-center gap-2 tracking-wider">
                <AlertTriangle size={15} />
                <span>TASK STOPPED BY USER</span>
              </div>
              <p className="text-[10px] text-[#8b949e] font-mono">
                La solicitud de inferencia GPU fue abortada por el operador.
              </p>
              <button
                type="button"
                onClick={resetPipeline}
                className="mt-2 px-3 py-1 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#00f0ff] text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw size={12} />
                <span>Reiniciar Monitor</span>
              </button>
            </div>
          )}

          {/* Contextual In-Screen Banner: Error / Failure */}
          {pipelineStatus === 'FAILED' && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-4 space-y-2 select-none">
              <div className="px-3 py-1 bg-[#ff003c]/20 border border-[#ff003c] text-[#ff003c] font-bold text-xs flex items-center gap-2 tracking-wider">
                <AlertTriangle size={15} />
                <span>FALLO EN CLÚSTER DE INFERENCIA</span>
              </div>
              <p className="text-[10px] text-[#ffaa00] font-mono max-w-md text-center break-words">
                {errorMessage || currentStepMessage}
              </p>
              <button
                type="button"
                onClick={resetPipeline}
                className="mt-2 px-3 py-1 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#00f0ff] text-[10px] font-bold cursor-pointer"
              >
                Reintentar Configuración
              </button>
            </div>
          )}

          {/* Tactical Crosshair Reticle & HUD Overlay */}
          {reticleEnabled && (
            <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between">
              {/* Corner Brackets */}
              <div className="flex justify-between">
                <div className="w-5 h-5 border-t-2 border-l-2 border-[#00f0ff]/50" />
                <div className="w-5 h-5 border-t-2 border-r-2 border-[#00f0ff]/50" />
              </div>

              {/* Central Target Center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border border-[#00f0ff]/30 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-[#00f0ff]/70 rounded-full" />
                </div>
              </div>

              <div className="flex justify-between items-end">
                <div className="w-5 h-5 border-b-2 border-l-2 border-[#00f0ff]/50" />
                <div className="w-5 h-5 border-b-2 border-r-2 border-[#00f0ff]/50" />
              </div>
            </div>
          )}

          {/* Dynamic Spatial Overlay: Azimuth & Camera Matrix */}
          <div className="absolute bottom-2 left-3 z-10 text-[9px] text-[#00f0ff] font-mono pointer-events-none select-none space-y-0.5">
            <div>AZ_000° ── AZ_180°</div>
            <div>ROT: {cameraGeometry.yaw.toFixed(2)}° | CAM: {cameraGeometry.pitch.toFixed(2)}</div>
          </div>
        </div>

        {/* ── LOWER BEZEL: SCRUBBER & FRAME CONTROLS ── */}
        <div className="h-14 px-3 bg-[#13171f] border-t border-[#30363d] flex flex-col justify-center space-y-1.5 shrink-0 text-[10px]">
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-2">
            <span className="text-[#8b949e] tabular-nums w-12 text-right">
              {formatSMPTE(currentTime).slice(3)}
            </span>
            <input
              type="range"
              min="0"
              max={videoDuration}
              step="0.0416"
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 cursor-pointer accent-[#00f0ff]"
            />
            <span className="text-[#8b949e] tabular-nums w-12">
              {formatSMPTE(videoDuration).slice(3)}
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between text-[#8b949e]">
            {/* Left Playback Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                className="w-7 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#f0f6fc] flex items-center justify-center cursor-pointer transition-none"
                title={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>

              <button
                type="button"
                onClick={() => stepFrame(-1)}
                className="px-1.5 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#c9d1d9] flex items-center justify-center text-[9px] cursor-pointer"
                title="Cuadro anterior (-1F)"
              >
                -1F
              </button>

              <button
                type="button"
                onClick={() => stepFrame(1)}
                className="px-1.5 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#c9d1d9] flex items-center justify-center text-[9px] cursor-pointer"
                title="Cuadro siguiente (+1F)"
              >
                +1F
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentTime(0);
                  if (videoRef.current) videoRef.current.currentTime = 0;
                }}
                className="w-6 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#8b949e] flex items-center justify-center cursor-pointer"
                title="Reiniciar reproducción"
              >
                <RotateCcw size={11} />
              </button>
            </div>

            {/* Center Status Feedback */}
            <div className="text-[9px] text-[#00f0ff] font-bold">
              {isProcessing ? `PIPELINE: ${renderProgress}%` : currentStepMessage}
            </div>

            {/* Right Tools */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReticleEnabled(!reticleEnabled)}
                className={`w-6 h-6 border flex items-center justify-center cursor-pointer ${
                  reticleEnabled ? 'border-[#00f0ff] text-[#00f0ff]' : 'border-[#30363d] text-[#484f58]'
                }`}
                title="Alternar retícula táctica"
              >
                <Crosshair size={11} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (videoRef.current) videoRef.current.muted = !isMuted;
                }}
                className="w-6 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#c9d1d9] flex items-center justify-center cursor-pointer"
                title={isMuted ? 'Activar audio' : 'Silenciar'}
              >
                {isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
              </button>

              {videoUrl && (
                <a
                  href={videoUrl}
                  download={`agnes_${activeTaskId}.mp4`}
                  className="w-6 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#00ff41] text-[#00ff41] flex items-center justify-center cursor-pointer"
                  title="Descargar video MP4"
                >
                  <Download size={11} />
                </a>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                className="w-6 h-6 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#8b949e] flex items-center justify-center cursor-pointer"
                title="Pantalla completa"
              >
                <Maximize2 size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
