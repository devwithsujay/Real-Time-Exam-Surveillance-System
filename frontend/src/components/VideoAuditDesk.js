import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Film, Upload, Play, Pause, RotateCcw, Volume2, VolumeX, Download, Trash2,
  AlertTriangle, Eye, Maximize2, RefreshCw, Layers, X, Plus, Sparkles
} from 'lucide-react';
import api from '../services/api';

const SEVERITY_COLORS = {
  CRITICAL: {
    bg: 'bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/30',
    dot: 'bg-[#ff3b30]',
    pin: '#ff3b30'
  },
  HIGH: {
    bg: 'bg-[#ff9500]/15 text-[#ff9500] border-[#ff9500]/30',
    dot: 'bg-[#ff9500]',
    pin: '#ff9500'
  },
  MEDIUM: {
    bg: 'bg-[#ffcc00]/15 text-[#b28900] dark:text-[#ffd60a] border-[#ffcc00]/30',
    dot: 'bg-[#ffd60a]',
    pin: '#ffd60a'
  },
  LOW: {
    bg: 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/30',
    dot: 'bg-[#34c759]',
    pin: '#34c759'
  }
};

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function VideoAuditDesk({ user, exam }) {
  const isAdmin = user?.role === 'ADMIN';

  const [audits, setAudits] = useState([]);
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [sampleFps, setSampleFps] = useState(2);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Video player state
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [verifyingIncidentId, setVerifyingIncidentId] = useState(null);
  const [batchVerifying, setBatchVerifying] = useState(false);

  // Fetch all audits
  const fetchAudits = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.videoAudit.list();
      setAudits(data || []);
      if (data && data.length > 0 && !selectedAuditId) {
        setSelectedAuditId(data[0].audit_id);
      }
    } catch (err) {
      console.error('Failed to fetch video audits:', err);
      setError(err.message || 'Failed to load video audits');
    } finally {
      setLoading(false);
    }
  }, [selectedAuditId]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  // Poll active audit if status is PROCESSING or PENDING
  useEffect(() => {
    if (!selectedAuditId) return;

    let timer = null;
    const fetchAuditDetail = async () => {
      try {
        const detail = await api.videoAudit.get(selectedAuditId);
        setSelectedAudit(detail);

        // Keep polling every 2s if still processing
        if (detail.status === 'PROCESSING' || detail.status === 'PENDING') {
          timer = setTimeout(fetchAuditDetail, 2000);
        }
      } catch (err) {
        console.error('Failed to fetch audit detail:', err);
      }
    };

    fetchAuditDetail();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [selectedAuditId]);

  // Handle Video Upload
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a video file.');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append('video_file', uploadFile);
      formData.append('title', uploadTitle || uploadFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('sample_fps', sampleFps);
      if (exam?.exam_id) {
        formData.append('exam_id', exam.exam_id);
      }

      const res = await api.videoAudit.upload(formData);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadTitle('');
      await fetchAudits();
      if (res?.audit_id) {
        setSelectedAuditId(res.audit_id);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Video Player Controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || selectedAudit?.duration_seconds || 0);
    }
  };

  const jumpToTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(seconds, duration || selectedAudit?.duration_seconds || 0));
      setCurrentTime(seconds);
      videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const changePlaybackRate = (rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  // Download PDF Dossier
  const handleDownloadReport = async (auditId) => {
    try {
      const blob = await api.videoAudit.downloadReport(auditId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `ARGUS_Forensic_Dossier_${auditId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 3000);
    } catch (err) {
      console.error('Failed to download report:', err);
      window.location.href = `/api/v1/video-audit/${auditId}/report`;
    }
  };

  // Delete Audit
  const handleDeleteAudit = async (auditId) => {
    if (!window.confirm('Are you sure you want to permanently delete this forensic audit and all associated video clips?')) {
      return;
    }
    try {
      await api.videoAudit.delete(auditId);
      setSelectedAudit(null);
      setSelectedAuditId(null);
      await fetchAudits();
    } catch (err) {
      console.error('Failed to delete audit:', err);
      alert('Delete failed: ' + err.message);
    }
  };

  // VLM Verification Handlers
  const handleVerifyIncidentVLM = async (incidentId) => {
    if (!selectedAuditId || !incidentId) return;
    try {
      setVerifyingIncidentId(incidentId);
      const res = await api.videoAudit.verifyIncidentVLM(selectedAuditId, incidentId);
      if (selectedAudit && selectedAudit.incidents) {
        setSelectedAudit({
          ...selectedAudit,
          incidents: selectedAudit.incidents.map(inc =>
            inc.incident_id === incidentId
              ? { ...inc, vlm_verified: true, vlm_analysis: res.vlm_analysis }
              : inc
          )
        });
      }
    } catch (err) {
      console.error('VLM verification error:', err);
      alert(`VLM verification failed: ${err.message || err}`);
    } finally {
      setVerifyingIncidentId(null);
    }
  };

  const handleBatchVerifyVLM = async () => {
    if (!selectedAuditId) return;
    try {
      setBatchVerifying(true);
      await api.videoAudit.verifyAllVLM(selectedAuditId);
      const updated = await api.videoAudit.get(selectedAuditId);
      setSelectedAudit(updated);
    } catch (err) {
      console.error('Batch VLM verification error:', err);
      alert(`Batch VLM verification failed: ${err.message || err}`);
    } finally {
      setBatchVerifying(false);
    }
  };

  const filteredIncidents = (selectedAudit?.incidents || []).filter(inc => {
    if (filterSeverity === 'ALL') return true;
    return inc.severity === filterSeverity;
  });

  const totalDuration = duration || selectedAudit?.duration_seconds || 1;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Top Command Bar - Spacious & Uncramped */}
      <div className="py-3 px-6 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 dark:bg-[#0071e3]/20 flex items-center justify-center text-[#0071e3] shadow-xs flex-shrink-0">
            <Film size={20} strokeWidth={2} />
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-[15px] font-bold tracking-tight text-[#1d1d1f] dark:text-white leading-tight">
              Forensic Video Audit
            </h2>
            <p className="text-xs text-[#86868b] mt-0.5 font-normal">
              High-speed exam video inspection · Timecoded incident heatmap & precision scrub
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAudits}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Refresh Audits"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="hidden md:inline">Sync</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="ess-btn-primary text-xs py-2 px-4 rounded-xl font-medium flex items-center gap-2 cursor-pointer shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={15} />
              <span>Upload Recording</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2.5 bg-[#ff3b30]/10 border border-[#ff3b30]/20 rounded-xl flex items-center justify-between text-xs text-[#ff3b30]">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:opacity-70 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main Workspace: Left Audits Sidebar + Right Video/Heatmap Inspection */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Audits List Sidebar */}
        <div className="w-72 sm:w-80 flex-shrink-0 border-r border-black/[0.08] dark:border-white/[0.08] bg-white/50 dark:bg-[#1c1c1e]/50 flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-xs font-semibold text-[#86868b] uppercase tracking-wider">
            <span>Audit Archives</span>
            <span className="font-mono bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full text-[11px]">
              {audits.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {audits.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Film size={28} className="mx-auto text-[#86868b] mb-2 opacity-50" />
                <p className="text-xs text-[#86868b] font-medium">No video audits yet</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="mt-3 text-xs text-[#0071e3] hover:underline font-medium"
                  >
                    Upload exam video
                  </button>
                )}
              </div>
            ) : (
              audits.map((a) => {
                const isSelected = a.audit_id === selectedAuditId;
                const isProcessing = a.status === 'PROCESSING' || a.status === 'PENDING';
                const isFailed = a.status === 'FAILED';

                return (
                  <div
                    key={a.audit_id}
                    onClick={() => setSelectedAuditId(a.audit_id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-white dark:bg-[#2c2c2e] border-[#0071e3] shadow-sm'
                        : 'bg-white/60 dark:bg-[#1c1c1e]/60 border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.15] dark:hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-white truncate flex-1">
                        {a.title}
                      </h4>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold ${
                        isProcessing
                          ? 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/20 animate-pulse'
                          : isFailed
                          ? 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/20'
                          : 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/20'
                      }`}>
                        {a.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#86868b] mb-2">
                      <span>{formatTime(a.duration_seconds)} duration</span>
                      <span>{a.sample_fps} FPS sample</span>
                    </div>

                    {isProcessing ? (
                      <div className="space-y-1">
                        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-[#0071e3] h-full rounded-full transition-all duration-300"
                            style={{ width: `${a.progress_percent || 5}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-[#0071e3]">
                          <span>Scanning frames...</span>
                          <span>{Math.round(a.progress_percent || 0)}%</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1 border-t border-black/[0.04] dark:border-white/[0.04] text-[11px]">
                        <span className="font-mono text-[#ff3b30] font-semibold">
                          {a.total_violations} {a.total_violations === 1 ? 'flag' : 'flags'}
                        </span>
                        <span className={`font-mono px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                          a.risk_score > 60
                            ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
                            : a.risk_score > 25
                            ? 'bg-[#ff9500]/15 text-[#ff9500]'
                            : 'bg-[#34c759]/15 text-[#34c759]'
                        }`}>
                          Risk {a.risk_score}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Inspection & Video Player Desk */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto">
          {!selectedAudit ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <Film size={40} className="mx-auto text-[#86868b] mb-3 opacity-40" />
                <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-white mb-1">
                  Select an Audit Archive
                </h3>
                <p className="text-xs text-[#86868b]">
                  Choose a scanned pre-recorded exam recording from the sidebar to inspect incidents on the interactive heatmap scrub bar.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto w-full">
              {/* Top Banner Info */}
              <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white tracking-tight">
                      {selectedAudit.title}
                    </h3>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold ${
                      selectedAudit.status === 'COMPLETED'
                        ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25'
                        : selectedAudit.status === 'PROCESSING'
                        ? 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/25 animate-pulse'
                        : 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/25'
                    }`}>
                      {selectedAudit.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#86868b]">
                    <span>File: <code className="font-mono text-[#1d1d1f] dark:text-white">{selectedAudit.filename}</code></span>
                    <span>•</span>
                    <span>Duration: <strong className="text-[#1d1d1f] dark:text-white">{formatTime(selectedAudit.duration_seconds)}</strong></span>
                    <span>•</span>
                    <span>Analyzed: <strong className="text-[#1d1d1f] dark:text-white">{selectedAudit.processed_frames}</strong> frames ({selectedAudit.sample_fps} FPS sample)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadReport(selectedAudit.audit_id)}
                    className="ess-btn-secondary text-xs py-2 px-3.5 rounded-xl font-medium flex items-center gap-1.5 cursor-pointer"
                    title="Download ReportLab Forensic Dossier PDF"
                  >
                    <Download size={13} />
                    <span>Dossier PDF</span>
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteAudit(selectedAudit.audit_id)}
                      className="p-2 rounded-xl text-[#ff3b30] hover:bg-[#ff3b30]/10 transition-colors cursor-pointer"
                      title="Delete Audit"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* HTML5 Video Player Frame & Tactical Controls */}
              <div className="bg-black rounded-3xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] shadow-lg relative flex flex-col">
                <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[480px]">
                  <video
                    ref={videoRef}
                    src={api.videoAudit.streamUrl(selectedAudit.audit_id)}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setPlaying(false)}
                    className="w-full h-full max-h-[480px] object-contain cursor-pointer"
                    onClick={togglePlay}
                    playsInline
                  />

                  {/* Big Center Play/Pause Overlay */}
                  {!playing && (
                    <button
                      onClick={togglePlay}
                      className="absolute w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center transition-transform hover:scale-105 cursor-pointer shadow-lg"
                    >
                      <Play size={28} className="fill-white translate-x-0.5" />
                    </button>
                  )}

                  {/* Live Timecode Watermark Pill */}
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white font-mono text-[11px] px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff3b30] animate-ping" />
                    <span>TIMECODE: {formatTime(currentTime)} / {formatTime(totalDuration)}</span>
                  </div>
                </div>

                {/* THE CORE HIGHLIGHT: Interactive Heatmap Scrub Bar */}
                <div className="p-4 bg-[#111114] border-t border-white/[0.08] space-y-3">
                  {/* Heatmap Infraction Marker Track */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#86868b]">
                      <span className="flex items-center gap-1.5">
                        <Layers size={12} className="text-[#0071e3]" />
                        <span>INCIDENT HEATMAP (CLICK TICK TO SEEK)</span>
                      </span>
                      <span>{selectedAudit.incidents?.length || 0} infractions plotted</span>
                    </div>

                    {/* Timeline Track with Infraction Ticks */}
                    <div className="relative w-full h-7 bg-[#1c1c1e] rounded-xl border border-white/10 overflow-hidden flex items-center px-1 select-none">
                      {/* Played Progress Bar */}
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-[#0071e3]/20 border-r border-[#0071e3] pointer-events-none transition-all duration-100"
                        style={{ width: `${(currentTime / totalDuration) * 100}%` }}
                      />

                      {/* Render All Infraction Heatmap Ticks */}
                      {(selectedAudit.incidents || []).map((inc) => {
                        const pct = Math.max(0, Math.min(100, (inc.timestamp_seconds / totalDuration) * 100));
                        const sevStyle = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.LOW;

                        return (
                          <button
                            key={inc.incident_id}
                            onClick={() => jumpToTime(inc.timestamp_seconds)}
                            style={{ left: `calc(${pct}% - 4px)` }}
                            title={`[${formatTime(inc.timestamp_seconds)}] ${inc.event_type} (${inc.severity}) - Click to jump`}
                            className="absolute top-1 bottom-1 w-2 rounded-full cursor-pointer hover:scale-150 transition-transform z-10 group"
                          >
                            <span
                              className="w-full h-full block rounded-full shadow-xs"
                              style={{ backgroundColor: sevStyle.pin }}
                            />
                          </button>
                        );
                      })}

                      {/* Current Time Cursor Needle */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                        style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Standard Video Seek Slider & Controls */}
                  <div className="flex items-center gap-3 text-white">
                    <button
                      onClick={togglePlay}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {playing ? <Pause size={14} /> : <Play size={14} className="fill-white translate-x-0.5" />}
                    </button>

                    <button
                      onClick={() => jumpToTime(0)}
                      className="p-1.5 text-[#86868b] hover:text-white transition-colors cursor-pointer"
                      title="Rewind to start"
                    >
                      <RotateCcw size={14} />
                    </button>

                    {/* Scrub Slider */}
                    <input
                      type="range"
                      min={0}
                      max={totalDuration}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => jumpToTime(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-white/20 rounded-full accent-[#0071e3] cursor-pointer"
                    />

                    {/* Timecode readout */}
                    <span className="font-mono text-xs text-[#86868b] min-w-[90px] text-right">
                      {formatTime(currentTime)} / {formatTime(totalDuration)}
                    </span>

                    {/* Playback Rate Selector */}
                    <div className="flex items-center bg-white/10 rounded-lg p-0.5 text-xs font-mono">
                      {[1, 1.5, 2, 4].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => changePlaybackRate(rate)}
                          className={`px-1.5 py-0.5 rounded-md cursor-pointer transition-colors ${
                            playbackRate === rate ? 'bg-[#0071e3] text-white font-bold' : 'text-[#86868b] hover:text-white'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    {/* Mute toggle */}
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = !muted;
                          setMuted(!muted);
                        }
                      }}
                      className="p-1.5 text-[#86868b] hover:text-white transition-colors cursor-pointer"
                    >
                      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Infraction Filter Tabs & Evidence Feed */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-white flex items-center gap-2">
                    <AlertTriangle size={15} className="text-[#ff9500]" />
                    <span>Captured Forensic Infractions ({filteredIncidents.length})</span>
                  </h4>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Batch VLM Verification Button */}
                    <button
                      onClick={handleBatchVerifyVLM}
                      disabled={batchVerifying || filteredIncidents.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium text-[#0071e3] hover:text-white bg-[#0071e3]/10 hover:bg-[#0071e3] border border-[#0071e3]/25 transition-all cursor-pointer disabled:opacity-40"
                      title="Run VLM second-opinion inspection on all captured keyframes"
                    >
                      <Sparkles size={12} className={batchVerifying ? "animate-spin" : ""} />
                      <span>{batchVerifying ? "Verifying All..." : "Batch VLM Verify"}</span>
                    </button>

                    {/* Severity Filter Pills */}
                    <div className="flex items-center gap-1.5 bg-white dark:bg-[#1c1c1e] p-1 rounded-xl border border-black/[0.06] dark:border-white/[0.06] text-xs">
                      {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                        <button
                          key={sev}
                          onClick={() => setFilterSeverity(sev)}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                            filterSeverity === sev
                              ? 'bg-[#0071e3] text-white shadow-xs font-semibold'
                              : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {filteredIncidents.length === 0 ? (
                  <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-8 text-center text-xs text-[#86868b]">
                    No infractions matching severity criteria.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredIncidents.map((inc) => {
                      const sevStyle = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.LOW;
                      const snapUrl = inc.snapshot_path
                        ? api.videoAudit.snapshotUrl(selectedAudit.audit_id, inc.snapshot_path.replace(/^snapshots\//, ''))
                        : null;

                      let vlmData = null;
                      if (inc.vlm_analysis) {
                        try {
                          vlmData = typeof inc.vlm_analysis === 'string' ? JSON.parse(inc.vlm_analysis) : inc.vlm_analysis;
                        } catch (e) {}
                      }

                      return (
                        <div
                          key={inc.incident_id}
                          className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-3.5 shadow-xs flex flex-col gap-2.5 hover:border-[#0071e3]/40 transition-colors"
                        >
                          <div className="flex gap-3.5 items-start w-full">
                            {/* Keyframe Snapshot Thumbnail */}
                            {snapUrl ? (
                              <div
                                onClick={() => setPreviewSnapshot(snapUrl)}
                                className="w-28 h-20 bg-black rounded-xl overflow-hidden flex-shrink-0 border border-black/10 dark:border-white/10 relative group cursor-pointer"
                              >
                                <img src={snapUrl} alt="Infraction Snapshot" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-mono">
                                  <Maximize2 size={14} />
                                </div>
                              </div>
                            ) : (
                              <div className="w-28 h-20 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center text-[#86868b] flex-shrink-0">
                                <Eye size={16} />
                              </div>
                            )}

                            {/* Infraction Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold ${sevStyle.bg}`}>
                                  {inc.severity}
                                </span>
                                <button
                                  onClick={() => jumpToTime(inc.timestamp_seconds)}
                                  className="flex items-center gap-1 font-mono text-xs text-[#0071e3] hover:underline font-semibold cursor-pointer"
                                >
                                  <Play size={11} className="fill-current" />
                                  <span>{formatTime(inc.timestamp_seconds)}</span>
                                </button>
                              </div>

                              <h5 className="text-xs font-bold text-[#1d1d1f] dark:text-white truncate">
                                {inc.event_type.replace('_', ' ')}
                              </h5>
                              <p className="text-[11px] text-[#86868b] leading-tight line-clamp-2 mt-0.5">
                                {inc.description}
                              </p>

                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-black/[0.04] dark:border-white/[0.04] text-[10px] font-mono text-[#86868b]">
                                <span>CONFIDENCE: {Math.round(inc.confidence * 100)}%</span>
                                <span>FRAME {inc.frame_index}</span>
                              </div>
                            </div>
                          </div>

                          {/* VLM Inspection Section */}
                          {inc.vlm_verified && vlmData ? (
                            <div className="p-2.5 rounded-xl bg-[#0071e3]/5 dark:bg-[#0071e3]/10 border border-[#0071e3]/15 text-[11px] text-[#1d1d1f] dark:text-[#f5f5f7]">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <div className="flex items-center gap-1 font-semibold text-[#0071e3] text-[10px] uppercase tracking-wider">
                                  <Sparkles size={11} />
                                  <span>VLM Forensic Verdict ({vlmData.model || 'Vision AI'})</span>
                                </div>
                                <span className="text-[10px] font-mono text-[#86868b]">
                                  {Math.round((vlmData.confidence || 0.8) * 100)}% Conf
                                </span>
                              </div>
                              <p className="italic text-[#1d1d1f] dark:text-[#e0e4ea] leading-snug">
                                "{vlmData.description}"
                              </p>
                              {vlmData.detected_objects && vlmData.detected_objects.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap mt-1.5 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
                                  <span className="text-[9px] uppercase tracking-wider text-[#86868b]">Objects:</span>
                                  {vlmData.detected_objects.map((obj, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[9px] font-mono text-[#1d1d1f] dark:text-white">
                                      {obj}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleVerifyIncidentVLM(inc.incident_id)}
                              disabled={verifyingIncidentId === inc.incident_id}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#0071e3] hover:text-white bg-[#0071e3]/5 dark:bg-[#0071e3]/10 hover:bg-[#0071e3] border border-[#0071e3]/20 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {verifyingIncidentId === inc.incident_id ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
                                  <span>Inspecting with VLM...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={12} />
                                  <span>Run VLM Deep Inspection</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Snapshot Modal Preview */}
      {previewSnapshot && (
        <div
          onClick={() => setPreviewSnapshot(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-black rounded-2xl overflow-hidden border border-white/20">
            <img src={previewSnapshot} alt="Snapshot Preview" className="max-w-full max-h-[85vh] object-contain" />
            <button
              onClick={() => setPreviewSnapshot(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal (Admin Only) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3]">
                  <Upload size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white">Upload Exam Recording</h3>
                  <p className="text-[11px] text-[#86868b]">Only Administrators can launch pre-recorded video audits</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-xl bg-[#ff3b30]/10 border border-[#ff3b30]/20 text-xs text-[#ff3b30]">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {/* Dropzone */}
              <div className="border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-[#0071e3] rounded-2xl p-6 text-center cursor-pointer transition-colors relative">
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/avi,video/quicktime,video/x-matroska"
                  onChange={(e) => e.target.files?.[0] && setUploadFile(e.target.files[0])}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Film size={28} className="mx-auto text-[#86868b] mb-2" />
                {uploadFile ? (
                  <div>
                    <span className="font-semibold text-[#0071e3] block truncate">{uploadFile.name}</span>
                    <span className="text-[10px] text-[#86868b]">({(uploadFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                  </div>
                ) : (
                  <div>
                    <span className="font-medium text-[#1d1d1f] dark:text-white block">
                      Choose video file or drag and drop
                    </span>
                    <span className="text-[10px] text-[#86868b]">MP4, WebM, AVI, MOV up to 4 GB</span>
                  </div>
                )}
              </div>

              {/* Title input */}
              <div>
                <label className="block text-[#86868b] font-medium mb-1">Session / Audit Label</label>
                <input
                  type="text"
                  placeholder="e.g. Hall 4 Exam Final Recording"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
                />
              </div>

              {/* Sampling Rate */}
              <div>
                <label className="block text-[#86868b] font-medium mb-1">AI Sampling Rate</label>
                <select
                  value={sampleFps}
                  onChange={(e) => setSampleFps(Number(e.target.value))}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-[#1d1d1f] dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value={1}>1 FPS (Ultra-fast ~15x scan speed)</option>
                  <option value={2}>2 FPS (Balanced ~8x scan speed - Recommended)</option>
                  <option value={5}>5 FPS (Deep high-precision ~3x scan speed)</option>
                </select>
                <span className="text-[10px] text-[#86868b] mt-1 block">
                  Higher sample rates capture brief infractions with higher precision.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="ess-btn-secondary py-2 px-4 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="ess-btn-primary py-2 px-5 rounded-xl font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Uploading Media...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={13} />
                      <span>Launch Forensic Audit</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
