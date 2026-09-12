import React, { useState, useMemo, useEffect } from 'react';
import {
  Filter, ChevronDown, ChevronUp, Eye, Download,
  User, Search, ArrowUpDown, History, Video, AlertTriangle, Sparkles,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock
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
    CRITICAL: 'bg-[#ff3b30]/15 text-[#ff3b30]',
    HIGH: 'bg-[#ff9500]/15 text-[#ff9500]',
    MEDIUM: 'bg-[#ff9500]/10 text-[#ff9500]',
    LOW: 'bg-black/5 dark:bg-white/10 text-[#86868b] dark:text-[#a1a1a6]'
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
    <div className="h-full flex flex-col bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] overflow-hidden min-h-0 transition-colors">
      {/* Apple Header & Filter Toolbar */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-black/5 dark:border-white/10 bg-[#fbfbfd]/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#0071e3]" />
            <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
              Activity History & Audit Log
            </h2>
          </div>
          <span className="text-xs text-[#86868b] dark:text-[#a1a1a6]">
            Showing <strong className="text-[#1d1d1f] dark:text-white">{filteredEvents.length}</strong> events
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Apple Capsule Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b] w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search history by event, candidate, or keyword..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-9 pr-4 py-2 bg-black/[0.04] dark:bg-white/10 border border-transparent hover:border-black/10 dark:hover:border-white/15 focus:border-[#0071e3] focus:bg-white dark:focus:bg-[#2c2c2e] rounded-full text-xs text-[#1d1d1f] dark:text-white placeholder-[#86868b] focus:outline-none focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
            />
          </div>

          {/* Severity filter pill */}
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            className="px-3.5 py-2 bg-black/[0.04] dark:bg-white/10 hover:bg-black/[0.07] dark:hover:bg-white/15 border border-transparent rounded-full text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer transition-all"
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Event type filter pill */}
          <select
            value={filters.eventType}
            onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
            className="px-3.5 py-2 bg-black/[0.04] dark:bg-white/10 hover:bg-black/[0.07] dark:hover:bg-white/15 border border-transparent rounded-full text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer transition-all"
          >
            <option value="all">All Event Types</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {/* Participant filter pill */}
          <select
            value={filters.participant}
            onChange={(e) => setFilters({ ...filters, participant: e.target.value })}
            className="px-3.5 py-2 bg-black/[0.04] dark:bg-white/10 hover:bg-black/[0.07] dark:hover:bg-white/15 border border-transparent rounded-full text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer transition-all max-w-[170px] truncate"
          >
            <option value="all">All Candidates</option>
            {Object.entries(participants).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Sort order pill */}
          <button
            onClick={() => setFilters({ ...filters, sort: filters.sort === 'desc' ? 'asc' : 'desc' })}
            className="px-3.5 py-2 bg-black/[0.04] dark:bg-white/10 hover:bg-black/[0.07] dark:hover:bg-white/15 rounded-full text-xs text-[#1d1d1f] dark:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-3 h-3 text-[#86868b]" />
            <span className="font-medium text-[11px]">{filters.sort === 'desc' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>
      </div>

      {/* Table Header Row */}
      <div className="px-6 py-2.5 bg-[#fbfbfd]/50 dark:bg-[#1c1c1e]/50 border-b border-black/5 dark:border-white/5 flex items-center gap-4 text-[11px] font-medium text-[#86868b] dark:text-[#a1a1a6] select-none">
        <div className="min-w-[140px]">Time & Severity</div>
        <div className="flex-1 min-w-0">Activity & Context</div>
        <div className="min-w-[80px] text-right">Confidence</div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-black/5 dark:divide-white/5 bg-white dark:bg-[#1c1c1e]">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center max-w-sm rounded-3xl bg-[#f5f5f7] dark:bg-[#2c2c2e] p-8 text-[#86868b] dark:text-[#a1a1a6]">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">No Matching Events</p>
              <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] mt-1">
                Try adjusting your search query or severity filter.
              </p>
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

      {/* Apple Table Pagination Dock */}
      {filteredEvents.length > 0 && (
        <div className="flex-shrink-0 px-6 py-3.5 border-t border-black/5 dark:border-white/5 bg-[#fbfbfd]/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-[#86868b] dark:text-[#a1a1a6] font-medium">
            Showing <span className="font-semibold text-[#1d1d1f] dark:text-white">{Math.min(filteredEvents.length, (currentPage - 1) * itemsPerPage + 1)}</span>–<span className="font-semibold text-[#1d1d1f] dark:text-white">{Math.min(filteredEvents.length, currentPage * itemsPerPage)}</span> of <span className="font-semibold text-[#0071e3]">{filteredEvents.length}</span> events
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#86868b] dark:text-[#a1a1a6]">
              <span>Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-black/5 dark:bg-white/10 border border-transparent hover:border-black/10 dark:hover:border-white/20 text-[#1d1d1f] dark:text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer transition-all"
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="First Page"
              >
                <ChevronsLeft size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="px-2.5 text-xs font-medium text-[#1d1d1f] dark:text-white">
                {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                title="Next Page"
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
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
    <div className={`transition-colors duration-150 ${isExpanded ? 'bg-black/[0.02] dark:bg-white/[0.04]' : 'hover:bg-black/[0.015] dark:hover:bg-white/[0.02]'}`}>
      {/* Main Row */}
      <div className="px-6 py-3.5 flex items-center gap-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2.5 min-w-[140px]">
          <span className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full ${badgeClass}`}>
            {event.severity}
          </span>
          <span className="text-xs text-[#86868b] dark:text-[#a1a1a6] flex items-center gap-1">
            <Clock size={11} />
            {formatTime(event.timestamp)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#1d1d1f] dark:text-white truncate">{event.event_type.replace(/_/g, ' ')}</span>
            {participantName && (
              <span className="flex items-center gap-1 text-[#1d1d1f] dark:text-white bg-black/5 dark:bg-white/10 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
                <User size={10} className="text-[#0071e3]" />
                <span className="truncate max-w-[130px]">{participantName}</span>
              </span>
            )}
            {event.track_id && (
              <span className="text-[#86868b] text-[10px] bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
                Track #{event.track_id}
              </span>
            )}
          </div>
          <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] truncate mt-0.5">{event.description}</p>
        </div>

        <div className="flex items-center gap-3 text-[#86868b] dark:text-[#a1a1a6]">
          <span className="text-xs font-medium text-[#1d1d1f] dark:text-white">
            {event.confidence ? `${(event.confidence * 100).toFixed(0)}%` : '--'}
          </span>

          {event.evidence_clip_path && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onViewIncident) onViewIncident(event.event_id);
              }}
              className="p-1.5 text-[#0071e3] hover:bg-[#0071e3]/10 rounded-full transition-colors cursor-pointer"
              title="Inspect in Incident Viewer"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-1.5 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-6 py-5 border-t border-black/5 dark:border-white/5 bg-[#fbfbfd]/70 dark:bg-[#1c1c1e]/70 backdrop-blur-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side: Video Evidence */}
            <div className="lg:col-span-7 flex flex-col space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#1d1d1f] dark:text-white flex items-center gap-1.5">
                  <Video size={13} className="text-[#0071e3]" />
                  <span>Synchronized Video Capture</span>
                </span>
                {event.evidence_clip_path && (
                  <a
                    href={`/api/events/${event.event_id}/clip?download=true`}
                    download
                    className="text-xs text-[#0071e3] hover:underline flex items-center gap-1 font-medium"
                  >
                    <Download size={12} />
                    <span>Download MP4</span>
                  </a>
                )}
              </div>

              {event.evidence_clip_path ? (
                <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-black aspect-video flex items-center justify-center shadow-lg relative group">
                  <video
                    controls
                    autoPlay={false}
                    preload="metadata"
                    src={`/api/events/${event.event_id}/clip`}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : event.evidence_screenshot_path ? (
                <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-black aspect-video flex items-center justify-center shadow-lg">
                  <img
                    src={`/api/events/${event.event_id}/screenshot`}
                    alt="Evidentiary Keyframe Capture"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 aspect-video flex flex-col items-center justify-center text-[#86868b]">
                  <Video size={24} className="mb-2 opacity-50" />
                  <span className="text-xs">No media clip recorded for this event</span>
                </div>
              )}

              {event.evidence_clip_path && event.evidence_screenshot_path && (
                <details className="mt-1 bg-white dark:bg-[#2c2c2e] border border-black/5 dark:border-white/10 rounded-xl p-2.5">
                  <summary className="text-xs text-[#0071e3] hover:underline cursor-pointer flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1.5">
                      <Eye size={12} />
                      <span>View Keyframe Photo</span>
                    </span>
                    <span className="text-[11px] text-[#86868b]">Toggle image</span>
                  </summary>
                  <div className="mt-2 rounded-xl overflow-hidden bg-black p-1 flex justify-center">
                    <img
                      src={`/api/events/${event.event_id}/screenshot`}
                      alt="High-Res Keyframe"
                      className="max-h-64 object-contain rounded-lg"
                    />
                  </div>
                </details>
              )}
            </div>

            {/* Right Side: Behavioral Assessment & Telemetry */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              {/* Infraction Rationale */}
              <div className="bg-white dark:bg-[#2c2c2e] border border-black/5 dark:border-white/10 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[#ff9500] flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    <span>Behavior Assessment</span>
                  </span>
                  <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                    {event.confidence ? `${(event.confidence * 100).toFixed(0)}% Confidence` : ''}
                  </span>
                </div>
                <p className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7] leading-relaxed">
                  {event.description || 'Proctoring heuristic threshold exceeded.'}
                </p>
              </div>

              {/* Apple Intelligence / VLM Reasoning */}
              {(event.analysis_data?.vlm_reasoning || event.analysis_data?.vlm_response) && (
                <div className="bg-gradient-to-b from-[#0071e3]/10 to-transparent border border-[#0071e3]/20 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs text-[#0071e3] font-semibold mb-1.5">
                    <Sparkles size={13} />
                    <span>AI Reasoning Synthesis</span>
                  </div>
                  <p className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7] leading-relaxed whitespace-pre-wrap">
                    {event.analysis_data.vlm_reasoning || event.analysis_data.vlm_response}
                  </p>
                </div>
              )}

              {/* Event Metadata */}
              <div className="bg-white dark:bg-[#2c2c2e] border border-black/5 dark:border-white/10 rounded-2xl p-4 space-y-2 text-xs shadow-sm">
                <DetailRow label="Pattern Type" value={event.event_type.replace(/_/g, ' ')} />
                <DetailRow label="Severity" value={event.severity} />
                <DetailRow label="Timestamp" value={new Date(event.timestamp).toLocaleString()} />
                <DetailRow label="Sensor Unit" value={`Camera ${event.camera_id ?? 0}`} />
                <DetailRow label="Track ID" value={event.track_id ? `#TRK-${event.track_id}` : 'N/A'} />
                {participantName && <DetailRow label="Candidate" value={participantName} />}
                <DetailRow label="Event Identifier" value={event.event_id} />
              </div>

              {event.analysis_data && (
                <details className="bg-white dark:bg-[#2c2c2e] border border-black/5 dark:border-white/10 rounded-2xl p-3">
                  <summary className="text-xs text-[#86868b] dark:text-[#a1a1a6] cursor-pointer font-medium hover:text-[#1d1d1f] dark:hover:text-white">
                    Raw Machine Telemetry
                  </summary>
                  <pre className="mt-2 text-[11px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-3 overflow-auto max-h-32">
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
    <div className="flex items-center justify-between text-xs py-1 border-b border-black/[0.03] dark:border-white/[0.05] last:border-0">
      <span className="text-[#86868b] dark:text-[#a1a1a6]">{label}</span>
      <span className="font-medium text-[#1d1d1f] dark:text-white truncate max-w-[180px]">{value}</span>
    </div>
  );
}

export default React.memo(EventTimeline);