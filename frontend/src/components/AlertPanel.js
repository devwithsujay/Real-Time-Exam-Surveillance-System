import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Clock,
  Camera, User, Cpu, Sparkles, Filter, CheckCircle2, ShieldAlert,
  Eye, Download, Video, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';

function AlertPanel({ alerts, participants, onViewIncident }) {
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSeverity, filterType, itemsPerPage]);

  const participantMap = useMemo(() => {
    const map = {};
    participants.forEach(p => { map[p.participant_id] = p; });
    return map;
  }, [participants]);

  const filteredAlerts = useMemo(() => alerts.filter(alert => {
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    if (filterType !== 'all' && alert.event_type !== filterType) return false;
    return true;
  }), [alerts, filterSeverity, filterType]);

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

  const severityStyles = {
    CRITICAL: {
      border: 'border-l-[#c76454]',
      badge: 'bg-[#c76454]/12 text-[#c76454] border-[#c76454]/35',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#c76454]" />
    },
    HIGH: {
      border: 'border-l-[#c98a52]',
      badge: 'bg-[#c98a52]/12 text-[#c98a52] border-[#c98a52]/35',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[#c98a52]" />
    },
    MEDIUM: {
      border: 'border-l-[#c2ab5c]',
      badge: 'bg-[#c2ab5c]/12 text-[#c2ab5c] border-[#c2ab5c]/35',
      icon: <AlertCircle className="w-3.5 h-3.5 text-[#c2ab5c]" />
    },
    LOW: {
      border: 'border-l-[#6b9ab5]',
      badge: 'bg-[#6b9ab5]/12 text-[#6b9ab5] border-[#6b9ab5]/35',
      icon: <Info className="w-3.5 h-3.5 text-[#6b9ab5]" />
    }
  };

  const toggleExpanded = (index) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-transparent overflow-hidden min-h-0">
      {/* Header & Filter Controls */}
      <div className="flex-shrink-0 p-4 sm:p-5 border-b border-[rgba(244,241,235,0.07)] bg-[#1a1719]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c76454] pulse-critical" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#f0ece4] font-heading">
                Anomalies & Security Infractions
              </h2>
            </div>
            <p className="text-xs text-[#a89f97] mt-0.5 font-sans">
              Automated behavioral infractions flagged by computer vision heuristics and multimodal VLM
            </p>
          </div>

          {/* Event Type Filter */}
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[#a89f97]" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] rounded px-2.5 py-1 text-xs text-[#f0ece4] focus:outline-none focus:border-[#b8789a] font-sans cursor-pointer hover:border-[rgba(244,241,235,0.22)]"
            >
              <option value="all">All Anomaly Models</option>
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

        {/* Segmented Severity Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              filterSeverity === 'all'
                ? 'bg-[#221e20] text-[#f0ece4] border border-[rgba(244,241,235,0.15)] font-semibold'
                : 'text-[#a89f97] hover:text-[#f0ece4] hover:bg-[#221e20] border border-transparent'
            }`}
          >
            All <span className="ml-1 text-[#6b6560] font-mono">({alerts.length})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('CRITICAL')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              filterSeverity === 'CRITICAL'
                ? 'bg-[#c76454]/15 text-[#c76454] border border-[#c76454]/35 font-semibold'
                : 'text-[#a89f97] hover:text-[#c76454] hover:bg-[#c76454]/10 border border-transparent'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#c76454]" />
            Critical <span className="font-mono text-[11px] text-[#c76454]/90">({severityCounts.CRITICAL})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('HIGH')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              filterSeverity === 'HIGH'
                ? 'bg-[#c98a52]/15 text-[#c98a52] border border-[#c98a52]/35 font-semibold'
                : 'text-[#a89f97] hover:text-[#c98a52] hover:bg-[#c98a52]/10 border border-transparent'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#c98a52]" />
            High <span className="font-mono text-[11px] text-[#c98a52]/90">({severityCounts.HIGH})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('MEDIUM')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              filterSeverity === 'MEDIUM'
                ? 'bg-[#c2ab5c]/15 text-[#c2ab5c] border border-[#c2ab5c]/35 font-semibold'
                : 'text-[#a89f97] hover:text-[#c2ab5c] hover:bg-[#c2ab5c]/10 border border-transparent'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#c2ab5c]" />
            Medium <span className="font-mono text-[11px] text-[#c2ab5c]/90">({severityCounts.MEDIUM})</span>
          </button>

          <button
            onClick={() => setFilterSeverity('LOW')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              filterSeverity === 'LOW'
                ? 'bg-[#6b9ab5]/15 text-[#6b9ab5] border border-[#6b9ab5]/35 font-semibold'
                : 'text-[#a89f97] hover:text-[#6b9ab5] hover:bg-[#6b9ab5]/10 border border-transparent'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#6b9ab5]" />
            Low <span className="font-mono text-[11px] text-[#6b9ab5]/90">({severityCounts.LOW})</span>
          </button>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 min-h-0">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#a89f97] ess-card p-8 max-w-sm mx-auto my-8 text-center">
            <div className="w-10 h-10 rounded bg-[#6ba883]/10 border border-[#6ba883]/25 flex items-center justify-center mb-3 text-[#6ba883]">
              <CheckCircle2 className="w-5 h-5 text-[#6ba883]" />
            </div>
            <p className="text-sm font-semibold text-[#f0ece4] font-heading">No Anomalies Present</p>
            <p className="text-xs text-[#a89f97] mt-1 leading-relaxed font-sans">
              Surveillance pipeline has detected zero proctoring infractions under selected filter criteria.
            </p>
          </div>
        ) : (
          paginatedAlerts.map((alert, index) => {
            const participant = alert.participant_id ? participantMap[alert.participant_id] : null;
            const isExpanded = expandedIds.has(index);
            const style = severityStyles[alert.severity] || severityStyles.LOW;
            const confidencePct = Math.round((alert.confidence || 0) * 100);

            return (
              <div
                key={alert.event_id || alert.timestamp || index}
                className={`ess-card p-3.5 cursor-pointer transition-colors border-l-[3px] ${style.border}`}
                onClick={() => toggleExpanded(index)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] flex-shrink-0">
                    {style.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-xs text-[#f0ece4] font-sans">
                        {alert.event_type?.replace(/_/g, ' ')}
                      </span>

                      <span className={`px-1.5 py-px rounded text-[9px] font-mono uppercase font-semibold border ${style.badge}`}>
                        {alert.severity}
                      </span>

                      {participant && (
                        <div className="flex items-center gap-1.5 text-xs text-[#f0ece4] bg-[#221e20] px-2 py-px rounded border border-[rgba(244,241,235,0.07)]">
                          <User size={10} className="text-[#b8789a]" />
                          <span className="font-medium">{participant.name}</span>
                          <span className="text-[#a89f97] font-mono text-[10px]">({participant.roll_number})</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-[#a89f97] leading-relaxed font-sans">
                      {alert.description}
                    </p>

                    {/* Metadata line */}
                    <div className="flex items-center gap-4 mt-2.5 text-[11px] font-mono text-[#a89f97]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#6b6560]" />
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-[#b8789a]" />
                        <span>Confidence:</span>
                        <span className="text-[#f0ece4] font-medium">{confidencePct}%</span>
                        <div className="w-12 bg-[#0b0a0a] rounded h-1 overflow-hidden hidden sm:block border border-[rgba(244,241,235,0.08)]">
                          <div
                            className="bg-[#8a4a6b] h-full rounded transition-all duration-300"
                            style={{ width: `${confidencePct}%` }}
                          />
                        </div>
                      </span>

                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3 text-[#6b6560]" />
                        CAM-{alert.camera_id ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="text-[#a89f97] p-1 rounded hover:bg-[#221e20] transition-colors">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#f0ece4]" /> : <ChevronDown className="w-4 h-4 text-[#a89f97]" />}
                  </div>
                </div>

                {/* Expanded Forensic Details with Accordion Animation */}
                {isExpanded && (
                  <div className="mt-3.5 pt-3.5 border-t border-[rgba(244,241,235,0.07)] ess-accordion-content" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* Left Side: Video Evidence Player */}
                      <div className="lg:col-span-7 flex flex-col space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#f0ece4] flex items-center gap-1.5 font-heading text-xs">
                            <Video size={13} className="text-[#b8789a]" />
                            <span>Synchronized Video Evidence</span>
                          </span>
                          {alert.event_id && (
                            <div className="flex items-center gap-2">
                              <a
                                href={`/api/events/${alert.event_id}/clip?download=true`}
                                download
                                className="text-[11px] text-[#b8789a] hover:text-[#f0ece4] font-mono flex items-center gap-1 transition-colors"
                                title="Download MP4 video clip"
                              >
                                <Download size={11} />
                                <span>MP4</span>
                              </a>
                              <a
                                href={`/api/events/${alert.event_id}/screenshot?download=true`}
                                download
                                className="text-[11px] text-[#a89f97] hover:text-[#f0ece4] font-mono flex items-center gap-1 transition-colors"
                                title="Download full-resolution JPG keyframe"
                              >
                                <Download size={11} />
                                <span>JPG</span>
                              </a>
                            </div>
                          )}
                        </div>

                        {alert.event_id ? (
                          <div className="rounded overflow-hidden border border-[rgba(244,241,235,0.08)] bg-[#0b0a0a] aspect-video flex items-center justify-center shadow-sm relative">
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
                                e.currentTarget.parentElement.innerHTML = '<div class="text-xs font-mono text-slate-500 p-4 text-center">No video clip or screenshot available for this event</div>';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="rounded border border-[rgba(244,241,235,0.07)] bg-[#1a1719] aspect-video flex flex-col items-center justify-center text-[#6b6560]">
                            <Video size={24} className="text-[#6b6560] mb-1.5" />
                            <span className="text-xs font-mono">No video clip captured for this live alert</span>
                          </div>
                        )}

                        {/* Evidentiary Keyframe Details toggle */}
                        {alert.event_id && (
                          <details className="mt-1 bg-[#1a1719] border border-[rgba(244,241,235,0.07)] rounded p-2">
                            <summary className="text-[11px] font-mono text-[#b8789a] hover:text-[#f0ece4] cursor-pointer flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Eye size={12} />
                                <span>View High-Resolution Evidentiary Keyframe</span>
                              </span>
                              <span className="text-[10px] text-[#6b6560] font-mono">Toggle Keyframe</span>
                            </summary>
                            <div className="mt-2 rounded overflow-hidden border border-[rgba(244,241,235,0.08)] bg-[#0b0a0a] p-1 flex justify-center">
                              <img
                                src={`/api/events/${alert.event_id}/screenshot`}
                                alt="High-Res Keyframe Capture"
                                className="max-h-60 object-contain rounded"
                              />
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Right Side: Infraction Rationale & Forensic Synthesis */}
                      <div className="lg:col-span-5 flex flex-col space-y-2.5">
                        {/* Infraction Rationale Banner */}
                        <div className="ess-card p-3 border-l-[3px] border-l-[#c2ab5c] bg-[#1e1b17]">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold font-heading text-[#c2ab5c] flex items-center gap-1">
                              <AlertTriangle size={12} className="text-[#c2ab5c]" />
                              <span>Infraction Rationale</span>
                            </span>
                            <span className="text-xs font-mono font-semibold text-[#f0ece4]">
                              {confidencePct}% Confidence
                            </span>
                          </div>
                          <p className="text-xs text-[#f0ece4] leading-relaxed font-sans">
                            {alert.description || alert.details?.reason || 'Computer vision proctoring heuristic threshold exceeded.'}
                          </p>
                        </div>

                        {/* Vision-Language Model (VLM) Reasoning */}
                        {(alert.details?.vlm_response || alert.analysis_data?.vlm_response || alert.analysis_data?.vlm_reasoning) && (
                          <div className="ess-card p-3 border-[rgba(138,74,107,0.35)] bg-[#1e171b]">
                            <div className="flex items-center gap-1 text-[10px] font-semibold font-heading text-[#b8789a] mb-1.5">
                              <Sparkles size={12} className="text-[#b8789a]" />
                              <span>Vision-Language Model Reasoning</span>
                            </div>
                            <p className="text-[11px] text-[#f0ece4] leading-relaxed whitespace-pre-wrap font-sans">
                              {alert.details?.vlm_response || alert.analysis_data?.vlm_response || alert.analysis_data?.vlm_reasoning}
                            </p>
                          </div>
                        )}

                        {/* Telemetry Dossier */}
                        <div className="bg-[#1a1719] border border-[rgba(244,241,235,0.07)] rounded p-2.5 text-[11px] font-mono space-y-1.5">
                          <div className="text-[10px] font-heading font-semibold text-[#f0ece4] border-b border-[rgba(244,241,235,0.07)] pb-1">
                            Telemetry Dossier
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[#f0ece4]">
                            <div>
                              <span className="text-[#6b6560] font-sans">CV Track:</span>{' '}
                              <span className="text-[#b8789a] font-semibold">#{alert.track_id ?? 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-[#6b6560] font-sans">Sensor:</span>{' '}
                              <span className="text-[#f0ece4]">CAM-{alert.camera_id ?? 0}</span>
                            </div>
                            <div>
                              <span className="text-[#6b6560] font-sans">Time:</span>{' '}
                              <span className="text-[#f0ece4]">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {alert.event_id && (
                              <div className="col-span-2 truncate">
                                <span className="text-[#6b6560] font-sans">Event ID:</span>{' '}
                                <span className="text-[#a89f97] font-mono text-[10px]">{alert.event_id}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Direct link to Incident Desk */}
                        {onViewIncident && alert.event_id && (
                          <button
                            onClick={() => onViewIncident(alert.event_id)}
                            className="w-full py-1.5 px-3 bg-[#221e20] hover:bg-[#2a2528] border border-[rgba(244,241,235,0.12)] hover:border-[#b8789a]/50 rounded text-[#b8789a] hover:text-[#f0ece4] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Eye size={12} />
                            <span>Open in Incident Desk Dossier</span>
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

      {/* Bottom Pagination Dock */}
      {filteredAlerts.length > 0 && (
        <div className="flex-shrink-0 px-4 sm:px-5 py-2.5 border-t border-[rgba(244,241,235,0.07)] bg-[#1a1719] flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-mono text-[#a89f97]">
            <span>
              Showing <strong className="text-[#f0ece4]">{Math.min(filteredAlerts.length, (currentPage - 1) * itemsPerPage + 1)}</strong>–<strong className="text-[#f0ece4]">{Math.min(filteredAlerts.length, currentPage * itemsPerPage)}</strong> of <strong className="text-[#b8789a]">{filteredAlerts.length}</strong> infractions
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-[#a89f97] font-mono">
              <span>Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] text-[#f0ece4] rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-[#b8789a] cursor-pointer"
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-[#a89f97] hover:text-[#f0ece4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="First Page"
              >
                <ChevronsLeft size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-[#a89f97] hover:text-[#f0ece4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="px-2 text-xs font-mono text-[#f0ece4]">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-[#a89f97] hover:text-[#f0ece4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-[#a89f97] hover:text-[#f0ece4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
