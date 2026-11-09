import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Maximize, Minimize, Camera, Eye, EyeOff, Radio,
  ChevronDown, Check, Sparkles, RefreshCw, Pin, Settings2,
  Grid3X3, Users, Volume2, AlertTriangle, X,
  CheckCircle2, Clock, Video, Download
} from 'lucide-react';
import api from '../services/api';

function formatTime(isoStr) {
  if (!isoStr) return '--:--';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

function calculateDuration(startIso, endIso) {
  if (!startIso) return null;
  try {
    const s = new Date(startIso).getTime();
    const e = endIso ? new Date(endIso).getTime() : Date.now();
    const diffMins = Math.max(1, Math.round((e - s) / 60000));
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''}`;
    const hrs = Math.floor(diffMins / 60);
    const rem = diffMins % 60;
    return `${hrs}h ${rem}m`;
  } catch {
    return null;
  }
}

function ExamMonitor({ exam, participants, ws, connected, registerFrameHandler, onExamUpdate, onNavigateTab }) {
  const [expandedFeed, setExpandedFeed] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [activeSource, setActiveSource] = useState('0');
  const [activeResolution, setActiveResolution] = useState('1280x720');
  const [selectedResolution, setSelectedResolution] = useState('1920x1080');
  const [is1080p, setIs1080p] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [cameraDropdownOpen, setCameraDropdownOpen] = useState(false);
  const [assigningToExam, setAssigningToExam] = useState(false);
  const [notification, setNotification] = useState(null);

  // Apple HUD & Overlay State
  const [showOverlays, setShowOverlays] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [inViewCount, setInViewCount] = useState(0);
  const [hasActiveThreat, setHasActiveThreat] = useState(false);

  // Completed State Management
  const isExamEnded = exam?.status === 'ENDED' || exam?.status === 'ARCHIVED';
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const dropdownRef = useRef(null);

  // Reset live preview toggle whenever current exam changes
  useEffect(() => {
    setShowLivePreview(false);
  }, [exam?.exam_id]);

  // Fetch connected webcams list from backend
  const fetchCameras = useCallback(async (forceRefresh = false) => {
    setLoadingCameras(true);
    try {
      const res = await api.cameras.list(forceRefresh);
      if (res && res.cameras) {
        setCameras(res.cameras);
        setActiveSource(res.active_source || '0');
        setActiveResolution(res.active_resolution || '1280x720');
        setIs1080p(Boolean(res.is_1080p));
      }
    } catch (err) {
      console.warn('Failed to list connected cameras:', err);
    } finally {
      setLoadingCameras(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // If exam changes, check if it has a designated camera assigned
  useEffect(() => {
    if (!exam || !exam.settings) return;
    try {
      const st = typeof exam.settings === 'string' ? JSON.parse(exam.settings) : exam.settings;
      if (st?.assigned_camera_source && st.assigned_camera_source !== activeSource) {
        // Validate against detected cameras list: fallback to first working camera if assigned source is missing
        const existsInCameras = cameras.length === 0 || cameras.some(c => String(c.source) === String(st.assigned_camera_source));
        if (existsInCameras) {
          setActiveSource(st.assigned_camera_source);
          if (st.assigned_camera_resolution) {
            setActiveResolution(st.assigned_camera_resolution);
            setSelectedResolution(st.assigned_camera_resolution);
          }
        } else if (cameras.length > 0) {
          setActiveSource(String(cameras[0].source));
        }
      }
    } catch (e) {
      console.debug('Error reading exam assigned camera:', e);
    }
  }, [exam, activeSource, cameras]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setCameraDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Frame rate & threat tracking refs
  // Direct DOM Refs for Zero-Jitter High-Frequency Rendering
  const fpsDisplayRef = useRef(null);
  const subFpsDisplayRef = useRef(null);
  const lastInViewRef = useRef(-1);
  const lastThreatRef = useRef(null);

  // High-performance direct RAF-driven GPU canvas frame consumer
  useEffect(() => {
    // If exam has ended and user has not explicitly requested preview, skip rendering loop to save CPU/GPU
    if (isExamEnded && !showLivePreview) return;
    if (!registerFrameHandler) return;

    let pendingBitmap = null;
    let isDecoding = false;
    let cachedCanvas = null;
    let cachedCtx = null;
    let cachedOverlay = null;
    let cachedPlaceholder = null;
    let rafId = null;
    let frameCount = 0;
    let lastFpsCalc = performance.now();
    let latestTracks = null;

    const renderLoop = (timestamp) => {
      if (!cachedCanvas || !cachedCanvas.isConnected) {
        cachedCanvas = document.getElementById(`camera-canvas-${activeSource}`) ||
                       document.querySelector('canvas[id^="camera-canvas"]') ||
                       document.getElementById('camera-canvas-0');
        if (cachedCanvas) {
          cachedCtx = cachedCanvas.getContext('2d', { alpha: false, desynchronized: true });
        }
      }
      if (!cachedOverlay || !cachedOverlay.isConnected) {
        cachedOverlay = document.getElementById(`track-overlay-${activeSource}`) ||
                        document.querySelector('div[id^="track-overlay-"]') ||
                        document.getElementById('track-overlay-0');
      }
      if (!cachedPlaceholder || !cachedPlaceholder.isConnected) {
        cachedPlaceholder = document.getElementById(`placeholder-${activeSource}`) ||
                            document.querySelector('div[id^="placeholder-"]') ||
                            document.getElementById('placeholder-0');
      }

      // Draw the freshest decoded bitmap directly on the display refresh tick
      if (pendingBitmap && cachedCanvas && cachedCtx) {
        const bmp = pendingBitmap;
        pendingBitmap = null;

        if (cachedCanvas.width !== bmp.width || cachedCanvas.height !== bmp.height) {
          cachedCanvas.width = bmp.width;
          cachedCanvas.height = bmp.height;
        }

        cachedCtx.drawImage(bmp, 0, 0);
        bmp.close();

        if (cachedPlaceholder && cachedPlaceholder.style.display !== 'none') {
          cachedPlaceholder.style.display = 'none';
        }

        frameCount += 1;
        const elapsed = timestamp - lastFpsCalc;
        if (elapsed >= 1000) {
          const calculatedFps = Math.min(60, Math.round(((frameCount * 1000) / elapsed) * 10) / 10);
          frameCount = 0;
          lastFpsCalc = timestamp;

          // Zero-re-render direct DOM updates
          if (fpsDisplayRef.current) {
            fpsDisplayRef.current.textContent = `${calculatedFps.toFixed(1)} FPS`;
          }
          if (subFpsDisplayRef.current) {
            subFpsDisplayRef.current.textContent = isExamEnded
              ? 'Exam Completed • Live Hardware Preview'
              : `${calculatedFps.toFixed(1)} FPS • Ingestion Active`;
          }
        }
      }

      if (latestTracks && cachedOverlay && cachedCanvas) {
        const tracksToRender = latestTracks;
        latestTracks = null;

        if (isExamEnded) {
          if (lastInViewRef.current !== 0) {
            lastInViewRef.current = 0;
            setInViewCount(0);
          }
          if (lastThreatRef.current !== false) {
            lastThreatRef.current = false;
            setHasActiveThreat(false);
          }
          renderTrackBoxes(cachedOverlay, [], cachedCanvas, null, false);
        } else {
          if (lastInViewRef.current !== tracksToRender.length) {
            lastInViewRef.current = tracksToRender.length;
            setInViewCount(tracksToRender.length);
          }
          const threatDetected = tracksToRender.some(t => Boolean(t.flagged || t.suspicious));
          if (lastThreatRef.current !== threatDetected) {
            lastThreatRef.current = threatDetected;
            setHasActiveThreat(threatDetected);
          }

          renderTrackBoxes(cachedOverlay, tracksToRender, cachedCanvas, (track) => {
            setSelectedTrack(track);
          }, showOverlays);
        }
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);

    const handleMessage = (payload) => {
      if (payload.binary && payload.data) {
        // Fast-path decode: drop frame if async decoder is busy so frames never queue up or lag behind real life
        if (!isDecoding) {
          isDecoding = true;
          const blob = new Blob([payload.data], { type: 'image/jpeg' });
          createImageBitmap(blob, { premultiplyAlpha: 'none' }).then((bmp) => {
            if (pendingBitmap) pendingBitmap.close();
            pendingBitmap = bmp;
          }).catch(() => {}).finally(() => {
            isDecoding = false;
          });
        }
      } else if (payload.tracks) {
        latestTracks = payload.tracks;
      }
    };

    const unregister = registerFrameHandler(handleMessage);
    return () => {
      unregister();
      if (rafId) cancelAnimationFrame(rafId);
      if (pendingBitmap) {
        pendingBitmap.close();
        pendingBitmap = null;
      }
    };
  }, [registerFrameHandler, activeSource, showOverlays, isExamEnded, showLivePreview]);

  // Instant Camera Switch handler with optimistic UI update
  const handleSwitchCamera = async (targetSource, targetResolution = selectedResolution) => {
    const targetSourceStr = String(targetSource);
    const targetCam = cameras.find(c => String(c.source) === targetSourceStr);

    setActiveSource(targetSourceStr);
    setActiveResolution(targetResolution);
    if (targetCam) {
      setIs1080p(Boolean(targetCam.is_1080p) || targetResolution.includes('1920'));
    }
    setCameraDropdownOpen(false);
    setSwitchingCamera(true);

    try {
      const res = await api.cameras.switch({
        camera_source: targetSourceStr,
        resolution: targetResolution,
        exam_id: exam?.exam_id || null
      });

      if (res && res.camera_info) {
        setActiveResolution(res.camera_info.resolution || targetResolution);
        setIs1080p(Boolean(res.camera_info.is_1080p));
      }
      showToast(`Switched feed to ${targetCam?.name || `Camera ${targetSourceStr}`}`);
      await fetchCameras(false);
    } catch (err) {
      showToast(`Camera switch failed: ${err.message}`, 'error');
    } finally {
      setSwitchingCamera(false);
    }
  };

  // Assign Camera to Current Exam
  const handleAssignToExam = async () => {
    if (!exam || !exam.exam_id) return;
    setAssigningToExam(true);
    try {
      const currentCam = cameras.find(c => String(c.source) === String(activeSource));
      const res = await api.cameras.assignToExam(exam.exam_id, {
        camera_source: String(activeSource),
        camera_name: currentCam?.name || `Webcam ${activeSource}`,
        resolution: selectedResolution
      });
      if (res) {
        showToast(`Assigned Camera ${activeSource} to "${exam.exam_name}"!`);
        if (onExamUpdate) onExamUpdate(res);
      }
    } catch (err) {
      showToast(`Failed to assign camera: ${err.message}`, 'error');
    } finally {
      setAssigningToExam(false);
    }
  };

  // Instant High-Resolution Snapshot Capture
  const handleTakeSnapshot = () => {
    const canvas = document.getElementById(`camera-canvas-${activeSource}`) ||
                   document.querySelector('canvas[id^="camera-canvas"]') ||
                   document.getElementById('camera-canvas-0');
    if (!canvas) {
      showToast('No active stream to capture', 'error');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const examSlug = exam?.exam_name ? exam.exam_name.replace(/[^a-zA-Z0-9]/g, '_') : 'Exam';
      link.download = `ARGUS_${examSlug}_Cam${activeSource}_${timestamp}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Evidence snapshot downloaded (.png)');
    } catch (err) {
      showToast('Snapshot capture failed: ' + err.message, 'error');
    }
  };

  // Download PDF Compliance Dossier directly
  const handleDownloadReport = async () => {
    if (!exam?.exam_id) return;
    setDownloadingReport(true);
    try {
      const blob = await api.exams.downloadReport(exam.exam_id, 'pdf');
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      const safeName = (exam.exam_name || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `ARGUS_Audit_${safeName}_${exam.exam_id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Compliance PDF dossier downloaded successfully!');
    } catch (err) {
      showToast('Failed to download PDF report: ' + err.message, 'error');
    } finally {
      setDownloadingReport(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const activeCamObj = cameras.find(c => String(c.source) === String(activeSource));
  const examAssignedSource = (() => {
    if (!exam?.settings) return null;
    try {
      const st = typeof exam.settings === 'string' ? JSON.parse(exam.settings) : exam.settings;
      return st?.assigned_camera_source ? String(st.assigned_camera_source) : null;
    } catch {
      return null;
    }
  })();

  const isCurrentAssignedToExam = examAssignedSource && String(examAssignedSource) === String(activeSource);

  // Match selected track with candidate record
  const selectedCandidate = useMemo(() => {
    if (!selectedTrack || !participants) return null;
    const tId = selectedTrack.track_id;
    return (
      participants.find(p => p.track_id === tId || p.participant_id === selectedTrack.participant_id) ||
      participants.find(p => p.seat_number && p.seat_number.includes(String(tId))) ||
      null
    );
  }, [selectedTrack, participants]);

  return (
    <div className="h-full flex flex-col bg-[#f5f5f7] dark:bg-[#000000] overflow-hidden relative">
      {/* Toast Notification */}
      {notification && (
        <div className={`absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.15)] backdrop-blur-2xl transition-all flex items-center gap-2 border animate-in fade-in zoom-in-95 duration-200 ${
          notification.type === 'error'
            ? 'bg-[#ff3b30]/90 text-white border-red-400/30'
            : 'bg-[#1c1c1e]/90 dark:bg-white/95 text-white dark:text-[#1c1c1e] border-black/10 dark:border-white/20'
        }`}>
          <Sparkles className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Sub-toolbar with Instant Camera Switcher */}
      <div className="relative z-40 flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/[0.08]">
        {/* Left: Stream Status & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[#0071e3]" />
            <h2 className="text-xs font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
              {isExamEnded && !showLivePreview
                ? 'Session Concluded'
                : isExamEnded
                ? 'Hardware Camera Preview'
                : 'Surveillance Stream'}
            </h2>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border ${
            isExamEnded && !showLivePreview
              ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25 font-semibold'
              : isExamEnded
              ? 'bg-[#0071e3]/10 text-[#0071e3] dark:text-[#0a84ff] border-[#0071e3]/25 font-medium'
              : connected
              ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25'
              : 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isExamEnded && !showLivePreview
                ? 'bg-[#34c759]'
                : isExamEnded
                ? 'bg-[#0071e3] breathe-dot'
                : connected
                ? 'bg-[#34c759] breathe-dot'
                : 'bg-[#86868b]'
            }`} />
            <span ref={subFpsDisplayRef}>
              {isExamEnded && !showLivePreview
                ? 'Exam Completed'
                : isExamEnded
                ? 'Camera Preview'
                : connected
                ? '30.0 FPS • Active'
                : 'Standby'}
            </span>
          </span>
        </div>

        {/* Right: Camera Switcher Pill & Assign Button */}
        <div className="flex items-center gap-2 relative" ref={dropdownRef}>
          {/* Camera Switcher Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setCameraDropdownOpen(!cameraDropdownOpen)}
              disabled={switchingCamera}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white border border-black/5 dark:border-white/10 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              title="Switch connected cameras or resolution"
            >
              <Camera className="w-3.5 h-3.5 text-[#0071e3]" />
              <span className="font-medium max-w-[200px] truncate">
                {activeCamObj?.name ? activeCamObj.name.replace('USB / Physical ', '') : `Webcam ${activeSource}`}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold uppercase ${
                is1080p || activeResolution.includes('1920')
                  ? 'bg-[#0071e3]/15 text-[#0071e3] dark:text-[#0a84ff]'
                  : 'bg-black/10 dark:bg-white/15 text-[#86868b]'
              }`}>
                {is1080p || activeResolution.includes('1920') ? '1080p FHD' : activeResolution}
              </span>
              <ChevronDown className={`w-3 h-3 text-[#86868b] transition-transform duration-200 ${cameraDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Camera Switcher Menu Popover */}
            {cameraDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1c1c1e] border border-black/10 dark:border-white/15 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.35)] p-2.5 z-50 text-xs text-[#1d1d1f] dark:text-white backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-black/5 dark:border-white/10 mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[#86868b] dark:text-[#a1a1a6] text-[11px] uppercase tracking-wider">
                    <Settings2 size={12} />
                    <span>Physical Webcams (USB / Direct)</span>
                  </div>
                  <button
                    onClick={() => fetchCameras(true)}
                    disabled={loadingCameras}
                    className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Re-scan connected webcams"
                  >
                    <RefreshCw size={11} className={loadingCameras ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Available Cameras List */}
                <div className="space-y-1 max-h-56 overflow-y-auto py-1">
                  {cameras.length === 0 ? (
                    <div className="py-3 text-center text-xs text-[#86868b]">
                      No physical cameras detected
                    </div>
                  ) : (
                    cameras.map((cam) => {
                      const isActive = String(cam.source) === String(activeSource);
                      const isExamAssigned = examAssignedSource && String(examAssignedSource) === String(cam.source);

                      return (
                        <button
                          key={cam.source}
                          onClick={() => handleSwitchCamera(cam.source, selectedResolution)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#0071e3]/10 text-[#0071e3] dark:text-[#0a84ff] font-semibold'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 text-[#1d1d1f] dark:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#0071e3] ring-4 ring-[#0071e3]/20' : 'bg-[#86868b]'}`} />
                            <div className="truncate">
                              <div className="text-xs font-medium truncate flex items-center gap-1.5">
                                {cam.name}
                                {cam.is_1080p && (
                                  <span className="text-[9px] bg-[#34c759]/15 text-[#34c759] px-1.5 py-px rounded-full font-bold">
                                    1080p
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-[#86868b] font-mono">
                                Max {cam.max_resolution} • Source #{cam.source}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isExamAssigned && (
                              <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium" title="Assigned to current exam">
                                Assigned
                              </span>
                            )}
                            {isActive && <Check size={14} className="text-[#0071e3] shrink-0" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Resolution Selector */}
                <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/10">
                  <div className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wider px-2 mb-1.5">
                    Resolution Preset
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-1">
                    {[
                      { id: '1920x1080', label: '1080p FHD' },
                      { id: '1280x720', label: '720p HD' },
                      { id: '640x480', label: '480p SD' }
                    ].map((res) => (
                      <button
                        key={res.id}
                        onClick={() => {
                          setSelectedResolution(res.id);
                          handleSwitchCamera(activeSource, res.id);
                        }}
                        className={`py-1 px-1.5 rounded-lg text-[11px] font-mono font-medium text-center transition-all cursor-pointer ${
                          activeResolution === res.id || (res.id === '1920x1080' && is1080p)
                            ? 'bg-[#0071e3] text-white font-bold shadow-xs'
                            : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#86868b]'
                        }`}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Direct Assign to Exam Button */}
                {exam && (
                  <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/10">
                    <button
                      onClick={handleAssignToExam}
                      disabled={assigningToExam || isCurrentAssignedToExam}
                      className={`w-full py-1.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isCurrentAssignedToExam
                          ? 'bg-[#34c759]/10 text-[#34c759] cursor-default'
                          : 'bg-[#0071e3] hover:bg-[#0077ed] text-white active:scale-[0.98]'
                      }`}
                    >
                      <Pin size={12} className={isCurrentAssignedToExam ? 'rotate-45' : ''} />
                      <span>
                        {isCurrentAssignedToExam
                          ? 'Assigned to Current Exam ✓'
                          : assigningToExam
                          ? 'Assigning...'
                          : `Assign Camera ${activeSource} to This Exam`}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Assign Pill if exam loaded */}
          {exam && !isCurrentAssignedToExam && (
            <button
              onClick={handleAssignToExam}
              disabled={assigningToExam}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/25 transition-all cursor-pointer active:scale-95"
              title={`Save Camera ${activeSource} as the default camera for "${exam.exam_name}"`}
            >
              <Pin size={12} />
              <span>Assign to Exam</span>
            </button>
          )}

          {exam && isCurrentAssignedToExam && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20" title="This webcam is assigned to the current exam">
              <Check size={12} />
              <span>Exam Camera</span>
            </span>
          )}

          {isExamEnded && showLivePreview && (
            <button
              onClick={() => setShowLivePreview(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white border border-black/10 dark:border-white/15 transition-all cursor-pointer active:scale-95"
            >
              <CheckCircle2 size={13} className="text-[#34c759]" />
              <span>Return to Summary</span>
            </button>
          )}
        </div>
      </div>

      {/* Main View Area: Camera Grid View OR Exam Completed Debrief Card */}
      <div className="flex-1 overflow-hidden p-4 sm:p-5 bg-[#f5f5f7] dark:bg-[#000000]">
        <div className="h-full flex flex-col relative">
          {isExamEnded && !showLivePreview ? (
            <ExamCompletedView
              exam={exam}
              participants={participants}
              onPreviewFeed={() => setShowLivePreview(true)}
              onDownloadReport={handleDownloadReport}
              downloadingReport={downloadingReport}
              onNavigateTab={onNavigateTab}
            />
          ) : (
            <CameraFeed
              cameraId={activeSource}
              camName={activeCamObj?.name}
              resolution={activeResolution}
              is1080p={is1080p}
              isExpanded={Boolean(expandedFeed)}
              onExpand={() => setExpandedFeed(expandedFeed ? null : activeSource)}
              showOverlays={showOverlays}
              onToggleOverlays={() => setShowOverlays(!showOverlays)}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid(!showGrid)}
              onTakeSnapshot={handleTakeSnapshot}
              fpsDisplayRef={fpsDisplayRef}
              inViewCount={inViewCount}
              participantsCount={participants?.length || 0}
              hasActiveThreat={hasActiveThreat}
              isExamEnded={isExamEnded}
              onReturnToSummary={() => setShowLivePreview(false)}
            />
          )}

          {/* Apple Quick Look Candidate Popover */}
          {selectedTrack && (
            <div className="absolute top-16 right-5 z-40 w-72 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/15 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    selectedTrack.flagged
                      ? 'bg-red-500/15 text-[#ff3b30] border border-red-500/30'
                      : 'bg-[#0071e3]/15 text-[#0071e3] border border-[#0071e3]/30'
                  }`}>
                    {selectedCandidate?.name ? selectedCandidate.name.charAt(0) : `#${selectedTrack.track_id}`}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-white leading-tight">
                      {selectedCandidate?.name || `Track Candidate #${selectedTrack.track_id}`}
                    </h4>
                    <p className="text-[11px] text-[#86868b] font-mono mt-0.5">
                      {selectedCandidate?.student_id || selectedCandidate?.registration_id || `TRK-00${selectedTrack.track_id}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTrack(null)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06]">
                  <div className="text-[10px] text-[#86868b] uppercase font-semibold">Seat Number</div>
                  <div className="text-xs font-semibold text-[#1d1d1f] dark:text-white mt-0.5">
                    {selectedCandidate?.seat_number || `Seat #${selectedTrack.track_id}`}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06]">
                  <div className="text-[10px] text-[#86868b] uppercase font-semibold">Surveillance Status</div>
                  <div className={`text-xs font-semibold mt-0.5 flex items-center gap-1 ${
                    selectedTrack.flagged ? 'text-[#ff3b30]' : 'text-[#34c759]'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedTrack.flagged ? 'bg-[#ff3b30]' : 'bg-[#34c759]'}`} />
                    <span>{selectedTrack.flagged ? 'Attention Needed' : 'Normal Routine'}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    showToast(`Candidate #${selectedTrack.track_id} flagged for proctor review`);
                    setSelectedTrack(null);
                  }}
                  className="flex-1 py-1.5 px-3 rounded-xl text-xs font-medium bg-[#ff3b30]/10 hover:bg-[#ff3b30]/15 text-[#ff3b30] transition-colors cursor-pointer"
                >
                  Flag Candidate
                </button>
                <button
                  onClick={() => setSelectedTrack(null)}
                  className="py-1.5 px-3 rounded-xl text-xs font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Apple HIG Exam Concluded Summary View
function ExamCompletedView({ exam, participants, onPreviewFeed, onDownloadReport, downloadingReport, onNavigateTab }) {
  const checkedInCount = participants ? participants.filter(p => p.status === 'CHECKED_IN').length : 0;
  const totalCount = (participants && participants.length > 0) ? participants.length : (exam?.num_students || 0);
  const attendancePercent = totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) : 100;
  const durationStr = calculateDuration(exam?.started_at, exam?.ended_at);

  return (
    <div className="w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-xl bg-white dark:bg-[#1c1c1e] rounded-2xl border border-black/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] text-center">
        {/* Apple Status Icon */}
        <div className="w-12 h-12 rounded-2xl bg-[#34c759]/15 text-[#34c759] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
          <CheckCircle2 size={24} strokeWidth={2.2} />
        </div>

        {/* Header & Subtitle */}
        <h3 className="text-xl font-bold text-[#1d1d1f] dark:text-white tracking-tight">
          {exam?.exam_name || 'Session'} Concluded
        </h3>
        <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] mt-1 max-w-md mx-auto leading-relaxed">
          Surveillance and proctoring have ended. Candidate attendance records and incident logs have been finalized.
        </p>

        {/* 3-Column Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5 text-left">
          {/* Card 1: Duration */}
          <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#86868b] uppercase tracking-wider font-semibold">
              <Clock size={12} className="text-[#0071e3]" />
              <span>Duration</span>
            </div>
            <div className="text-sm font-semibold text-[#1d1d1f] dark:text-white mt-1">
              {durationStr || `${exam?.duration_minutes || 60} mins`}
            </div>
            <div className="text-[10px] text-[#86868b] font-mono mt-0.5 truncate">
              {formatTime(exam?.started_at)} – {formatTime(exam?.ended_at)}
            </div>
          </div>

          {/* Card 2: Attendance */}
          <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#86868b] uppercase tracking-wider font-semibold">
              <Users size={12} className="text-[#34c759]" />
              <span>Attendance</span>
            </div>
            <div className="text-sm font-semibold text-[#1d1d1f] dark:text-white mt-1">
              {attendancePercent}% Verified
            </div>
            <div className="text-[10px] text-[#86868b] font-mono mt-0.5 truncate">
              {checkedInCount} of {totalCount} students
            </div>
          </div>

          {/* Card 3: Session Video */}
          <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[10px] text-[#86868b] uppercase tracking-wider font-semibold">
              <Video size={12} className="text-[#af52de]" />
              <span>Session Video</span>
            </div>
            <div className="text-sm font-semibold text-[#1d1d1f] dark:text-white mt-1 truncate">
              {exam?.recording_path ? 'Recording Saved' : 'Telemetry Only'}
            </div>
            <div className="text-[10px] text-[#86868b] font-mono mt-0.5 truncate">
              {exam?.recording_path ? 'Continuous H.264 MP4' : 'No local video file'}
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            onClick={onDownloadReport}
            disabled={downloadingReport}
            className="ess-btn-primary px-4 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download size={13} className={downloadingReport ? 'animate-bounce' : ''} />
            <span>{downloadingReport ? 'Generating Report...' : 'Export Summary (PDF)'}</span>
          </button>

          <button
            onClick={onPreviewFeed}
            className="ess-btn-secondary px-4 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            title="Check live physical camera hardware stream"
          >
            <Camera size={13} className="text-[#0071e3]" />
            <span>Preview Camera</span>
          </button>

          {exam?.recording_path && (
            <a
              href={`/api/exams/${exam.exam_id}/recording?download=true`}
              download
              className="ess-btn-secondary px-4 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 text-[#0071e3]"
              title="Download continuous examination video"
            >
              <Video size={13} />
              <span>Download Video</span>
            </a>
          )}
        </div>

        {/* Quick Navigation Footer */}
        {onNavigateTab && (
          <div className="mt-6 pt-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-center gap-4 text-xs text-[#86868b]">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Jump to:</span>
            <button
              onClick={() => onNavigateTab('roster')}
              className="text-[#0071e3] hover:underline cursor-pointer font-medium"
            >
              Candidate Roster
            </button>
            <span className="text-black/20 dark:text-white/20">•</span>
            <button
              onClick={() => onNavigateTab('events')}
              className="text-[#0071e3] hover:underline cursor-pointer font-medium"
            >
              Audit Timeline
            </button>
            {exam?.recording_path && (
              <>
                <span className="text-black/20 dark:text-white/20">•</span>
                <button
                  onClick={() => onNavigateTab('videoAudit')}
                  className="text-[#0071e3] hover:underline cursor-pointer font-medium"
                >
                  Video Audit
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CameraFeed({
  cameraId,
  camName,
  resolution,
  is1080p,
  isExpanded,
  onExpand,
  showOverlays,
  onToggleOverlays,
  showGrid,
  onToggleGrid,
  onTakeSnapshot,
  fpsDisplayRef,
  inViewCount,
  participantsCount,
  hasActiveThreat,
  isExamEnded,
  onReturnToSummary
}) {
  return (
    <div className={`relative w-full h-full bg-[#000000] dark:bg-[#1c1c1e] rounded-3xl border border-black/[0.08] dark:border-white/[0.10] overflow-hidden group flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all ${
      !isExamEnded && hasActiveThreat
        ? 'shadow-[inset_0_0_80px_rgba(255,59,48,0.22)] ring-1 ring-[#ff3b30]/40'
        : 'shadow-[inset_0_0_50px_rgba(52,199,89,0.04)]'
    }`}>
      {/* Floating Top Left HUD Glass Capsule */}
      <div className="absolute top-3.5 left-3.5 z-20 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white flex items-center gap-2 shadow-xs">
        <span className={`w-2 h-2 rounded-full ${isExamEnded ? 'bg-[#34c759] breathe-dot' : hasActiveThreat ? 'bg-[#ff3b30] animate-ping' : 'bg-[#34c759] breathe-dot'}`} />
        <span className="text-xs font-semibold tracking-tight">
          {isExamEnded ? `Hardware Preview • ${camName || `Webcam ${cameraId}`}` : (camName || `Webcam ${cameraId}`)}
        </span>
        <span className="text-[10px] font-mono text-white/70 border-l border-white/20 pl-2">
          {is1080p || resolution?.includes('1920') ? '1080p Full HD' : resolution || '720p HD'}
        </span>
      </div>

      {/* Floating Top Right Apple QuickTime Style Control Pill */}
      <div className="absolute top-3.5 right-3.5 z-30 flex items-center gap-1 p-1 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-xl border border-white/15 text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all">
        {!isExamEnded && (
          <button
            onClick={onToggleOverlays}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              showOverlays ? 'bg-[#0071e3] text-white shadow-xs' : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
            title={showOverlays ? 'Hide AI Detection Overlays' : 'Show AI Detection Overlays'}
            aria-label="Toggle AI overlays"
          >
            {showOverlays ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        )}

        <button
          onClick={onToggleGrid}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            showGrid ? 'bg-[#0071e3] text-white shadow-xs' : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
          title={showGrid ? 'Hide Room Alignment Grid' : 'Show Room Alignment Grid'}
          aria-label="Toggle alignment grid"
        >
          <Grid3X3 size={13} />
        </button>

        <button
          onClick={onTakeSnapshot}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          title="Capture Evidence Frame (.png)"
          aria-label="Take high resolution snapshot"
        >
          <Camera size={13} />
        </button>

        <div className="w-px h-3.5 bg-white/20 my-auto mx-0.5" />

        <button
          onClick={onExpand}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          aria-label={isExpanded ? 'Restore window size' : 'Maximize camera feed'}
          title={isExpanded ? 'Restore Window' : 'Maximize Video Stream'}
        >
          {isExpanded ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>

        {isExamEnded && onReturnToSummary && (
          <>
            <div className="w-px h-3.5 bg-white/20 my-auto mx-0.5" />
            <button
              onClick={onReturnToSummary}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              aria-label="Return to Summary"
              title="Return to Summary"
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>

      {/* Floating Center Top Action Banner in Preview Mode */}
      {isExamEnded && (
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-xl border border-white/20 text-white flex items-center gap-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] animate-in fade-in duration-200">
          <span className="w-2 h-2 rounded-full bg-[#34c759] breathe-dot" />
          <span className="text-xs font-medium text-white/90">Live Camera Preview (Unproctored)</span>
          {onReturnToSummary && (
            <button
              onClick={onReturnToSummary}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-all cursor-pointer active:scale-95"
            >
              <CheckCircle2 size={12} className="text-[#34c759]" />
              <span>Return to Summary</span>
            </button>
          )}
        </div>
      )}

      {/* Alignment Grid Overlay */}
      {showGrid && (
        <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3 border border-white/10">
          <div className="border-r border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div />
        </div>
      )}

      {/* Video Stream: High-Performance GPU-Accelerated Canvas */}
      <div className="relative w-full h-full min-h-[280px] flex items-center justify-center bg-[#070c18] dark:bg-[#000000] overflow-hidden">
        <canvas
          id={`camera-canvas-${cameraId}`}
          className="w-full h-full object-contain"
          width={1280}
          height={720}
        />
        <div id={`track-overlay-${cameraId}`} className="absolute inset-0 pointer-events-none" />

        {/* Placeholder before frames arrive */}
        <div id={`placeholder-${cameraId}`} className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/70 bg-[#141416] p-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-3 shadow-inner">
            <Camera className="w-6 h-6 text-white/80" />
          </div>
          <p className="text-xs font-semibold text-white tracking-tight">Camera Feed Ready</p>
          <p className="text-[11px] text-white/50 mt-1 max-w-xs leading-normal">
            Awaiting live video ingestion from {camName || `Webcam ${cameraId}`}.
          </p>
        </div>
      </div>

      {/* Floating Bottom Info Capsule - Apple Dynamic Island Style */}
      {isExamEnded ? (
        <div className="absolute bottom-3 left-3 right-3 z-20 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/15 flex items-center justify-between text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#34c759] breathe-dot" />
              <span ref={fpsDisplayRef} className="font-mono text-[11px] tracking-tight">30.0 FPS</span>
              <span className="text-[10px] text-white/40 font-mono">• Direct Sensor Stream</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-white/15 text-[11px] text-white/70">
              <Camera size={12} className="text-[#0a84ff]" />
              <span>Camera Sensor Active</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-medium bg-[#34c759]/20 text-[#34c759] border border-[#34c759]/30">
              <Check size={10} />
              <span>EXAM SEALED • PREVIEW MODE</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-3 left-3 right-3 z-20 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/15 flex items-center justify-between text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${hasActiveThreat ? 'bg-[#ff3b30]' : 'bg-[#34c759]'} breathe-dot`} />
              <span ref={fpsDisplayRef} className="font-mono text-[11px] tracking-tight">30.0 FPS</span>
              <span className="text-[10px] text-white/40 font-mono">• 1080p FHD</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-white/15 text-[11px] text-white/70">
              <Users size={12} className="text-[#0a84ff]" />
              <span>{inViewCount} In View</span>
              {participantsCount > 0 && (
                <span className="text-white/40 font-mono text-[10px]">
                  ({participantsCount} Enrolled)
                </span>
              )}
            </div>

            {/* Decibel Audio VU Indicator */}
            <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-white/15">
              <Volume2 size={12} className="text-[#34c759]" />
              <div className="flex items-center gap-0.5 w-10 h-2 bg-white/10 rounded-full px-0.5 overflow-hidden">
                <div className="w-1.5 h-1 rounded-full bg-[#34c759]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
                <div className="w-1.5 h-0.5 rounded-full bg-white/20" />
              </div>
              <span className="text-[10px] font-mono text-white/60">34 dB</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveThreat ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#ff3b30] text-white shadow-[0_0_12px_rgba(255,59,48,0.5)]">
                <AlertTriangle size={10} />
                <span>ANOMALY FLAGGED</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#34c759]/20 text-[#34c759] border border-[#34c759]/30">
                <Check size={10} />
                <span>SURVEILLANCE SECURE</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Letterbox-aware subpixel bounding box renderer
function renderTrackBoxes(overlay, tracks, canvasOrCameraId, onSelectTrack, showOverlays = true) {
  if (!overlay) return;
  if (!showOverlays || !tracks || tracks.length === 0) {
    overlay.innerHTML = '';
    return;
  }

  const canvas = (canvasOrCameraId && typeof canvasOrCameraId === 'object' && canvasOrCameraId.nodeType === 1)
    ? canvasOrCameraId
    : (document.getElementById('camera-canvas-' + canvasOrCameraId) || document.querySelector('canvas[id^="camera-canvas"]') || document.getElementById('camera-canvas-0'));

  if (!canvas) {
    overlay.innerHTML = '';
    return;
  }

  const oRect = overlay.getBoundingClientRect();
  if (oRect.width === 0 || oRect.height === 0) return;

  const videoAspect = (canvas.width || 1920) / (canvas.height || 1080);
  const containerAspect = oRect.width / oRect.height;

  let renderW, renderH, offsetX, offsetY;
  if (containerAspect > videoAspect) {
    renderH = oRect.height;
    renderW = renderH * videoAspect;
    offsetX = (oRect.width - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = oRect.width;
    renderH = renderW / videoAspect;
    offsetX = 0;
    offsetY = (oRect.height - renderH) / 2;
  }

  const vw = 1280, vh = 720;
  const sx = renderW / vw;
  const sy = renderH / vh;

  overlay.innerHTML = '';
  for (const track of tracks) {
    if (!track.bbox) continue;
    const [x1, y1, x2, y2] = track.bbox;
    const isFlagged = Boolean(track.flagged || track.suspicious);
    const box = document.createElement('div');
    const borderColor = isFlagged ? '#ff3b30' : '#34c759';
    const bgTint = isFlagged ? 'rgba(255, 59, 48, 0.12)' : 'rgba(52, 199, 89, 0.08)';

    const bx = offsetX + (x1 * sx);
    const by = offsetY + (y1 * sy);
    const bw = Math.max(16, (x2 - x1) * sx);
    const bh = Math.max(16, (y2 - y1) * sy);

    box.style.cssText = `
      position: absolute;
      left: ${bx}px;
      top: ${by}px;
      width: ${bw}px;
      height: ${bh}px;
      border: 1.5px solid ${borderColor};
      background: ${bgTint};
      border-radius: 12px;
      box-shadow: 0 4px 16px ${isFlagged ? 'rgba(255, 59, 48, 0.35)' : 'rgba(52, 199, 89, 0.20)'};
      pointer-events: auto;
      cursor: pointer;
      transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.16s ease;
    `;

    const tag = document.createElement('div');
    tag.style.cssText = `
      position: absolute;
      top: -24px;
      left: 2px;
      font-size: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      font-weight: 600;
      letter-spacing: -0.01em;
      background: ${isFlagged ? '#ff3b30' : 'rgba(0, 0, 0, 0.70)'};
      color: #ffffff;
      padding: 1.5px 8px;
      border-radius: 9999px;
      border: 0.5px solid rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(12px);
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      gap: 4px;
    `;
    tag.innerHTML = `
      <span style="width: 5px; height: 5px; border-radius: 50%; background: ${borderColor}; display: inline-block;"></span>
      <span>${isFlagged ? 'Attention #' + track.track_id : 'Track #' + track.track_id}</span>
    `;

    box.appendChild(tag);

    box.addEventListener('mouseenter', () => {
      box.style.transform = 'scale(1.02)';
      box.style.borderColor = '#0071e3';
    });
    box.addEventListener('mouseleave', () => {
      box.style.transform = 'scale(1)';
      box.style.borderColor = borderColor;
    });

    if (onSelectTrack) {
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectTrack(track);
      });
    }

    overlay.appendChild(box);
  }
}

export default React.memo(ExamMonitor);
