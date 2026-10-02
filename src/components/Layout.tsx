import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Sparkles, 
  Scissors, 
  Radio, 
  Settings, 
  Sliders, 
  Video,
  FolderOpen,
  User,
  X,
  Play,
  Download,
  Key,
  Globe,
  CheckCircle2,
  RefreshCw,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import { VideoApiClient } from '../services/videoApiClient';

interface LayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  activeTaskId?: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSelectGalleryVideo?: (videoUrl: string, taskId: string) => void;
}

interface GalleryItem {
  task_id: string;
  title: string;
  media_url: string;
  thumb_url: string;
  status: string;
  created_at?: string;
}

type ConnectionState = 'CONNECTED' | 'KEY_REQUIRED' | 'CONNECTING' | 'ERROR';

export const Layout: React.FC<LayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
  activeTaskId = 'simple_628611bd600',
  activeTab,
  onTabChange,
  onSelectGalleryVideo,
}) => {
  const pipelineStatus = useVideoStore((s) => s.pipelineStatus);
  const renderProgress = useVideoStore((s) => s.renderProgress);

  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showGalleryModal, setShowGalleryModal] = useState<boolean>(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [activeDomain, setActiveDomain] = useState<string>('com');
  const [configSaved, setConfigSaved] = useState<boolean>(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Load backend configuration and verify connection status
  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.api_key && data.api_key !== '***') setApiKeyInput(data.api_key);
          if (data.agnes_domain) setActiveDomain(data.agnes_domain);
          if (data.has_api_key) {
            VideoApiClient.testConnection(undefined, data.agnes_domain)
              .then((testData) => {
                if (testData && testData.ok) {
                  setConnectionState('CONNECTED');
                } else {
                  setConnectionState('ERROR');
                }
              })
              .catch(() => setConnectionState('ERROR'));
          } else {
            setConnectionState('KEY_REQUIRED');
          }
        }
      })
      .catch(() => setConnectionState('ERROR'));
  }, []);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const data = await VideoApiClient.testConnection(apiKeyInput, activeDomain);
      if (data.ok) {
        setConnectionState('CONNECTED');
        setTestResult({
          ok: true,
          message: data.message || 'Conexión verificada con la API de Agnes AI',
        });
      } else {
        setConnectionState('ERROR');
        setTestResult({
          ok: false,
          message: data.error || 'Error al conectar con Agnes AI',
        });
      }
    } catch (e: unknown) {
      setConnectionState('ERROR');
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Error de red',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Fetch gallery items
  const loadGallery = () => {
    fetch('/api/gallery')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.items) {
          setGalleryItems(data.items);
        }
      })
      .catch(() => {});
  };

  const handleTabClick = (tabName: string) => {
    onTabChange(tabName);
    if (tabName === 'Galería') {
      loadGallery();
      setShowGalleryModal(true);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKeyInput }),
      });
      await fetch('/api/config/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: activeDomain }),
      });
      setConfigSaved(true);
      if (apiKeyInput.trim()) {
        handleTestConnection();
      }
      setTimeout(() => {
        setConfigSaved(false);
        setShowConfigModal(false);
      }, 1200);
    } catch {}
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07090e] text-[#c9d1d9] font-mono select-none overflow-hidden relative">
      {/* ── 1. MAIN TOP HEADER ── */}
      <header className="h-11 px-4 bg-[#0d1117] border-b border-[#21262d] flex items-center justify-between z-40 shrink-0">
        {/* Left Brand Lockup */}
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 flex items-center justify-center text-[#00f0ff] hud-text-glow">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold tracking-wide text-[#f0f6fc]">
            Agnes Video Generator
          </span>
        </div>

        {/* Right Status Actions */}
        <div className="flex items-center gap-3">
          {/* FSM Connection State Badge */}
          {connectionState === 'CONNECTED' && (
            <div 
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-1 hud-green-box flex items-center gap-1.5 cursor-pointer hover:brightness-125 transition-none"
              title="Estado: Conectado a Servidor Agnes API"
            >
              <span className="w-2 h-2 bg-[#00ff41] animate-pulse" />
              <span className="text-[#00ff41] font-bold text-[10px] tracking-wider uppercase hud-green-glow">
                CONECTADO
              </span>
            </div>
          )}

          {connectionState === 'KEY_REQUIRED' && (
            <div 
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-1 bg-[#ffaa00]/15 border border-[#ffaa00] flex items-center gap-1.5 cursor-pointer hover:brightness-125 transition-none"
              title="Estado: Clave de API requerida. Haga clic para configurar"
            >
              <span className="w-2 h-2 bg-[#ffaa00] animate-pulse" />
              <span className="text-[#ffaa00] font-bold text-[10px] tracking-wider uppercase">
                CLAVE REQUERIDA
              </span>
            </div>
          )}

          {connectionState === 'CONNECTING' && (
            <div 
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-1 bg-[#00f0ff]/15 border border-[#00f0ff] flex items-center gap-1.5 cursor-pointer transition-none"
            >
              <span className="w-2 h-2 bg-[#00f0ff] animate-ping" />
              <span className="text-[#00f0ff] font-bold text-[10px] tracking-wider uppercase">
                CONECTANDO...
              </span>
            </div>
          )}

          {connectionState === 'ERROR' && (
            <div 
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-1 bg-[#ff003c]/15 border border-[#ff003c] flex items-center gap-1.5 cursor-pointer hover:brightness-125 transition-none"
              title="Error al conectar con la API. Haga clic para revisar"
            >
              <span className="w-2 h-2 bg-[#ff003c] animate-pulse" />
              <span className="text-[#ff003c] font-bold text-[10px] tracking-wider uppercase">
                ERROR DE ENLACE
              </span>
            </div>
          )}

          {/* Config Button */}
          <button 
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="w-7 h-7 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#8b949e] hover:text-[#f0f6fc] flex items-center justify-center cursor-pointer transition-none"
            title="Configuración de Sistema"
          >
            <Settings size={13} />
          </button>
        </div>
      </header>

      {/* ── 2. WORKSPACE TAB STRIP ── */}
      <nav className="h-8 px-4 bg-[#090c10] border-b border-[#21262d] flex items-center justify-between text-[11px] font-mono shrink-0">
        <div className="flex items-center gap-1 h-full">
          {[
            { id: 'Simple', label: 'Simple' },
            { id: 'Creative', label: 'Creativo' },
            { id: 'Manuscrito', label: 'Manuscrito' },
            { id: 'Anchor', label: 'Presentador' },
            { id: 'Poesía', label: 'Poesía' },
            { id: 'Galería', label: 'Galería' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`h-full px-3 text-[11px] font-medium flex items-center gap-1.5 border-b-2 transition-none cursor-pointer ${
                  isActive
                    ? 'border-[#00f0ff] text-[#00f0ff] bg-[#161b22]/50 font-bold'
                    : 'border-transparent text-[#8b949e] hover:text-[#f0f6fc]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[10px] text-[#8b949e] flex items-center gap-2">
          <span>TASK ID:</span>
          <span className="text-[#f0f6fc] font-bold">{activeTaskId}</span>
        </div>
      </nav>

      {/* ── 3. MAIN WORKSPACE WITH 3 COLUMNS ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Leftmost Vertical Icon Strip */}
        <aside className="w-10 bg-[#090c10] border-r border-[#21262d] flex flex-col items-center justify-between py-3 shrink-0">
          <div className="flex flex-col items-center gap-3 text-[#8b949e]">
            <button 
              type="button"
              onClick={() => onTabChange('Simple')}
              className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-none ${
                activeTab === 'Simple' ? 'text-[#00f0ff] bg-[#161b22]' : 'hover:text-[#f0f6fc]'
              }`}
              title="Modo Simple"
            >
              <Sparkles size={14} />
            </button>
            <button 
              type="button"
              onClick={() => onTabChange('Creative')}
              className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-none ${
                activeTab === 'Creative' ? 'text-[#00f0ff] bg-[#161b22]' : 'hover:text-[#f0f6fc]'
              }`}
              title="Modo Creativo"
            >
              <Scissors size={14} />
            </button>
            <button 
              type="button"
              onClick={() => onTabChange('Manuscrito')}
              className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-none ${
                activeTab === 'Manuscrito' ? 'text-[#00f0ff] bg-[#161b22]' : 'hover:text-[#f0f6fc]'
              }`}
              title="Modo Manuscrito"
            >
              <FileText size={14} />
            </button>
            <button 
              type="button"
              onClick={() => onTabChange('Anchor')}
              className={`w-7 h-7 flex items-center justify-center cursor-pointer transition-none ${
                activeTab === 'Anchor' ? 'text-[#00f0ff] bg-[#161b22]' : 'hover:text-[#f0f6fc]'
              }`}
              title="Modo Presentador"
            >
              <Radio size={14} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button 
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="w-7 h-7 text-[#8b949e] hover:text-[#f0f6fc] flex items-center justify-center cursor-pointer"
            >
              <Settings size={14} />
            </button>
          </div>
        </aside>

        {/* ── 3-COLUMN CSS GRID (1.2fr 2fr 1.1fr) ── */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_2fr_1.1fr] overflow-hidden min-h-0 bg-[#07090e]">
          <section className="h-full overflow-hidden flex flex-col min-h-0">
            {leftPanel}
          </section>

          <section className="h-full overflow-hidden flex flex-col min-h-0">
            {centerPanel}
          </section>

          <section className="h-full overflow-hidden flex flex-col min-h-0">
            {rightPanel}
          </section>
        </main>
      </div>

      {/* ── 4. BOTTOM STATUS BAR FOOTER ── */}
      <footer className="h-9 px-4 bg-[#0d1117] border-t border-[#21262d] flex items-center justify-between text-[10px] shrink-0 font-mono">
        <div className="space-y-0.5">
          <div className="text-[#f0f6fc] font-bold">
            Registro Activo: {activeTaskId}
          </div>
          <div className="text-[9px] text-[#8b949e] flex items-center gap-3">
            <span>Tipo: {activeTab.toLowerCase()}</span>
            <span>Motor: Agnes Video GPU</span>
          </div>
        </div>

        {/* Dynamic FSM Pipeline Status Badge */}
        <div className="flex items-center gap-2">
          {pipelineStatus === 'IDLE' && (
            <span className="text-[#8b949e] font-bold">MOTOR EN ESPERA</span>
          )}
          {pipelineStatus === 'SUBMITTING' && (
            <span className="text-[#00f0ff] font-bold animate-pulse">ENVIANDO TAREA...</span>
          )}
          {pipelineStatus === 'RUNNING' && (
            <span className="text-[#ffaa00] font-bold animate-pulse">
              EN PROCESO ({renderProgress}%)
            </span>
          )}
          {pipelineStatus === 'COMPLETED' && (
            <span className="text-[#00ff41] font-bold tracking-widest uppercase hud-green-glow">
              COMPLETADO
            </span>
          )}
          {pipelineStatus === 'FAILED' && (
            <span className="text-[#ff003c] font-bold">FALLO EN CLÚSTER</span>
          )}
          {pipelineStatus === 'STOPPED' && (
            <span className="text-[#ffaa00] font-bold">DETENIDO POR OPERADOR</span>
          )}
        </div>
      </footer>

      {/* ── MODAL DE CONFIGURACIÓN REAL ── */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0d1117] border border-[#00f0ff] panel-bevel-frame p-4 space-y-4 shadow-[0_0_20px_rgba(0,240,255,0.3)] font-mono">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <div className="flex items-center gap-2 text-[#00f0ff] font-bold text-xs">
                <Settings size={14} />
                <span>CONFIGURACIÓN DEL SISTEMA</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowConfigModal(false)} 
                className="text-[#8b949e] hover:text-[#f0f6fc] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <label className="text-[#8b949e] block font-mono flex items-center gap-1">
                  <Key size={12} />
                  <span>AGNES_API_KEY</span>
                </label>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full h-8 bg-[#161b22] border border-[#30363d] px-2 text-[#f0f6fc] font-mono outline-none focus:border-[#00f0ff]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#8b949e] block font-mono flex items-center gap-1">
                  <Globe size={12} />
                  <span>DOMINIO DE API</span>
                </label>
                <select
                  value={activeDomain}
                  onChange={(e) => setActiveDomain(e.target.value)}
                  className="w-full h-8 bg-[#161b22] border border-[#30363d] px-2 text-[#f0f6fc] font-mono outline-none focus:border-[#00f0ff]"
                >
                  <option value="com">apihub.agnes-ai.com (Internacional)</option>
                  <option value="cn">api.agnes-ai.cn (China)</option>
                  <option value="cn_bak">apihub.agnes-ai.com (Respaldo)</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] hover:border-[#00f0ff] text-[#00f0ff] text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Activity size={12} className={testingConnection ? 'animate-spin' : ''} />
                  <span>{testingConnection ? 'Verificando...' : 'Probar Conexión API'}</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-2 border text-[10px] flex items-center gap-1.5 ${
                    testResult.ok
                      ? 'bg-[#00ff41]/10 border-[#00ff41] text-[#00ff41]'
                      : 'bg-[#ff003c]/10 border-[#ff003c] text-[#ff003c]'
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  <span>{testResult.message}</span>
                </div>
              )}

              {configSaved && (
                <div className="p-2 bg-[#00ff41]/10 border border-[#00ff41] text-[#00ff41] flex items-center gap-1.5 text-[10px]">
                  <CheckCircle2 size={13} />
                  <span>Configuración guardada correctamente en el servidor.</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#21262d]">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] text-[10px] cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-4 py-1.5 bg-[#00f0ff]/20 border border-[#00f0ff] text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#000] text-[10px] font-bold cursor-pointer"
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE GALERÍA REAL ── */}
      {showGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[80vh] bg-[#0d1117] border border-[#00f0ff] panel-bevel-frame p-4 flex flex-col space-y-3 shadow-[0_0_20px_rgba(0,240,255,0.3)] font-mono">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
              <div className="flex items-center gap-2 text-[#00f0ff] font-bold text-xs">
                <Video size={14} />
                <span>GALERÍA DE VIDEOS GENERADOS ({galleryItems.length})</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowGalleryModal(false)} 
                className="text-[#8b949e] hover:text-[#f0f6fc] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-3 p-1">
              {galleryItems.map((item) => (
                <div
                  key={item.task_id}
                  className="bg-[#161b22] border border-[#30363d] p-2 space-y-2 group hover:border-[#00f0ff] transition-none flex flex-col justify-between"
                >
                  <div className="w-full h-28 bg-[#090c10] border border-[#21262d] relative flex items-center justify-center overflow-hidden">
                    {item.thumb_url ? (
                      <img
                        src={item.thumb_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Video size={24} className="text-[#30363d]" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectGalleryVideo) {
                            onSelectGalleryVideo(item.media_url, item.task_id);
                          }
                          setShowGalleryModal(false);
                        }}
                        className="p-2 bg-[#00f0ff] text-[#000] rounded-full hover:scale-110 transition-transform cursor-pointer"
                        title="Cargar video en el monitor"
                      >
                        <Play size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-[#f0f6fc] font-bold truncate">
                      {item.title}
                    </div>
                    <div className="text-[9px] text-[#8b949e]">
                      ID: {item.task_id.slice(0, 10)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#21262d] text-[9px]">
                    <span className="text-[#00ff41]">{item.status}</span>
                    <a
                      href={item.media_url}
                      download={`agnes_${item.task_id}.mp4`}
                      className="text-[#00f0ff] hover:underline flex items-center gap-1"
                    >
                      <Download size={10} />
                      <span>Descargar</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#21262d]">
              <button
                type="button"
                onClick={() => setShowGalleryModal(false)}
                className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] text-[10px] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
