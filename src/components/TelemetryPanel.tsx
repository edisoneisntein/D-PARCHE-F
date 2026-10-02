import React, { useEffect, useRef } from 'react';
import { Maximize2, Cpu, HardDrive, Activity, Compass } from 'lucide-react';
import { ThreeWireframeViewport } from './ThreeWireframeViewport';
import { useVideoStore } from '../store/videoStore';
import { globalTelemetryStream } from '../services/telemetryStream';

export const TelemetryPanel: React.FC = () => {
  const depthMapUrl = useVideoStore((s) => s.depthMapUrl);
  const telemetry = useVideoStore((s) => s.telemetry);
  const cameraGeometry = useVideoStore((s) => s.cameraGeometry);
  const updateTelemetry = useVideoStore((s) => s.updateTelemetry);
  const updateCameraGeometry = useVideoStore((s) => s.updateCameraGeometry);

  const radarCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Subscribe to Real-Time SSE Telemetry Stream ──
  useEffect(() => {
    const unsubscribe = globalTelemetryStream.subscribe((data) => {
      updateTelemetry(data);
    });
    return () => {
      unsubscribe();
    };
  }, [updateTelemetry]);

  // ── Polar Radar Canvas (Hardware & GPU Topographic Visualization) ──
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let tick = 0;

    const renderRadar = () => {
      animId = requestAnimationFrame(renderRadar);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, w, h);

      tick += 0.025;

      const cx = w * 0.65;
      const cy = h * 0.52;
      const maxR = 62;

      // Concentric Polar Rings
      ctx.strokeStyle = 'rgba(72, 79, 88, 0.4)';
      ctx.lineWidth = 0.8;
      [0.35, 0.65, 1.0].forEach((ratio) => {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crossed Radial Axes
      ctx.beginPath();
      ctx.moveTo(cx - maxR * 1.15, cy);
      ctx.lineTo(cx + maxR * 1.15, cy);
      ctx.moveTo(cx, cy - maxR * 1.15);
      ctx.lineTo(cx, cy + maxR * 1.15);
      const diag = maxR * 0.85;
      ctx.moveTo(cx - diag, cy - diag);
      ctx.lineTo(cx + diag, cy + diag);
      ctx.moveTo(cx + diag, cy - diag);
      ctx.lineTo(cx - diag, cy + diag);
      ctx.stroke();

      // Dynamic Polar Polygon derived from real telemetry load
      const numPoints = 12;
      const points: { x: number; y: number }[] = [];
      const loadFactor = Math.max(0.2, Math.min(1.0, telemetry.cpuLoad / 100));

      for (let i = 0; i < numPoints; i++) {
        const theta = (i / numPoints) * Math.PI * 2 + tick * 0.2;
        const wave = Math.sin(theta * 3 + tick) * 0.15 + Math.cos(theta * 2 - tick) * 0.1;
        const r = maxR * Math.min(1.05, Math.max(0.3, loadFactor + wave));
        points.push({
          x: cx + r * Math.cos(theta),
          y: cy + r * Math.sin(theta),
        });
      }

      // Draw Filled Shape
      ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.beginPath();
      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();

      // Outer Stroke
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Central Pulsing Center Dot
      ctx.fillStyle = '#00ff41';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    renderRadar();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [telemetry.cpuLoad]);

  return (
    <aside className="h-full flex flex-col bg-[#0b0e14] border-l border-[#21262d] overflow-y-auto select-none p-2.5 space-y-2.5 font-mono text-[10px]">
      {/* ── 1. MODULE: 3D WIREFRAME MESH VIEWPORT ── */}
      <div className="panel-bevel-frame p-2 bg-[#090c10] border border-[#21262d] flex flex-col space-y-1.5 shrink-0">
        <div className="flex items-center justify-between text-[#8b949e]">
          <div className="flex items-center gap-1.5 text-[#00f0ff] font-bold">
            <Compass size={12} />
            <span className="tracking-wider uppercase">VISTA ESPACIAL WIREFRAME</span>
          </div>
          <button 
            type="button"
            className="text-[#8b949e] hover:text-[#00f0ff] cursor-pointer"
            title="Centrar perspectiva espacial"
            onClick={() => updateCameraGeometry({ yaw: 33.59, pitch: 0.0 })}
          >
            <Maximize2 size={11} />
          </button>
        </div>

        <div className="w-full h-44 bg-[#05070a] border border-[#21262d] relative overflow-hidden">
          <ThreeWireframeViewport depthMapUrl={depthMapUrl} />
          <div className="absolute top-1.5 left-2 text-[9px] text-[#00f0ff] font-mono pointer-events-none select-none">
            YAW: {cameraGeometry.yaw.toFixed(1)}° | PITCH: {cameraGeometry.pitch.toFixed(1)}°
          </div>
        </div>

        <div className="text-[9px] text-[#8b949e] flex justify-between px-1">
          <span>Arrastrar para orbitar</span>
          <span className="text-[#00ff41]">WebGL ACTIVO</span>
        </div>
      </div>

      {/* ── 2. MODULE: RADAR / GPU TOPOGRAPHIC LOAD ── */}
      <div className="panel-bevel-frame p-2 bg-[#090c10] border border-[#21262d] flex flex-col space-y-1.5 shrink-0">
        <div className="flex items-center justify-between text-[#8b949e]">
          <div className="flex items-center gap-1.5 text-[#f0f6fc] font-bold">
            <Activity size={12} className="text-[#00f0ff]" />
            <span className="tracking-wider uppercase">POLAR RADAR TELEMETRY</span>
          </div>
          <span className="text-[#00ff41] font-bold text-[9px]">LIVE SSE</span>
        </div>

        <div className="w-full h-36 bg-[#05070a] border border-[#21262d] relative flex items-center justify-center overflow-hidden">
          <canvas
            ref={radarCanvasRef}
            width={260}
            height={144}
            className="w-full h-full"
          />
          <div className="absolute bottom-1.5 left-2 text-[9px] text-[#8b949e] font-mono space-y-0.5">
            <div>LOAD: <span className="text-[#00f0ff] font-bold">{telemetry.cpuLoad}%</span></div>
            <div>GPU: <span className="text-[#00ff41] font-bold">{telemetry.gpuUtilization || 64}%</span></div>
          </div>
        </div>
      </div>

      {/* ── 3. MODULE: SYSTEM RESOURCE METRICS ── */}
      <div className="panel-bevel-frame p-2 bg-[#090c10] border border-[#21262d] space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[#8b949e] font-bold border-b border-[#21262d] pb-1">
          <Cpu size={12} className="text-[#00f0ff]" />
          <span className="tracking-wider uppercase text-[#f0f6fc]">MÉTRICAS DEL NODO CLÚSTER</span>
        </div>

        {/* CPU Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#8b949e]">
            <span>Uso de CPU</span>
            <span className="text-[#f0f6fc] font-bold">{telemetry.cpuLoad}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#161b22] border border-[#30363d] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#00f0ff] to-[#00ff41] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.cpuLoad))}%` }}
            />
          </div>
        </div>

        {/* RAM Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#8b949e]">
            <span className="flex items-center gap-1">
              <HardDrive size={10} />
              <span>Memoria RAM</span>
            </span>
            <span className="text-[#f0f6fc] font-bold">
              {telemetry.usedRamGb} / {telemetry.totalRamGb} GB
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#161b22] border border-[#30363d] overflow-hidden">
            <div
              className="h-full bg-[#00f0ff] transition-all duration-500"
              style={{
                width: `${Math.min(100, (telemetry.usedRamGb / Math.max(0.1, telemetry.totalRamGb)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Node Status Grid */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 text-[9px]">
          <div className="bg-[#161b22] border border-[#21262d] p-1.5">
            <span className="text-[#8b949e] block">Tareas Activas</span>
            <span className="text-[#00f0ff] font-bold text-[11px]">{telemetry.activeTasks}</span>
          </div>
          <div className="bg-[#161b22] border border-[#21262d] p-1.5">
            <span className="text-[#8b949e] block">Completadas</span>
            <span className="text-[#00ff41] font-bold text-[11px]">{telemetry.completedTasks}</span>
          </div>
          <div className="bg-[#161b22] border border-[#21262d] p-1.5">
            <span className="text-[#8b949e] block">Heap Node.js</span>
            <span className="text-[#f0f6fc] font-bold text-[11px]">{telemetry.heapUsedMb} MB</span>
          </div>
          <div className="bg-[#161b22] border border-[#21262d] p-1.5">
            <span className="text-[#8b949e] block">Uptime</span>
            <span className="text-[#f0f6fc] font-bold text-[11px]">{telemetry.uptimeSeconds}s</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
