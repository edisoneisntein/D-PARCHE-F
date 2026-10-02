import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { VideoGeneratorPanel } from './components/VideoGeneratorPanel';
import { VideoMonitorHUD } from './components/VideoMonitorHUD';
import { TelemetryPanel } from './components/TelemetryPanel';
import { useVideoStore } from './store/videoStore';

// Initial asset paths
import mainAlleyImg from './assets/images/cyberpunk_recon_alley_1790913707292.jpg';
import depthMapImg from './assets/images/depth_map_alley_1790913717664.jpg';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('Simple');
  const { 
    activeTaskId, 
    referenceImage, 
    setParam, 
    setCompletedVideo 
  } = useVideoStore();

  // Initialize reference image and depth map if empty
  useEffect(() => {
    if (!referenceImage) {
      setParam('referenceImage', mainAlleyImg);
      setParam('depthMapUrl', depthMapImg);
      setParam('referenceImages', [
        mainAlleyImg,
        mainAlleyImg,
        mainAlleyImg,
        mainAlleyImg,
        mainAlleyImg,
      ]);
    }
  }, [referenceImage, setParam]);

  // Sync existing tasks from server on mount
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    fetch('/api/tasks')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.tasks && data.tasks.length > 0) {
          const latest = data.tasks[0];
          setParam('activeTaskId', latest.task_id || 'simple_628611bd600');
          if (latest.status === 'completed') {
            setParam('videoUrl', `/api/video/${latest.task_id}`);
            setParam('pipelineStatus', 'COMPLETED');
            setParam('renderProgress', 100);
            setParam('currentStepMessage', 'COMPLETADO');
          } else if (latest.status === 'running') {
            setParam('pipelineStatus', 'RUNNING');
            setParam('isProcessing', true);
            setParam('renderProgress', latest.current_progress || 25);
            setParam('currentStepMessage', latest.current_message || 'Renderizando video con Agnes AI...');

            timer = setInterval(async () => {
              try {
                const res = await fetch(`/api/tasks/${latest.task_id}`);
                if (res.ok) {
                  const tData = await res.json();
                  if (tData.current_progress !== undefined) setParam('renderProgress', tData.current_progress);
                  if (tData.current_message) setParam('currentStepMessage', tData.current_message);
                  if (tData.status === 'completed') {
                    if (timer) clearInterval(timer);
                    setParam('renderProgress', 100);
                    setParam('isProcessing', false);
                    setParam('pipelineStatus', 'COMPLETED');
                    setParam('currentStepMessage', 'COMPLETADO');
                    setParam('videoUrl', `/api/video/${latest.task_id}`);
                  } else if (tData.status === 'failed') {
                    if (timer) clearInterval(timer);
                    setParam('isProcessing', false);
                    setParam('pipelineStatus', 'FAILED');
                    setParam('currentStepMessage', tData.current_message || 'Inferencia detenida');
                  }
                }
              } catch {}
            }, 1000);
          }
        }
      })
      .catch(() => {});

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [setParam]);

  const handleSelectGalleryVideo = (url: string, id: string) => {
    setCompletedVideo(url, id);
  };

  return (
    <Layout
      activeTaskId={activeTaskId}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSelectGalleryVideo={handleSelectGalleryVideo}
      leftPanel={<VideoGeneratorPanel />}
      centerPanel={<VideoMonitorHUD />}
      rightPanel={<TelemetryPanel />}
    />
  );
}
