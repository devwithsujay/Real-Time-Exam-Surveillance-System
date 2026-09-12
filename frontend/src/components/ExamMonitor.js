import React, { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, WifiOff, Camera, Eye, Radio } from 'lucide-react';

function ExamMonitor({ exam, participants, ws, connected, registerFrameHandler }) {
  const feedsRef = useRef({});
  const [expandedFeed, setExpandedFeed] = useState(null);

  // Handle incoming WebSocket frames via refs (no re-render per frame)
  useEffect(() => {
    if (!registerFrameHandler) return;

    const handleMessage = (payload) => {
      const cameraId = payload.camera_id || 0;

      if (payload.binary && payload.data) {
        const canvas = document.getElementById('camera-canvas-' + cameraId);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const blob = new Blob([payload.data], { type: 'image/jpeg' });
          createImageBitmap(blob).then(bitmap => {
            const parent = canvas.parentElement;
            const w = parent.clientWidth;
            const h = parent.clientHeight;
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close();
          }).catch(() => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
            };
            img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
          });
          const placeholder = document.getElementById('placeholder-' + cameraId);
          if (placeholder) placeholder.style.display = 'none';
        }
      } else if (payload.tracks) {
        const overlay = document.getElementById('track-overlay-' + cameraId);
        if (overlay) {
          renderTrackBoxes(overlay, payload.tracks, cameraId);
        }
      }
    };

    const unregister = registerFrameHandler(handleMessage);
    return unregister;
  }, [registerFrameHandler]);

  // Force update only when cameras appear/disappear (not per frame)
  const cameraIds = Object.keys(feedsRef.current);
  const displayCameras = expandedFeed ? [expandedFeed] : cameraIds.length > 0 ? cameraIds : ['0'];

  return (
    <div className="h-full flex flex-col bg-[#f5f5f7] dark:bg-[#000000] overflow-hidden">
      {/* Sub-toolbar (Apple Clean Strip) */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[#0071e3]" />
            <h2 className="text-xs font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
              Live Video Feeds
            </h2>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border ${
            connected
              ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25'
              : 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#34c759] breathe-dot' : 'bg-[#86868b]'}`} />
            {connected ? '30 FPS • Live' : 'Standby'}
          </span>

          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full bg-black/5 dark:bg-white/10 text-[#86868b]">
            <Camera className="w-3 h-3 text-[#86868b]" />
            {displayCameras.length} Camera{displayCameras.length !== 1 ? 's' : ''} Online
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-2 text-xs text-[#86868b] bg-black/5 dark:bg-white/10 px-3 py-1 rounded-full">
            <span>1280x720</span>
            <span className="text-black/20 dark:text-white/20">•</span>
            <span className="text-[#34c759] font-medium">~30 FPS</span>
            <span className="text-black/20 dark:text-white/20">•</span>
            <span className="text-[#0071e3] font-medium">YOLOv8 + CUDA</span>
          </div>
          {exam && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs text-[#1d1d1f] dark:text-white">
              <span className="text-[#86868b]">Room:</span>
              <span className="font-medium truncate max-w-[140px]">{exam.exam_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Camera Grid View */}
      <div className="flex-1 overflow-hidden p-4 sm:p-5 bg-[#f5f5f7] dark:bg-[#000000]">
        {displayCameras.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-[#86868b] max-w-sm bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-8 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/10 flex items-center justify-center mx-auto mb-3 text-[#86868b]">
                <WifiOff className="w-5 h-5 text-[#86868b]" />
              </div>
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white tracking-tight">No Video Stream Active</p>
              <p className="text-xs text-[#86868b] mt-1 leading-relaxed">
                Start the examination session to activate real-time camera ingestion and gaze tracking.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid h-full gap-4 transition-all duration-300 ${
              expandedFeed ? 'grid-cols-1' :
              displayCameras.length === 1 ? 'grid-cols-1' :
              displayCameras.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
              displayCameras.length <= 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' :
              'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {displayCameras.map((camId) => (
              <CameraFeed
                key={camId}
                cameraId={camId}
                isExpanded={expandedFeed === camId}
                onExpand={() => setExpandedFeed(expandedFeed === camId ? null : camId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CameraFeed({ cameraId, isExpanded, onExpand }) {
  return (
    <div className="relative bg-[#000000] dark:bg-[#1c1c1e] rounded-3xl border border-black/[0.08] dark:border-white/[0.10] overflow-hidden group flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all">
      {/* Floating Top Left HUD Glass Capsule */}
      <div className="absolute top-3.5 left-3.5 z-20 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white flex items-center gap-2 shadow-xs">
        <span className="w-2 h-2 rounded-full bg-[#34c759] breathe-dot" />
        <span className="text-xs font-medium tracking-tight">Camera {Number(cameraId) + 1}</span>
        <span className="text-[10px] text-white/70 border-l border-white/20 pl-2">Tracking Active</span>
      </div>

      {/* Floating Top Right Controls */}
      <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-1.5">
        <button
          onClick={onExpand}
          className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white/90 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
          aria-label={isExpanded ? 'Restore grid view' : 'Maximize camera feed'}
          title={isExpanded ? 'Restore Grid' : 'Maximize Video Stream'}
        >
          {isExpanded ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>
      </div>

      {/* Video Stream Canvas */}
      <div className="relative w-full h-full min-h-[240px] flex items-center justify-center bg-[#070c18] dark:bg-[#000000] overflow-hidden">
        <canvas
          id={`camera-canvas-${cameraId}`}
          className="w-full h-full object-contain"
          width={1280}
          height={720}
        />
        <div id={`track-overlay-${cameraId}`} className="absolute inset-0 pointer-events-none" />

        {/* Apple Restful Placeholder */}
        <div id={`placeholder-${cameraId}`} className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/70 bg-[#141416] p-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-3 shadow-inner">
            <Camera className="w-6 h-6 text-white/80" />
          </div>
          <p className="text-xs font-semibold text-white tracking-tight">Camera Feed Ready</p>
          <p className="text-[11px] text-white/50 mt-1 max-w-xs leading-normal">
            Awaiting live video ingestion from examination room node.
          </p>
        </div>
      </div>

      {/* Floating Bottom Info Capsule */}
      <div className="absolute bottom-3 left-3 right-3 z-20 px-3.5 py-1.5 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-between text-[11px] text-white/80">
        <span className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-[#0a84ff]" />
          <span className="font-medium text-white/90">Multimodal Gaze & Object Tracking</span>
        </span>
        <span className="font-mono text-white/60 text-[10px]">NODE 0{Number(cameraId) + 1}</span>
      </div>
    </div>
  );
}

function renderTrackBoxes(overlay, tracks, cameraId) {
  const canvas = document.getElementById('camera-canvas-' + cameraId);
  const cw = canvas ? canvas.width : 1280;
  const ch = canvas ? canvas.height : 720;
  const vw = 1280, vh = 720;
  const sx = cw / vw, sy = ch / vh;

  overlay.innerHTML = '';
  for (const track of tracks) {
    if (!track.bbox) continue;
    const [x1, y1, x2, y2] = track.bbox;
    const isFlagged = track.flagged || track.suspicious;
    const box = document.createElement('div');
    const borderColor = isFlagged ? '#ff3b30' : '#34c759';
    const textColor = '#ffffff';
    const tagBg = isFlagged ? '#ff3b30' : '#34c759';

    box.style.cssText = `
      position: absolute;
      left: ${x1 * sx}px;
      top: ${y1 * sy}px;
      width: ${(x2 - x1) * sx}px;
      height: ${(y2 - y1) * sy}px;
      border: 2px solid ${borderColor};
      border-radius: 8px;
      box-shadow: 0 2px 10px ${isFlagged ? 'rgba(255, 59, 48, 0.4)' : 'rgba(52, 199, 89, 0.3)'};
      pointer-events: none;
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: -24px;
      left: 0;
      font-size: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 600;
      background: ${tagBg};
      color: ${textColor};
      padding: 1px 7px;
      border-radius: 9999px;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    `;
    label.textContent = (isFlagged ? 'Attention #' : 'Track #') + track.track_id;
    box.appendChild(label);

    overlay.appendChild(box);
  }
}

export default React.memo(ExamMonitor);
