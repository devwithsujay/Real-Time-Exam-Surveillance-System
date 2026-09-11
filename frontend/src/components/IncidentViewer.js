import React, { useState, useEffect, useRef } from 'react';
import {
  Video, Play, Pause, Volume2, VolumeX, Download, ChevronLeft,
  AlertTriangle, ShieldAlert, Sparkles
} from 'lucide-react';

function IncidentViewer({ events, examId, selectedEventId }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const incidentEvents = events.filter(e =>
    e.severity === 'HIGH' || e.severity === 'CRITICAL' || e.evidence_clip_path
  );

  useEffect(() => {
    if (selectedEventId) {
      const found = events.find(e => e.event_id === selectedEventId);
      if (found) setSelectedEvent(found);
    } else if (!selectedEvent && incidentEvents.length > 0) {
      setSelectedEvent(incidentEvents[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [selectedEvent?.event_id]);

  const handleVideoEnded = () => {
    setPlaying(false);
    setCurrentTime(0);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
        setPlaying(false);
      } else {
        videoRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    }
  };

  const handleSeek = (e) => {
    if (videoRef.current) {
      const val = parseFloat(e.target.value);
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Header */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-[rgba(244,241,235,0.07)] bg-[#1a1719] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#c76454]" />
            <h2 className="text-xs font-semibold text-[#f0ece4] font-heading">
              Forensic Evidence Dossier & Video Analysis
            </h2>
          </div>
          <p className="text-[11px] text-[#a89f97] mt-0.5 font-sans">
            Cryptographically bound evidentiary captures for exam arbitration and forensics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] text-xs font-mono text-[#f0ece4]">
            <strong className="text-[#f0ece4]">{incidentEvents.length}</strong> Evidence Dossier{incidentEvents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Incident List */}
        <div className="w-full lg:w-80 border-r border-[rgba(244,241,235,0.07)] bg-[#0b0a0a] overflow-y-auto flex-shrink-0 divide-y divide-[rgba(244,241,235,0.06)]">
          {incidentEvents.length === 0 ? (
            <div className="p-8 text-center text-[#6b6560]">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-[#6b6560]" />
              <p className="text-xs font-medium text-[#f0ece4] font-heading">No High Severity Evidence</p>
              <p className="text-[11px] text-[#a89f97] mt-1 font-sans">High/Critical infractions with recorded media will appear here.</p>
            </div>
          ) : (
            incidentEvents.map((event) => {
              const isSelected = selectedEvent?.event_id === event.event_id;
              const isCritical = event.severity === 'CRITICAL';
              return (
                <div
                  key={event.event_id}
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#221e20] border-l-2 border-[#b8789a]'
                      : 'hover:bg-[#1a1719]'
                  }`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      isCritical ? 'bg-[#c76454]' : 'bg-[#c98a52]'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-xs font-semibold truncate font-sans ${isSelected ? 'text-[#f0ece4]' : 'text-[#a89f97]'}`}>
                          {event.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-px rounded border font-semibold ${
                          isCritical
                            ? 'bg-[#c76454]/15 text-[#c76454] border-[#c76454]/30'
                            : 'bg-[#c98a52]/15 text-[#c98a52] border-[#c98a52]/30'
                        }`}>
                          {event.severity}
                        </span>
                      </div>

                      <p className="text-[11px] text-[#a89f97] line-clamp-2 leading-relaxed font-sans">
                        {event.description}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-[#6b6560]">
                        <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>TRK #{event.track_id}</span>
                        {event.evidence_clip_path && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-[#6ba883] bg-[#6ba883]/10 px-1.5 py-px rounded border border-[#6ba883]/25">
                            <Video size={9} /> CLIP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Forensic Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#121011]">
          {selectedEvent ? (
            <IncidentDetail
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              videoRef={videoRef}
              playing={playing}
              volume={volume}
              currentTime={currentTime}
              duration={duration}
              handleVideoEnded={handleVideoEnded}
              handleTimeUpdate={handleTimeUpdate}
              handleLoadedMetadata={handleLoadedMetadata}
              togglePlay={togglePlay}
              handleSeek={handleSeek}
              handleVolumeChange={handleVolumeChange}
              formatTime={formatTime}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm ess-card p-6 text-[#a89f97]">
                <Video className="w-8 h-8 mx-auto mb-2 text-[#6b6560]" />
                <p className="text-sm font-semibold text-[#f0ece4] font-heading">Select Forensic Record</p>
                <p className="text-xs text-[#a89f97] mt-1 font-sans">
                  Choose an incident from the evidentiary register to review synchronized video clips, VLM rationale, and telemetry.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IncidentDetail({
  event,
  onClose,
  videoRef,
  playing,
  volume,
  currentTime,
  duration,
  handleVideoEnded,
  handleTimeUpdate,
  handleLoadedMetadata,
  togglePlay,
  handleSeek,
  handleVolumeChange,
  formatTime
}) {
  const isCritical = event.severity === 'CRITICAL';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      {/* Detail Toolbar */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-[rgba(244,241,235,0.07)] bg-[#1a1719] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#221e20] rounded text-[#a89f97] hover:text-[#f0ece4] transition-colors lg:hidden"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[#f0ece4] tracking-tight font-heading">
                {event.event_type.replace(/_/g, ' ')}
              </h3>
              <span className={`text-[9px] font-mono px-1.5 py-px rounded border font-semibold ${
                isCritical
                  ? 'bg-[#c76454]/15 text-[#c76454] border-[#c76454]/30'
                  : 'bg-[#c98a52]/15 text-[#c98a52] border-[#c98a52]/30'
              }`}>
                {event.severity}
              </span>
            </div>
            <p className="text-[10px] font-mono text-[#a89f97] mt-0.5">
              Timestamp: {new Date(event.timestamp).toLocaleString()} • CAM-{event.camera_id ?? 0}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] text-xs font-mono text-[#f0ece4]">
            Confidence: <strong className="text-[#b8789a]">{Math.round((event.confidence || 0) * 100)}%</strong>
          </span>
        </div>
      </div>

      {/* Media & Forensic Panels */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden min-h-0">
        {/* Video / Keyframe Player */}
        <div className="flex-1 min-w-0 bg-[#0b0a0a] relative flex flex-col justify-between overflow-hidden">
          {event.evidence_clip_path ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                src={`/api/events/${event.event_id}/clip`}
                className="w-full h-full object-contain"
                onEnded={handleVideoEnded}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onClick={togglePlay}
              />

              {/* Forensic Video Controls HUD */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0b0a0a]/95 via-[#0b0a0a]/60 to-transparent p-3">
                <div className="flex items-center gap-2.5 max-w-2xl mx-auto bg-[#1a1719]/95 px-3 py-2 rounded border border-[rgba(244,241,235,0.12)] shadow-lg">
                  <button
                    onClick={togglePlay}
                    className="p-1.5 bg-[#8a4a6b] hover:bg-[#9b5579] rounded text-white transition-colors"
                  >
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1 bg-[#221e20] rounded appearance-none accent-[#8a4a6b] cursor-pointer"
                  />

                  <span className="text-[#f0ece4] text-[11px] font-mono w-20 text-right">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  <div className="flex items-center gap-1.5 pl-2 border-l border-[rgba(244,241,235,0.08)]">
                    <button
                      onClick={() => handleVolumeChange(volume > 0 ? 0 : 1)}
                      className="p-1 text-[#a89f97] hover:text-[#f0ece4] transition-colors"
                    >
                      {volume > 0 ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    </button>

                    <a
                      href={`/api/events/${event.event_id}/clip`}
                      download
                      className="p-1 text-[#b8789a] hover:text-[#f0ece4] transition-colors"
                      title="Download Evidence MP4"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : event.evidence_screenshot_path ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={`/api/events/${event.event_id}/screenshot`}
                alt="Evidence keyframe capture"
                className="max-w-full max-h-full rounded border border-[rgba(244,241,235,0.08)] object-contain shadow-md"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#6b6560] p-6">
              <Video className="w-8 h-8 mb-2 text-[#6b6560]" />
              <p className="text-xs text-[#a89f97]">No synced media artifact</p>
              <p className="text-[11px] text-[#6b6560] mt-0.5">Logged event has metadata record only</p>
            </div>
          )}
        </div>

        {/* Forensic Dossier Sidebar */}
        <div className="w-full xl:w-88 border-t xl:border-t-0 xl:border-l border-[rgba(244,241,235,0.07)] bg-[#1a1719] overflow-y-auto p-4 space-y-3 flex-shrink-0">
          {/* Highlight Card: Infraction Rationale */}
          <div className="ess-card p-3 border-l-[3px] border-l-[#c2ab5c] bg-[#1e1b17]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-[#c2ab5c] flex items-center gap-1 font-heading">
                <AlertTriangle size={12} className="text-[#c2ab5c]" />
                <span>Infraction Rationale</span>
              </span>
              <span className="text-xs font-mono font-semibold text-[#f0ece4]">
                {Math.round((event.confidence || 0) * 100)}% Confidence
              </span>
            </div>
            <p className="text-xs text-[#f0ece4] leading-relaxed font-sans">
              {event.description || 'Proctoring heuristic threshold exceeded.'}
            </p>
          </div>

          {/* Multimodal VLM Forensic Reasoning */}
          {(event.analysis_data?.vlm_reasoning || event.analysis_data?.vlm_response) && (
            <div className="ess-card p-3 border-[rgba(138,74,107,0.35)] bg-[#1e171b]">
              <div className="flex items-center gap-1 text-[11px] text-[#b8789a] font-semibold mb-1.5 font-heading">
                <Sparkles size={12} className="text-[#b8789a]" />
                <span>VLM Forensic Reasoning:</span>
              </div>
              <p className="text-[11px] font-mono text-[#f0ece4] leading-relaxed whitespace-pre-wrap">
                {event.analysis_data.vlm_reasoning || event.analysis_data.vlm_response}
              </p>
            </div>
          )}

          <DetailSection title="Event Cryptographic Metadata">
            <DetailRow label="Event ID" value={event.event_id} />
            <DetailRow label="Anomaly Type" value={event.event_type.replace(/_/g, ' ')} />
            <DetailRow label="Severity" value={event.severity} />
            <DetailRow label="Track ID" value={event.track_id ? `#${event.track_id}` : 'N/A'} />
            <DetailRow label="Sensor Node" value={`CAM-${event.camera_id ?? 0}`} />
            <DetailRow label="Confidence" value={`${Math.round((event.confidence || 0) * 100)}%`} />
            {event.participant_id && <DetailRow label="Participant ID" value={event.participant_id} />}
          </DetailSection>

          {event.evidence_screenshot_path && event.evidence_clip_path && (
            <DetailSection title="Associated Keyframe Screenshot">
              <img
                src={`/api/events/${event.event_id}/screenshot`}
                alt="Evidence screenshot"
                className="w-full rounded border border-[rgba(244,241,235,0.08)]"
              />
            </DetailSection>
          )}

          {event.analysis_data && (
            <DetailSection title="Raw Machine Telemetry">
              <pre className="text-[10px] font-mono text-[#f0ece4] bg-[#0b0a0a] p-2.5 rounded border border-[rgba(244,241,235,0.07)] overflow-auto max-h-40">
                {JSON.stringify(event.analysis_data, null, 2)}
              </pre>
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div className="ess-card overflow-hidden">
      <div className="px-3 py-1.5 bg-[#221e20] border-b border-[rgba(244,241,235,0.07)]">
        <h4 className="text-[11px] font-semibold text-[#f0ece4] font-heading">{title}</h4>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start gap-2 text-[11px] mb-1.5">
      <span className="text-[#a89f97] w-32 shrink-0 font-sans">{label}:</span>
      <span className="text-[#f0ece4] font-mono font-medium truncate">{value}</span>
    </div>
  );
}

export default IncidentViewer;