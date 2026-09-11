import React, { useState, useMemo, useEffect } from 'react';
import {
  Filter, ChevronDown, ChevronUp, Eye, Download,
  User, Search, ArrowUpDown, History, Video, AlertTriangle, Sparkles,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';

function EventTimeline({ events, examId, onViewIncident }) {
  const [filters, setFilters] = useState({
    severity: 'all',
    eventType: 'all',
    participant: 'all',
    search: '',
    sort: 'desc'
  });
  const [expandedId, setExpandedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, itemsPerPage]);

  const participants = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (e.participant_id && !map[e.participant_id]) {
        map[e.participant_id] = e.participant_name || `Candidate #${e.participant_id.slice(0, 6)}`;
      }
    });
    return map;
  }, [events]);

  const eventTypes = useMemo(() => [...new Set(events.map(e => e.event_type))], [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (filters.severity !== 'all' && event.severity !== filters.severity) return false;
      if (filters.eventType !== 'all' && event.event_type !== filters.eventType) return false;
      if (filters.participant !== 'all' && event.participant_id !== filters.participant) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const desc = event.description?.toLowerCase() || '';
        const pName = participants[event.participant_id]?.toLowerCase() || '';
        if (!desc.includes(search) && !pName.includes(search)) return false;
      }
      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return filters.sort === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [events, filters, participants]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const severityBadges = {
    CRITICAL: 'bg-[#c76454]/12 text-[#c76454] border-[#c76454]/35',
    HIGH: 'bg-[#c98a52]/12 text-[#c98a52] border-[#c98a52]/35',
    MEDIUM: 'bg-[#c2ab5c]/12 text-[#c2ab5c] border-[#c2ab5c]/35',
    LOW: 'bg-[#6b9ab5]/12 text-[#6b9ab5] border-[#6b9ab5]/35'
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <div className="h-full flex flex-col bg-transparent overflow-hidden min-h-0">
      {/* Search & Filter Bar */}
      <div className="flex-shrink-0 p-4 sm:p-5 border-b border-[rgba(244,241,235,0.07)] bg-[#1a1719]">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-3.5 h-3.5 text-[#b8789a]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#f0ece4] font-heading">
            Audit Log & Forensic Timeline
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89f97] w-3 h-3" />
            <input
              type="text"
              placeholder="Search audit trail by infraction, student, or keyword..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-8 pr-3 py-1.5 bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] rounded text-xs text-[#f0ece4] placeholder-[#6b6560] focus:outline-none focus:border-[#b8789a] transition-colors font-sans"
            />
          </div>

          {/* Severity filter */}
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            className="px-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] rounded text-xs text-[#f0ece4] focus:outline-none focus:border-[#b8789a] font-sans cursor-pointer hover:border-[rgba(244,241,235,0.22)]"
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical Severity</option>
            <option value="HIGH">High Severity</option>
            <option value="MEDIUM">Medium Severity</option>
            <option value="LOW">Low Severity</option>
          </select>

          {/* Event type filter */}
          <select
            value={filters.eventType}
            onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
            className="px-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] rounded text-xs text-[#f0ece4] focus:outline-none focus:border-[#b8789a] font-sans cursor-pointer hover:border-[rgba(244,241,235,0.22)]"
          >
            <option value="all">All Anomaly Models</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {/* Participant filter */}
          <select
            value={filters.participant}
            onChange={(e) => setFilters({ ...filters, participant: e.target.value })}
            className="px-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] rounded text-xs text-[#f0ece4] focus:outline-none focus:border-[#b8789a] font-sans cursor-pointer min-w-[150px] hover:border-[rgba(244,241,235,0.22)]"
          >
            <option value="all">All Candidates</option>
            {Object.entries(participants).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Sort order */}
          <button
            onClick={() => setFilters({ ...filters, sort: filters.sort === 'desc' ? 'asc' : 'desc' })}
            className="px-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] hover:border-[rgba(244,241,235,0.22)] rounded text-xs text-[#a89f97] hover:text-[#f0ece4] flex items-center gap-1.5 transition-colors"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-3 h-3 text-[#a89f97]" />
            <span className="font-mono text-[11px]">{filters.sort.toUpperCase()}</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-[#a89f97]">
          <div className="flex items-center gap-2">
            <span><strong className="text-[#f0ece4]">{filteredEvents.length}</strong> logged events</span>
            <span className="text-[#6b6560]">•</span>
            <span>Page <strong className="text-[#f0ece4]">{currentPage}</strong> of {totalPages || 1}</span>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-[rgba(244,241,235,0.06)]">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#6b6560] p-8">
            <div className="text-center max-w-sm ess-card p-6">
              <Filter className="w-8 h-8 mx-auto mb-2 text-[#6b6560]" />
              <p className="text-sm font-semibold text-[#f0ece4] font-heading">No events matched filters</p>
              <p className="text-xs text-[#a89f97] mt-1 font-sans">Adjust search parameters or severity thresholds to view logs.</p>
            </div>
          </div>
        ) : (
          paginatedEvents.map((event, index) => (
            <EventRow
              key={event.event_id || index}
              event={event}
              index={index}
              participantName={participants[event.participant_id]}
              severityBadges={severityBadges}
              formatTime={formatTime}
              isExpanded={expandedId === event.event_id}
              onToggle={() => setExpandedId(expandedId === event.event_id ? null : event.event_id)}
              onViewIncident={onViewIncident}
            />
          ))
        )}
      </div>

      {/* Bottom Pagination Dock */}
      {filteredEvents.length > 0 && (
        <div className="flex-shrink-0 px-4 sm:px-5 py-2.5 border-t border-[rgba(244,241,235,0.07)] bg-[#1a1719] flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-mono text-[#a89f97]">
            <span>
              Showing <strong className="text-[#f0ece4]">{Math.min(filteredEvents.length, (currentPage - 1) * itemsPerPage + 1)}</strong>–<strong className="text-[#f0ece4]">{Math.min(filteredEvents.length, currentPage * itemsPerPage)}</strong> of <strong className="text-[#b8789a]">{filteredEvents.length}</strong> events
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
                {currentPage} / {totalPages || 1}
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

function EventRow({ event, index, participantName, severityBadges, formatTime, isExpanded, onToggle, onViewIncident }) {
  const badgeClass = severityBadges[event.severity] || severityBadges.LOW;

  return (
    <div className={`transition-colors duration-100 ${isExpanded ? 'bg-[#221e20]' : 'hover:bg-[#1a1719]'}`}>
      {/* Main Row */}
      <div className="px-4 sm:px-5 py-3 flex items-center gap-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-[120px]">
          <span className={`px-2 py-0.5 text-[9px] font-mono font-semibold rounded border uppercase ${badgeClass}`}>
            {event.severity}
          </span>
          <span className="text-[11px] text-[#a89f97] font-mono">{formatTime(event.timestamp)}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#f0ece4] truncate font-sans">{event.event_type.replace(/_/g, ' ')}</span>
            {participantName && (
              <span className="flex items-center gap-1 text-[#f0ece4] bg-[#221e20] px-1.5 py-px rounded border border-[rgba(244,241,235,0.07)] text-[11px]">
                <User size={10} className="text-[#b8789a]" />
                <span className="truncate max-w-[130px] font-medium">{participantName}</span>
              </span>
            )}
            {event.track_id && (
              <span className="text-[#a89f97] font-mono text-[10px] bg-[#221e20] px-1.5 py-px rounded border border-[rgba(244,241,235,0.07)]">#TRK-{event.track_id}</span>
            )}
          </div>
          <p className="text-[11px] text-[#a89f97] truncate mt-0.5 font-sans">{event.description}</p>
        </div>

        <div className="flex items-center gap-2.5 text-[#a89f97]">
          <span className="text-[11px] font-mono text-[#a89f97]">
            {event.confidence ? `${(event.confidence * 100).toFixed(0)}%` : '--'}
          </span>

          {event.evidence_clip_path && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onViewIncident) onViewIncident(event.event_id);
              }}
              className="p-1 text-[#b8789a] hover:text-[#f0ece4] hover:bg-[#8a4a6b]/20 rounded transition-colors"
              title="Inspect Forensic Clip in Incident Desk"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-1 text-[#a89f97] hover:text-[#f0ece4] transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#f0ece4]" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Details with Accordion Animation */}
      {isExpanded && (
        <div className="px-5 py-4 border-t border-[rgba(244,241,235,0.07)] bg-[#1a1719] ess-accordion-content">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Side: Video Evidence Player */}
            <div className="lg:col-span-7 flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#f0ece4] flex items-center gap-1.5 font-heading text-xs">
                  <Video size={13} className="text-[#b8789a]" />
                  <span>Synchronized Video Evidence</span>
                </span>
                {event.evidence_clip_path && (
                  <a
                    href={`/api/events/${event.event_id}/clip?download=true`}
                    download
                    className="text-[11px] text-[#b8789a] hover:text-[#f0ece4] font-mono flex items-center gap-1"
                  >
                    <Download size={11} />
                    <span>Download MP4</span>
                  </a>
                )}
              </div>

              {event.evidence_clip_path ? (
                <div className="rounded overflow-hidden border border-[rgba(244,241,235,0.08)] bg-[#0b0a0a] aspect-video flex items-center justify-center shadow-sm relative group">
                  <video
                    controls
                    autoPlay={false}
                    preload="metadata"
                    src={`/api/events/${event.event_id}/clip`}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : event.evidence_screenshot_path ? (
                <div className="rounded overflow-hidden border border-[rgba(244,241,235,0.08)] bg-[#0b0a0a] aspect-video flex items-center justify-center shadow-sm">
                  <img
                    src={`/api/events/${event.event_id}/screenshot`}
                    alt="Evidentiary Keyframe Capture"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="rounded border border-[rgba(244,241,235,0.07)] bg-[#1a1719] aspect-video flex flex-col items-center justify-center text-[#6b6560]">
                  <Video size={24} className="text-[#6b6560] mb-1.5" />
                  <span className="text-xs font-mono">No video clip captured for this event</span>
                </div>
              )}

              {event.evidence_clip_path && event.evidence_screenshot_path && (
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
                      src={`/api/events/${event.event_id}/screenshot`}
                      alt="High-Res Keyframe"
                      className="max-h-64 object-contain rounded"
                    />
                  </div>
                </details>
              )}
            </div>

            {/* Right Side: Infraction Rationale & Synthesis */}
            <div className="lg:col-span-5 flex flex-col space-y-2.5">
              {/* Infraction Rationale */}
              <div className="ess-card p-3 border-l-[3px] border-l-[#c2ab5c] bg-[#1e1b17]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold font-heading text-[#c2ab5c] flex items-center gap-1">
                    <AlertTriangle size={12} className="text-[#c2ab5c]" />
                    <span>Infraction Rationale</span>
                  </span>
                  <span className="text-xs font-mono font-semibold text-[#f0ece4]">
                    {event.confidence ? `${(event.confidence * 100).toFixed(0)}% Confidence` : ''}
                  </span>
                </div>
                <p className="text-xs text-[#f0ece4] leading-relaxed font-sans">
                  {event.description || 'Proctoring heuristic threshold exceeded.'}
                </p>
              </div>

              {/* Multimodal VLM Reasoning */}
              {(event.analysis_data?.vlm_reasoning || event.analysis_data?.vlm_response) && (
                <div className="ess-card p-3 border-[rgba(138,74,107,0.35)] bg-[#1e171b]">
                  <div className="flex items-center gap-1 text-[10px] font-semibold font-heading text-[#b8789a] mb-1.5">
                    <Sparkles size={12} className="text-[#b8789a]" />
                    <span>Vision-Language Model Reasoning</span>
                  </div>
                  <p className="text-[11px] text-[#f0ece4] leading-relaxed whitespace-pre-wrap font-sans">
                    {event.analysis_data.vlm_reasoning || event.analysis_data.vlm_response}
                  </p>
                </div>
              )}

              {/* Event Metadata Dossier */}
              <div className="ess-card p-3 space-y-1.5 text-xs font-mono">
                <DetailRow label="Anomaly Model" value={event.event_type.replace(/_/g, ' ')} />
                <DetailRow label="Severity" value={event.severity} />
                <DetailRow label="Timestamp" value={new Date(event.timestamp).toLocaleString()} />
                <DetailRow label="Sensor" value={`CAM-${event.camera_id ?? 0}`} />
                <DetailRow label="CV Track ID" value={event.track_id ? `#TRK-${event.track_id}` : 'N/A'} />
                {participantName && <DetailRow label="Candidate" value={participantName} />}
                <DetailRow label="Event ID" value={event.event_id} />
              </div>

              {event.analysis_data && (
                <details className="bg-[#1a1719] border border-[rgba(244,241,235,0.07)] rounded p-2.5">
                  <summary className="text-[11px] font-sans text-[#a89f97] cursor-pointer font-medium hover:text-[#f0ece4]">
                    Machine Telemetry JSON
                  </summary>
                  <pre className="mt-1.5 text-[10px] font-mono text-[#f0ece4] overflow-auto max-h-32">
                    {JSON.stringify(event.analysis_data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-[#a89f97] w-32 shrink-0 font-sans">{label}:</span>
      <span className="text-[#f0ece4] font-medium truncate font-mono">{value}</span>
    </div>
  );
}

export default React.memo(EventTimeline);