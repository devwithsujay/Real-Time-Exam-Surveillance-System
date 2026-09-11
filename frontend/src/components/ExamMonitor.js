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
    <div className="h-full flex flex-col bg-[#121011]">
      {/* HUD Header Toolbar */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-[rgba(244,241,235,0.07)] bg-[#1a1719]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[#b8789a]" />
            <h2 className="text-xs font-semibold text-[#f0ece4] font-heading">
              Live Vision Matrix
            </h2>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-mono font-medium rounded border ${
            connected
              ? 'bg-[#6ba883]/10 text-[#6ba883] border-[#6ba883]/25'
              : 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.12)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#6ba883] pulse-live' : 'bg-[#6b6560]'}`} />
            {connected ? 'Active · 30 FPS' : 'Offline'}
          </span>

          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-[#221e20] text-[#f0ece4] border border-[rgba(244,241,235,0.08)]">
            <Camera className="w-3 h-3 text-[#a89f97]" />
            {displayCameras.length} Node{displayCameras.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-2.5 text-[10px] font-mono text-[#a89f97] bg-[#221e20] px-2.5 py-1 rounded border border-[rgba(244,241,235,0.08)]">
            <span>RES: 1280x720</span>
            <span className="text-[#6b6560]">•</span>
            <span className="text-[#6ba883]">FPS: ~25-30</span>
            <span className="text-[#6b6560]">•</span>
            <span className="text-[#b8789a]">YOLOv8 + CUDA</span>
          </div>
          {exam && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] text-[11px] text-[#f0ece4]">
              <span className="text-[#a89f97]">Hall:</span>
              <span className="font-medium text-[#f0ece4] truncate max-w-[150px]">{exam.exam_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Camera Grid View */}
      <div className="flex-1 overflow-hidden p-3.5">
        {displayCameras.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-[#a89f97] max-w-sm ess-card p-8">
              <div className="w-12 h-12 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] flex items-center justify-center mx-auto mb-3 text-[#a89f97]">
                <WifiOff className="w-5 h-5 text-[#a89f97]" />
              </div>
              <p className="text-sm font-semibold text-[#f0ece4] font-heading">No Video Ingest Stream</p>
              <p className="text-xs text-[#a89f97] mt-1 leading-relaxed">
                Initiate the examination session to activate the multi-sensor computer vision pipeline.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid h-full gap-3 transition-all duration-200 ${
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
    <div className="relative bg-[#1a1719] rounded border border-[rgba(244,241,235,0.08)] overflow-hidden group flex flex-col transition-colors hover:border-[rgba(244,241,235,0.18)]">
      {/* Camera HUD Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 px-3 py-2 bg-gradient-to-b from-[#121011]/95 via-[#121011]/50 to-transparent flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#221e20] border border-[rgba(244,241,235,0.12)] text-[#f0ece4] font-mono text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6ba883] pulse-live" />
            <span className="font-semibold">CAM-0{Number(cameraId) + 1}</span>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-sans font-medium text-[#6ba883] bg-[#6ba883]/10 rounded border border-[#6ba883]/25">
            Neural tracking active
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onExpand}
            className="p-1.5 rounded bg-[#221e20] hover:bg-[#2a2528] border border-[rgba(244,241,235,0.12)] text-[#a89f97] hover:text-[#f0ece4] transition-colors"
            aria-label={isExpanded ? 'Minimize feed' : 'Expand feed'}
            title={isExpanded ? 'Restore Grid' : 'Maximize Video Stream'}
          >
            {isExpanded ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>
      </div>

      {/* Video Stream Canvas */}
      <div className="relative w-full h-full min-h-[220px] flex items-center justify-center bg-[#0b0a0a] overflow-hidden">
        <canvas
          id={`camera-canvas-${cameraId}`}
          className="w-full h-full object-contain"
          width={1280}
          height={720}
        />
        <div id={`track-overlay-${cameraId}`} className="absolute inset-0 pointer-events-none" />

        {/* Connecting / Signal Acquisition Placeholder */}
        <div id={`placeholder-${cameraId}`} className="absolute inset-0 flex flex-col items-center justify-center text-center text-[#a89f97] bg-[#1a1719]">
          <div className="mb-3">
            <div className="w-10 h-10 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] flex items-center justify-center text-[#a89f97]">
              <Camera className="w-5 h-5 text-[#a89f97]" />
            </div>
          </div>
          <p className="text-xs font-medium text-[#f0ece4]">Signal acquisition in progress...</p>
          <p className="text-[11px] text-[#a89f97] mt-0.5">Awaiting frame ingest from surveillance node</p>
        </div>
      </div>

      {/* Bottom Status Line */}
      <div className="px-3 py-1.5 bg-[#1a1719] border-t border-[rgba(244,241,235,0.07)] flex items-center justify-between text-[10px] text-[#a89f97]">
        <span className="flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-[#b8789a]" />
          <span className="font-medium text-[#f0ece4]">Real-time CV pipeline</span>
        </span>
        <span className="font-mono text-[#a89f97]">FEED_ID: CAM-{cameraId}</span>
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
    const box = document.createElement('div');
    box.style.cssText = `
      position: absolute;
      left: ${x1 * sx}px;
      top: ${y1 * sy}px;
      width: ${(x2 - x1) * sx}px;
      height: ${(y2 - y1) * sy}px;
      border: 1.5px solid rgba(107, 168, 131, 0.9);
      border-radius: 3px;
      pointer-events: none;
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: -20px;
      left: 0;
      font-size: 9px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      background: rgba(18, 16, 17, 0.95);
      border: 1px solid rgba(107, 168, 131, 0.6);
      color: #6ba883;
      padding: 0px 5px;
      border-radius: 2px;
      white-space: nowrap;
    `;
    label.textContent = 'TRK #' + track.track_id;
    box.appendChild(label);

    overlay.appendChild(box);
  }
}

export default React.memo(ExamMonitor);
