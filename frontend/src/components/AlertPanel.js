import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Clock,
  Camera, User, Cpu, Sparkles, Filter, CheckCircle2, ShieldAlert,
  Eye, Download, Video, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Loader2, Check, RotateCcw
} from 'lucide-react';
import { api } from '../services/api';

function AlertPanel({ alerts, participants, onViewIncident }) {
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [statusOverrides, setStatusOverrides] = useState({});
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [reanalyzingId, setReanalyzingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSeverity, filterType, filterStatus, itemsPerPage]);

  const participantMap = useMemo(() => {
    const map = {};
    participants.forEach(p => { map[p.participant_id] = p; });
    return map;
  }, [participants]);

  const filteredAlerts = useMemo(() => alerts.filter(alert => {
    const effStatus = statusOverrides[alert.event_id] || alert.status || 'PRELIMINARY';
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    if (filterType !== 'all' && alert.event_type !== filterType) return false;
    if (filterStatus !== 'all' && effStatus !== filterStatus) return false;
    return true;
  }), [alerts, filterSeverity, filterType, filterStatus, statusOverrides]);

  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage) || 1;

  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAlerts.slice(start, start + itemsPerPage);
  }, [filteredAlerts, currentPage, itemsPerPage]);

  const severityCounts = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    alerts.forEach(a => { if (counts[a.severity] !== undefined) counts[a.severity]++; });
    return counts;
  }, [alerts]);

  const statusStyles = {
    PRELIMINARY: {
      badge: 'bg-[#ff9500]/15 text-[#ff9500] border-[#ff9500]/30',
      label: 'Verifying with AI...',
      pulse: true,
      icon: <Loader2 className="w-3 h-3 animate-spin text-[#ff9500]" />
    },
    AI_CONFIRMED: {
      badge: 'bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/30',
      label: 'AI Confirmed',
      pulse: false,
      icon: <ShieldAlert className="w-3 h-3 text-[#ff3b30]" />
    },
    AI_CLEARED: {
      badge: 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/30',
      label: 'AI Cleared — Benign',
      pulse: false,
      icon: <CheckCircle2 className="w-3 h-3 text-[#34c759]" />
    },
    NEEDS_REVIEW: {
      badge: 'bg-[#af52de]/15 text-[#af52de] border-[#af52de]/30',
      label: 'Needs Review (Unclear View)',
      pulse: false,
      icon: <AlertCircle className="w-3 h-3 text-[#af52de]" />
    },
    HUMAN_RESOLVED: {
      badge: 'bg-[#0071e3]/15 text-[#0071e3] border-[#0071e3]/30',
      label: 'Signed Off by Proctor',
      pulse: false,
      icon: <CheckCircle2 className="w-3 h-3 text-[#0071e3]" />
    }
  };

  const handleUpdateStatus = async (eventId, newStatus, notes = '') => {
    if (!eventId) return;
    setUpdatingStatusId(eventId);
    setActionError(null);
    try {
      await api.events.updateStatus(eventId, newStatus, notes);
      setStatusOverrides(prev => ({ ...prev, [eventId]: newStatus }));
    } catch (err) {
      console.error('Failed to update event status:', err);
      setActionError(`Failed to update: ${err.message || 'Server error'}`);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleRerunAI = async (eventId) => {
    if (!eventId) return;
    setReanalyzingId(eventId);
    setActionError(null);
    try {
      const updated = await api.events.rerunAnalysis(eventId);
      if (updated && updated.status) {
        setStatusOverrides(prev => ({ ...prev, [eventId]: updated.status }));
      }
    } catch (err) {
      console.error('Failed to rerun AI analysis:', err);
      setActionError(`AI analysis failed: ${err.message || 'Server error'}`);
    } finally {
      setReanalyzingId(null);
    }
  };

  const severityStyles = {
    CRITICAL: {
      border: 'border-l-[#ff3b30]',
      badge: 'bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/25',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#ff3b30]" />
    },
    HIGH: {
      border: 'border-l-[#ff9500]',
      badge: 'bg-[#ff9500]/15 text-[#ff9500] border-[#ff9500]/25',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[#ff9500]" />
    },
    MEDIUM: {
      border: 'border-l-[#ff9500]',
      badge: 'bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/20',
      icon: <AlertCircle className="w-3.5 h-3.5 text-[#ff9500]" />
    },
    LOW: {
      border: 'border-l-[#86868b]',
      badge: 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent',
      icon: <Info className="w-3.5 h-3.5 text-[#86868b]" />
    }
  };

  const toggleExpanded = (key) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#f5f5f7] dark:bg-[#000000] overflow-hidden min-h-0">
      {/* Header & Filter Controls (Apple Frosted Bar) */}
      <div className="flex-shrink-0 p-4 sm:p-5 border-b border-black/[0.08] dark:border-white/[0.08] bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ff3b30] breathe-dot" />
              <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
                Behavior Inquiries & Alerts
              </h2>
            </div>
            <p className="text-xs text-[#86868b] mt-0.5">
              Automated behavioral observations flagged by computer vision and multimodal review.
            </p>
          </div>

          {/* Lifecycle Status & Event Type Filters */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#f5f5f7] dark:bg-[#2c2c2e] border border-transparent focus:border-[#0071e3] rounded-xl px-3 py-1.5 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 cursor-pointer transition-all font-medium"
            >
              <option value="all">All Lifecycle States</option>
              <option value="PRELIMINARY">🟡 Preliminary (AI Verifying)</option>
              <option value="AI_CONFIRMED">🔴 AI Confirmed</option>
              <option value="AI_CLEARED">🟢 AI Cleared (Benign)</option>
              <option value="NEEDS_REVIEW">🟣 Needs Review (Unclear/Obscured)</option>
              <option value="HUMAN_RESOLVED">🔵 Signed Off (Resolved)</option>
            </select>

            {/* Event Type Filter */}
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-[#86868b]" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-[#f5f5f7] dark:bg-[#2c2c2e] border border-transparent focus:border-[#0071e3] rounded-xl px-3 py-1.5 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 cursor-pointer transition-all"
              >
                <option value="all">All Anomaly Types</option>
                <option value="PEEKING_NEIGHBOR_PAPER">Neighbor Peeking (Rubbernecking)</option>
                <option value="PHONE_DETECTED">Phone Detected</option>
                <option value="CHEAT_SHEET">Cheat Sheet</option>
                <option value="COMMUNICATION">Communication</option>
                <option value="LOOKING_AWAY">Looking Away</option>
                <option value="ABNORMAL_POSTURE">Abnormal Posture</option>
                <option value="FACE_OBSCURED">Face Obscured</option>
                <option value="UNAUTHORIZED_ITEM">Unauthorized Item</option>
                <option value="AUDIO_ANOMALY">Audio Anomaly</option>
                <option value="ID_MISMATCH">ID Mismatch</option>
                <option value="SEAT_VIOLATION">Seat Violation</option>
                <option value="SUSPICIOUS_BEHAVIOR">Suspicious Behavior</option>
              </select>
            </div>
          </div>
        </div>

        {/* Segmented Apple Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
              filterSeverity === 'all'
                ? 'bg-[#0071e3] text-white shadow-xs font-semibold'
                : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/10'
            }`}
          >
            All <span className="ml-1 text-[11px] font-mono">({alerts.length})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('CRITICAL')}
            className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
              filterSeverity === 'CRITICAL'
                ? 'bg-[#ff3b30] text-white font-semibold shadow-xs'
                : 'text-[#ff3b30] bg-[#ff3b30]/10 hover:bg-[#ff3b30]/15 border border-[#ff3b30]/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff3b30]" />
            Critical <span className="font-mono text-[11px]">({severityCounts.CRITICAL})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('HIGH')}
            className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
              filterSeverity === 'HIGH'
                ? 'bg-[#ff9500] text-white font-semibold shadow-xs'
                : 'text-[#ff9500] bg-[#ff9500]/10 hover:bg-[#ff9500]/15 border border-[#ff9500]/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff9500]" />
            High <span className="font-mono text-[11px]">({severityCounts.HIGH})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('MEDIUM')}
            className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
              filterSeverity === 'MEDIUM'
                ? 'bg-[#ff9500] text-white font-semibold shadow-xs'
                : 'text-[#ff9500] bg-[#ff9500]/10 hover:bg-[#ff9500]/15 border border-[#ff9500]/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff9500]" />
            Medium <span className="font-mono text-[11px]">({severityCounts.MEDIUM})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('LOW')}
            className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
              filterSeverity === 'LOW'
                ? 'bg-[#86868b] text-white font-semibold shadow-xs'
                : 'text-[#86868b] bg-black/5 dark:bg-white/10 hover:bg-black/10'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#86868b]" />
            Low <span className="font-mono text-[11px]">({severityCounts.LOW})</span>
          </button>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-0">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-8 max-w-sm mx-auto my-8 text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-[#34c759]/10 flex items-center justify-center mb-3 text-[#34c759]">
              <CheckCircle2 className="w-6 h-6 text-[#34c759]" />
            </div>
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white tracking-tight">No Inquiries Found</p>
            <p className="text-xs text-[#86868b] mt-1 leading-relaxed">
              No surveillance events detected matching the active filter criteria.
            </p>
          </div>
        ) : (
          paginatedAlerts.map((alert, index) => {
            const participant = alert.participant_id ? participantMap[alert.participant_id] : null;
            const alertKey = alert.event_id || `alert-${index}`;
            const isExpanded = expandedIds.has(alertKey);
            const style = severityStyles[alert.severity] || severityStyles.LOW;
            const confidencePct = Math.round((alert.confidence || 0) * 100);

            return (
              <div
                key={alert.event_id || alert.timestamp || index}
                className={`bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-4 sm:p-5 cursor-pointer transition-all border-l-4 ${style.border} hover:shadow-[0_6px_20px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]`}
                onClick={() => toggleExpanded(alertKey)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-2xl bg-black/5 dark:bg-white/10 flex-shrink-0">
                    {style.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-xs text-[#1d1d1f] dark:text-white tracking-tight">
                        {alert.event_type?.replace(/_/g, ' ')}
                      </span>

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${style.badge}`}>
                        {alert.severity}
                      </span>

                      {/* Anomaly State Machine Badge */}
                      {(() => {
                        const effStatus = statusOverrides[alert.event_id] || alert.status || 'PRELIMINARY';
                        const sStyle = statusStyles[effStatus] || statusStyles.PRELIMINARY;
                        return (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border flex items-center gap-1.5 transition-all ${sStyle.badge} ${sStyle.pulse ? 'animate-pulse' : ''}`}
                            title={`Status: ${sStyle.label}`}
                          >
                            {sStyle.icon}
                            <span>{sStyle.label}</span>
                          </span>
                        );
                      })()}

                      {participant && (
                        <div className="flex items-center gap-1.5 text-xs text-[#1d1d1f] dark:text-white bg-black/5 dark:bg-white/10 px-2.5 py-0.5 rounded-full">
                          <User size={11} className="text-[#0071e3]" />
                          <span className="font-medium">{participant.name}</span>
                          <span className="text-[#86868b] font-mono text-[10px]">({participant.roll_number})</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-[#86868b] leading-relaxed">
                      {alert.description}
                    </p>

                    {/* Metadata line */}
                    <div className="flex items-center gap-4 mt-2.5 text-[11px] font-mono text-[#86868b]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#86868b]" />
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-[#0071e3]" />
                        <span>Confidence:</span>
                        <span className="text-[#1d1d1f] dark:text-white font-medium">{confidencePct}%</span>
                        <div className="w-14 bg-black/5 dark:bg-white/10 rounded-full h-1.5 overflow-hidden hidden sm:block">
                          <div
                            className="bg-[#0071e3] h-full rounded-full transition-all duration-300"
                            style={{ width: `${confidencePct}%` }}
                          />
                        </div>
                      </span>

                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3 text-[#86868b]" />
                        Camera {alert.camera_id ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="text-[#86868b] p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#1d1d1f] dark:text-white" /> : <ChevronDown className="w-4 h-4 text-[#86868b]" />}
                  </div>
                </div>

                {/* Expanded Forensic Details with Accordion Animation */}
                {isExpanded && (
                  <div className="mt-3.5 pt-3.5 border-t border-[#e0e4ea] dark:border-[#1c2742] ess-accordion-content" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* Left Side: Video Evidence Player (Dark Panel) */}
                      <div className="lg:col-span-7 flex flex-col space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#17233a] dark:text-slate-100 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider">
                            <Video size={13} className="text-[#2f5fb3]" />
                            <span>Synchronized Video Evidence</span>
                          </span>
                          {alert.event_id && (
                            <div className="flex items-center gap-2">
                              <a
                                href={`/api/events/${alert.event_id}/clip?download=true`}
                                download
                                className="text-[11px] text-[#2f5fb3] hover:underline font-mono flex items-center gap-1 transition-colors"
                                title="Download MP4 video clip"
                              >
                                <Download size={11} />
                                <span>MP4</span>
                              </a>
                              <a
                                href={`/api/events/${alert.event_id}/screenshot?download=true`}
                                download
                                className="text-[11px] text-[#5d6b82] dark:text-[#94a3b8] hover:text-[#17233a] dark:hover:text-white font-mono flex items-center gap-1 transition-colors"
                                title="Download full-resolution JPG keyframe"
                              >
                                <Download size={11} />
                                <span>JPG</span>
                              </a>
                            </div>
                          )}
                        </div>

                        {alert.event_id ? (
                          <div className="rounded-2xl overflow-hidden border border-black/[0.08] dark:border-white/[0.10] bg-black aspect-video flex items-center justify-center shadow-md relative">
                            <video
                              controls
                              autoPlay={false}
                              preload="metadata"
                              src={`/api/events/${alert.event_id}/clip`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallbackImg = e.currentTarget.parentElement.querySelector('.fallback-screenshot');
                                if (fallbackImg) fallbackImg.style.display = 'block';
                              }}
                            />
                            <img
                              src={`/api/events/${alert.event_id}/screenshot`}
                              alt="Evidentiary Screenshot"
                              className="fallback-screenshot w-full h-full object-contain hidden"
                              onError={(e) => {
                                e.currentTarget.parentElement.innerHTML = '<div class="text-xs font-mono text-slate-400 p-4 text-center">No video clip or screenshot available for this event</div>';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/5 dark:bg-white/5 aspect-video flex flex-col items-center justify-center text-[#86868b]">
                            <Video size={24} className="text-[#86868b] mb-1.5" />
                            <span className="text-xs">No video recording captured for this live alert</span>
                          </div>
                        )}

                        {/* Evidentiary Keyframe Details toggle */}
                        {alert.event_id && (
                          <details className="mt-1 bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3">
                            <summary className="text-xs text-[#0071e3] hover:underline cursor-pointer flex items-center justify-between font-medium">
                              <span className="flex items-center gap-1.5">
                                <Eye size={13} />
                                <span>High-Resolution Evidence Capture</span>
                              </span>
                              <span className="text-[11px] text-[#86868b]">Toggle View</span>
                            </summary>
                            <div className="mt-2 rounded-xl overflow-hidden border border-black/[0.08] dark:border-white/[0.08] bg-black/90 p-1 flex justify-center">
                              <img
                                src={`/api/events/${alert.event_id}/screenshot`}
                                alt="High-Res Keyframe Capture"
                                className="max-h-60 object-contain rounded-lg"
                              />
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Right Side: Infraction Rationale & Forensic Synthesis */}
                      <div className="lg:col-span-5 flex flex-col space-y-2.5">
                        {/* Infraction Rationale Banner */}
                        <div className="bg-[#ff9500]/5 dark:bg-[#ff9500]/10 border border-[#ff9500]/20 rounded-2xl p-4 shadow-xs">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-[#ff9500] flex items-center gap-1.5">
                              <AlertTriangle size={13} />
                              <span>Observation Rationale</span>
                            </span>
                            <span className="text-xs font-mono font-semibold text-[#1d1d1f] dark:text-white">
                              {confidencePct}% Match
                            </span>
                          </div>
                          <p className="text-xs text-[#1d1d1f] dark:text-slate-200 leading-relaxed">
                            {alert.description || alert.details?.reason || 'Computer vision proctoring heuristic threshold exceeded.'}
                          </p>
                        </div>

                        {/* Vision-Language Model (VLM) Reasoning */}
                        {(alert.details?.vlm_response || alert.analysis_data?.vlm_response || alert.analysis_data?.vlm_reasoning) && (
                          <div className="bg-[#0071e3]/5 dark:bg-[#0071e3]/10 border border-[#0071e3]/20 rounded-2xl p-4 shadow-xs">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0071e3] dark:text-[#0a84ff] mb-1.5">
                              <Sparkles size={13} />
                              <span>Multimodal VLM Review</span>
                            </div>
                            <p className="text-xs text-[#1d1d1f] dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                              {alert.details?.vlm_response || alert.analysis_data?.vlm_response || alert.analysis_data?.vlm_reasoning}
                            </p>
                          </div>
                        )}

                        {/* Telemetry Dossier */}
                        <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3.5 text-xs space-y-1.5">
                          <div className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wider border-b border-black/[0.06] dark:border-white/[0.06] pb-1">
                            Detection Telemetry
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[#1d1d1f] dark:text-white">
                            <div>
                              <span className="text-[#86868b]">Track ID:</span>{' '}
                              <span className="font-mono font-medium text-[#0071e3]">#{alert.track_id ?? 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-[#86868b]">Sensor:</span>{' '}
                              <span className="font-medium">Camera {alert.camera_id ?? 0}</span>
                            </div>
                            <div>
                              <span className="text-[#86868b]">Timestamp:</span>{' '}
                              <span className="font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {alert.event_id && (
                              <div className="col-span-2 truncate">
                                <span className="text-[#86868b]">Reference:</span>{' '}
                                <span className="text-[#86868b] font-mono text-[10px]">{alert.event_id}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Proctor Lifecycle State Controls */}
                        {alert.event_id && (
                          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3.5 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-[#86868b] uppercase tracking-wider border-b border-black/[0.06] dark:border-white/[0.06] pb-1">
                              <span>Proctor Lifecycle Actions</span>
                              {updatingStatusId === alert.event_id && (
                                <span className="flex items-center gap-1 text-[#0071e3]">
                                  <Loader2 size={10} className="animate-spin" />
                                  <span>Updating...</span>
                                </span>
                              )}
                            </div>
                            {actionError && updatingStatusId === null && reanalyzingId === null && (
                              <div className="p-2 text-[11px] text-[#ff3b30] bg-[#ff3b30]/10 border border-[#ff3b30]/20 rounded-xl">
                                {actionError}
                              </div>
                            )}

                            {/* Unclear / Obscured Frame Warning Banner */}
                            {(() => {
                              const effStatus = statusOverrides[alert.event_id] || alert.status || 'PRELIMINARY';
                              if (effStatus === 'NEEDS_REVIEW') {
                                return (
                                  <div className="p-2.5 bg-[#af52de]/10 border border-[#af52de]/25 rounded-xl text-xs text-[#af52de] flex items-start gap-2">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-semibold">Needs Human Review: View Unclear</div>
                                      <div className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                                        The AI could not confidently detect the scene because the frame is blurry, lighting is degraded, or the candidate view is occluded. Please inspect manually.
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            {/* Background Automated VLM Indicator & Force Re-verify */}
                            <div className="flex items-center justify-between text-xs pt-0.5 pb-1">
                              <span className="text-[11px] text-[#86868b] flex items-center gap-1.5 font-medium">
                                <Sparkles size={11} className="text-[#0071e3]" />
                                <span>Background AI Verification</span>
                              </span>
                              <button
                                type="button"
                                disabled={reanalyzingId === alert.event_id || updatingStatusId === alert.event_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRerunAI(alert.event_id);
                                }}
                                className="text-[11px] text-[#0071e3] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Force on-demand VLM re-evaluation of this keyframe"
                              >
                                {reanalyzingId === alert.event_id ? (
                                  <>
                                    <Loader2 size={11} className="animate-spin text-[#0071e3]" />
                                    <span>Re-evaluating...</span>
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw size={11} />
                                    <span>Re-evaluate</span>
                                  </>
                                )}
                              </button>
                            </div>
                            {(() => {
                              const effStatus = statusOverrides[alert.event_id] || alert.status || 'PRELIMINARY';
                              if (effStatus === 'HUMAN_RESOLVED') {
                                return (
                                  <div className="flex items-center justify-between gap-2 p-2 bg-[#0071e3]/10 border border-[#0071e3]/20 rounded-xl text-xs text-[#0071e3]">
                                    <span className="flex items-center gap-1.5 font-medium">
                                      <Check size={13} />
                                      <span>Signed Off by Proctor</span>
                                    </span>
                                    <button
                                      type="button"
                                      disabled={updatingStatusId === alert.event_id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateStatus(alert.event_id, 'NEEDS_REVIEW', 'Re-opened by proctor for review');
                                      }}
                                      className="text-[11px] text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white underline cursor-pointer"
                                    >
                                      Re-open
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    disabled={updatingStatusId === alert.event_id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateStatus(alert.event_id, 'HUMAN_RESOLVED', 'Signed off by proctor');
                                    }}
                                    className="px-2.5 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                  >
                                    <Check size={12} />
                                    <span>Sign Off</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={updatingStatusId === alert.event_id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateStatus(alert.event_id, 'NEEDS_REVIEW', 'Flagged for human audit');
                                    }}
                                    className="px-2.5 py-1.5 bg-[#af52de]/15 hover:bg-[#af52de]/25 text-[#af52de] border border-[#af52de]/30 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    <AlertCircle size={12} />
                                    <span>Flag Review</span>
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Direct link to Incident Desk */}
                        {onViewIncident && alert.event_id && (
                          <button
                            onClick={() => onViewIncident(alert.event_id)}
                            className="w-full ess-btn-secondary text-xs rounded-xl py-2 flex items-center justify-center gap-1.5 font-medium cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Open in Forensic Dossier</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Pagination Dock (Apple Strip) */}
      {filteredAlerts.length > 0 && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-black/[0.08] dark:border-white/[0.08] bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#86868b]">
            <span>
              Showing <strong className="text-[#1d1d1f] dark:text-white">{Math.min(filteredAlerts.length, (currentPage - 1) * itemsPerPage + 1)}</strong>–<strong className="text-[#1d1d1f] dark:text-white">{Math.min(filteredAlerts.length, currentPage * itemsPerPage)}</strong> of <strong className="text-[#0071e3]">{filteredAlerts.length}</strong> events
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[#86868b]">
              <span>Per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#f5f5f7] dark:bg-[#2c2c2e] border border-transparent text-[#1d1d1f] dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#0071e3] cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="First Page"
              >
                <ChevronsLeft size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-xs px-2 text-[#86868b] font-medium">
                {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Last Page"
              >
                <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(AlertPanel);
