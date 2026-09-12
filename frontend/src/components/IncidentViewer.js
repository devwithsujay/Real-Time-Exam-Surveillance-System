import React, { useState, useEffect, useRef } from 'react';
import {
  Video, Play, Pause, Volume2, VolumeX, Download, ChevronLeft,
  AlertTriangle, ShieldAlert, Sparkles, Clock, Camera
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
    <div className="h-full flex flex-col bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] overflow-hidden min-h-0 transition-colors">
      {/* Apple macOS Toolbar */}
      <div className="px-6 py-3.5 border-b border-black/5 dark:border-white/10 bg-[#fbfbfd]/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl flex items-center justify-between z-10">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#ff3b30]" />
            <h2 className="text-sm font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
              Incident Evidence & Video Analysis
            </h2>
          </div>
          <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] mt-0.5">
            Synchronized recordings and behavioral assessments for exam arbitration
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-[#1d1d1f] dark:text-white">
            <span className="text-[#0071e3] font-semibold">{incidentEvents.length}</span> Record{incidentEvents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Apple Source List */}
        <div className="w-full lg:w-88 border-r border-black/5 dark:border-white/10 bg-[#fbfbfd]/60 dark:bg-[#1c1c1e]/60 backdrop-blur-xl overflow-y-auto flex-shrink-0 p-3 space-y-2">
          {incidentEvents.length === 0 ? (
            <div className="p-8 text-center text-[#86868b] dark:text-[#a1a1a6]">
              <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/10 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-[#86868b]" />
              </div>
              <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">No Flagged Incidents</p>
              <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] mt-1">
                Priority infractions with recorded media will appear here automatically.
              </p>
            </div>
          ) : (
            incidentEvents.map((event) => {
              const isSelected = selectedEvent?.event_id === event.event_id;
              const isCritical = event.severity === 'CRITICAL';
              return (
                <div
                  key={event.event_id}
                  onClick={() => setSelectedEvent(event)}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white dark:bg-[#2c2c2e] shadow-sm ring-1 ring-black/5 dark:ring-white/15'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                      isCritical ? 'bg-[#ff3b30]' : 'bg-[#ff9500]'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-xs font-semibold truncate ${
                          isSelected ? 'text-[#1d1d1f] dark:text-white' : 'text-[#86868b] dark:text-[#a1a1a6]'
                        }`}>
                          {event.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isCritical
                            ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
                            : 'bg-[#ff9500]/15 text-[#ff9500]'
                        }`}>
                          {event.severity}
                        </span>
                      </div>

                      <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] line-clamp-2 leading-relaxed">
                        {event.description}
                      </p>

                      <div className="flex items-center gap-2 mt-2 text-[11px] text-[#86868b] dark:text-[#a1a1a6]">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span>•</span>
                        <span>Track #{event.track_id}</span>
                        {event.evidence_clip_path && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#34c759] bg-[#34c759]/10 px-2 py-0.5 rounded-full font-medium">
                            <Video size={10} /> Video
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
        <div className="flex-1 flex flex-col overflow-hidden bg-[#f5f5f7] dark:bg-[#000000]">
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
              <div className="text-center max-w-sm rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/5 dark:border-white/10 p-8 text-[#86868b] dark:text-[#a1a1a6] shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/10 flex items-center justify-center mx-auto mb-3 text-[#86868b]">
                  <Video className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-[#1d1d1f] dark:text-white">Select an Incident</p>
                <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] mt-1">
                  Choose a record from the list to review synchronized playback and AI behavioral reasoning.
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
      <div className="px-6 py-3 border-b border-black/5 dark:border-white/10 bg-white/70 dark:bg-[#1c1c1e]/70 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white transition-all lg:hidden"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                {event.event_type.replace(/_/g, ' ')}
              </h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                isCritical
                  ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
                  : 'bg-[#ff9500]/15 text-[#ff9500]'
              }`}>
                {event.severity}
              </span>
            </div>
            <p className="text-[11px] text-[#86868b] dark:text-[#a1a1a6] mt-0.5">
              {new Date(event.timestamp).toLocaleString()} • Camera {event.camera_id ?? 0}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-[#1d1d1f] dark:text-white">
            Confidence: <span className="text-[#0071e3] font-semibold">{Math.round((event.confidence || 0) * 100)}%</span>
          </span>
        </div>
      </div>

      {/* Media & Forensic Panels */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden min-h-0">
        {/* Video / Keyframe Player */}
        <div className="flex-1 min-w-0 bg-black relative flex flex-col justify-between overflow-hidden">
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

              {/* Apple TV / QuickTime Floating Control Bar */}
              <div className="absolute bottom-5 left-0 right-0 px-6 flex justify-center pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-3 w-full max-w-xl bg-black/60 backdrop-blur-2xl px-4 py-2.5 rounded-full border border-white/15 shadow-2xl">
                  <button
                    onClick={togglePlay}
                    className="w-8 h-8 rounded-full bg-white text-black hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
                  >
                    {playing ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1.5 bg-white/20 rounded-full appearance-none accent-[#0071e3] cursor-pointer"
                  />

                  <span className="text-white text-xs font-mono font-medium shrink-0">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  <div className="flex items-center gap-2 pl-2 border-l border-white/20 shrink-0">
                    <button
                      onClick={() => handleVolumeChange(volume > 0 ? 0 : 1)}
                      className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                    >
                      {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>

                    <a
                      href={`/api/events/${event.event_id}/clip`}
                      download
                      className="p-1.5 text-[#0071e3] hover:text-white rounded-full hover:bg-white/10 transition-colors"
                      title="Download Evidence MP4"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : event.evidence_screenshot_path ? (
            <div className="relative w-full h-full flex items-center justify-center p-6">
              <img
                src={`/api/events/${event.event_id}/screenshot`}
                alt="Evidence keyframe capture"
                className="max-w-full max-h-full rounded-2xl border border-white/10 object-contain shadow-2xl"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#86868b] p-6">
              <Camera className="w-10 h-10 mb-2 opacity-60" />
              <p className="text-sm text-white font-medium">No Synced Media</p>
              <p className="text-xs text-[#86868b] mt-0.5">Event recorded as telemetry log only</p>
            </div>
          )}
        </div>

        {/* Forensic Dossier Sidebar */}
        <div className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-black/5 dark:border-white/10 bg-[#fbfbfd]/70 dark:bg-[#1c1c1e]/70 backdrop-blur-xl overflow-y-auto p-5 space-y-4 shrink-0">
          {/* Infraction Rationale */}
          <div className="bg-white dark:bg-[#2c2c2e] border border-black/5 dark:border-white/10 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#ff9500] flex items-center gap-1.5">
                <AlertTriangle size={13} />
                <span>Behavior Observation</span>
              </span>
              <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                {Math.round((event.confidence || 0) * 100)}% Confidence
              </span>
            </div>
            <p className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7] leading-relaxed">
              {event.description || 'Proctoring heuristic threshold exceeded.'}
            </p>
          </div>

          {/* Apple Intelligence / VLM Forensic Reasoning */}
          {(event.analysis_data?.vlm_reasoning || event.analysis_data?.vlm_response) && (
            <div className="bg-gradient-to-b from-[#0071e3]/10 to-transparent border border-[#0071e3]/20 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs text-[#0071e3] font-semibold mb-2">
                <Sparkles size={13} />
                <span>AI Behavioral Assessment</span>
              </div>
              <p className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7] leading-relaxed whitespace-pre-wrap">
                {event.analysis_data.vlm_reasoning || event.analysis_data.vlm_response}
              </p>
            </div>
          )}

          <DetailSection title="Event Details">
            <DetailRow label="Event Identifier" value={event.event_id} />
            <DetailRow label="Pattern Type" value={event.event_type.replace(/_/g, ' ')} />
            <DetailRow label="Severity" value={event.severity} />
            <DetailRow label="Track ID" value={event.track_id ? `#${event.track_id}` : 'N/A'} />
            <DetailRow label="Sensor Unit" value={`Camera ${event.camera_id ?? 0}`} />
            <DetailRow label="Confidence" value={`${Math.round((event.confidence || 0) * 100)}%`} />
            {event.participant_id && <DetailRow label="Participant" value={event.participant_id} />}
          </DetailSection>

          {event.evidence_screenshot_path && event.evidence_clip_path && (
            <DetailSection title="Keyframe Capture">
              <img
                src={`/api/events/${event.event_id}/screenshot`}
                alt="Evidence screenshot"
                className="w-full rounded-xl border border-black/5 dark:border-white/10 mt-1 shadow-sm"
              />
            </DetailSection>
          )}

          {event.analysis_data && (
            <DetailSection title="Sensor Telemetry">
              <pre className="text-[11px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7] bg-black/5 dark:bg-white/5 p-3 rounded-xl overflow-auto max-h-40 border border-black/5 dark:border-white/10 mt-1">
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
    <div className="rounded-2xl overflow-hidden bg-white dark:bg-[#2c2c2e] border border-black/5 dark:border-white/10 shadow-sm p-4">
      <h4 className="text-xs font-semibold text-[#86868b] dark:text-[#a1a1a6] mb-2">{title}</h4>
      <div>{children}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-black/[0.03] dark:border-white/[0.05] last:border-0">
      <span className="text-[#86868b] dark:text-[#a1a1a6]">{label}</span>
      <span className="font-medium text-[#1d1d1f] dark:text-white truncate max-w-[180px]">{value}</span>
    </div>
  );
}

export default IncidentViewer;