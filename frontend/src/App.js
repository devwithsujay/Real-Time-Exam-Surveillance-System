import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, AlertTriangle, Users, Activity, Bell, ChevronLeft,
  X, Play, Pause, Download, Shield, LogOut
} from 'lucide-react';
import ExamMonitor from './components/ExamMonitor';
import AlertPanel from './components/AlertPanel';
import AnalyticsBoard from './components/AnalyticsBoard';
import EventTimeline from './components/EventTimeline';
import IncidentViewer from './components/IncidentViewer';
import RosterView from './components/RosterView';
import CreateExamModal from './components/CreateExamModal';
import LoginModal from './components/LoginModal';
import StaffManagementModal from './components/StaffManagementModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './services/api';

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';

function SurveillanceDashboard() {
  const { user, token, logout, isAdmin, isProctor } = useAuth();

  const [exam, setExam] = useState(null);
  const [examsList, setExamsList] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [events, setEvents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('monitor');
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const frameHandlersRef = useRef(new Set());

  const handleViewIncident = (eventId) => {
    setSelectedIncidentId(eventId);
    setActiveTab('incidents');
  };

  // Fetch exams on mount
  const fetchExams = useCallback(async () => {
    try {
      const data = await api.exams.list();
      setExamsList(data || []);
      // If proctor is scoped to specific exam, auto-select it
      if (isProctor && user?.assigned_exam_id && data?.length > 0) {
        const scoped = data.find(e => e.exam_id === user.assigned_exam_id);
        if (scoped && (!exam || exam.exam_id !== scoped.exam_id)) {
          loadExam(scoped.exam_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch exams:', err);
    }
  }, [isProctor, user?.assigned_exam_id, exam]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // WebSocket connection with JWT token
  useEffect(() => {
    if (!exam) return;

    let websocket;
    let reconnectTimeout;
    let unmounted = false;

    const connect = () => {
      const authQuery = token ? `?token=${token}` : '?token=demo';
      websocket = new WebSocket(`${WS_BASE}/exam/${exam.exam_id}${authQuery}`);
      websocket.binaryType = 'arraybuffer';
      setWs(websocket);

      websocket.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
      };

      websocket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          frameHandlersRef.current.forEach(fn => fn({
            binary: true,
            camera_id: 0,
            data: event.data
          }));
        } else {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'frame_meta') {
              frameHandlersRef.current.forEach(fn => fn({
                binary: false,
                camera_id: message.camera_id,
                tracks: message.tracks
              }));
            } else if (message.type === 'alert') {
              setAlerts(prev => [message.payload, ...prev.slice(0, 99)]);
            } else if (message.type === 'event') {
              setEvents(prev => [message.payload, ...prev.slice(0, 199)]);
            } else if (message.type === 'analytics') {
              setAnalytics(prev => ({
                ...prev,
                ...message.payload,
                summary: {
                  ...(prev?.summary || {}),
                  ...message.payload
                }
              }));
            }
          } catch (e) {
            console.error('WS message parse error:', e);
          }
        }
      };

      websocket.onerror = (err) => {
        console.error('WebSocket error:', err);
        setConnected(false);
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        if (!unmounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimeout);
      if (websocket) websocket.close();
    };
  }, [exam, token]);

  const registerFrameHandler = useCallback((handler) => {
    frameHandlersRef.current.add(handler);
    return () => frameHandlersRef.current.delete(handler);
  }, []);

  const loadExam = async (examId) => {
    setLoading(true);
    setError(null);
    try {
      const [examData, participantsData, eventsData, analyticsData] = await Promise.all([
        api.exams.get(examId),
        api.participants.list(examId, 1, 100),
        api.events.list(examId, { limit: 100 }),
        api.exams.getAnalytics(examId)
      ]);

      if (examData) {
        setExam(examData);
        setPipelineRunning(examData.status === 'IN_PROGRESS');
      }
      if (participantsData) {
        setParticipants(participantsData.participants || participantsData);
      }
      if (eventsData) {
        setEvents(eventsData.events || eventsData);
      }
      if (analyticsData) {
        setAnalytics(analyticsData);
      }
    } catch (err) {
      setError(err.message || 'Failed to load exam data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createExam = async (examData) => {
    try {
      const data = await api.exams.create(examData);
      if (data) {
        await fetchExams();
        await loadExam(data.exam_id);
      }
    } catch (err) {
      setError(err.message || 'Failed to create exam');
    }
  };

  const startExam = async () => {
    if (!exam) return;
    try {
      const data = await api.exams.start(exam.exam_id);
      if (data) {
        setExam(prev => ({ ...prev, status: data.status, started_at: data.started_at }));
        setPipelineRunning(true);
      }
    } catch (err) {
      setError(err.message || 'Failed to start exam');
    }
  };

  const endExam = async () => {
    if (!exam) return;
    try {
      const data = await api.exams.end(exam.exam_id);
      if (data) {
        setExam(prev => ({ ...prev, status: data.status, ended_at: data.ended_at }));
        setPipelineRunning(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to end exam');
    }
  };

  const downloadReport = async () => {
    if (!exam) return;
    try {
      const blob = await api.exams.downloadReport(exam.exam_id);
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      const safeName = (exam.exam_name || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_');
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `exam_report_${safeName}_${exam.exam_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 3000);
    } catch (err) {
      window.location.href = `/api/exams/${exam.exam_id}/report?format=pdf`;
    }
  };

  const handleCheckInParticipant = async (participantId) => {
    try {
      await api.participants.checkIn(participantId);
      if (exam) await loadExam(exam.exam_id);
    } catch (err) {
      console.error('Check-in failed:', err);
    }
  };

  const handleCheckOutParticipant = async (participantId) => {
    try {
      await api.participants.checkOut(participantId);
      if (exam) await loadExam(exam.exam_id);
    } catch (err) {
      console.error('Check-out failed:', err);
    }
  };

  const handleBatchCheckIn = async () => {
    if (!exam) return;
    try {
      await api.participants.batchCheckIn(exam.exam_id);
      await loadExam(exam.exam_id);
    } catch (err) {
      console.error('Batch check-in failed:', err);
    }
  };

  const handleAddParticipant = async (participantData) => {
    if (!exam) return;
    try {
      await api.participants.create(exam.exam_id, participantData);
      await loadExam(exam.exam_id);
    } catch (err) {
      console.error('Failed to add participant:', err);
      throw err;
    }
  };

  const handleSeedCohort = async (count) => {
    if (!exam) return;
    try {
      await api.participants.seedCohort(exam.exam_id, count);
      await loadExam(exam.exam_id);
    } catch (err) {
      console.error('Failed to seed cohort desks:', err);
      throw err;
    }
  };

  const tabs = [
    { id: 'monitor', label: 'Live Monitor', icon: Camera },
    { id: 'roster', label: 'Roster & Attendance', icon: Users, count: participants.length },
    { id: 'alerts', label: 'Alerts & Anomalies', icon: AlertTriangle, count: alerts.length },
    { id: 'analytics', label: 'Telemetry & Analytics', icon: Activity },
    { id: 'events', label: 'Audit Timeline', icon: Bell, count: events.length },
    { id: 'incidents', label: 'Forensic Dossier', icon: Shield }
  ];

  const roleBadgeStyle = user?.role === 'ADMIN'
    ? 'bg-[#8a4a6b]/15 text-[#b8789a] border-[#8a4a6b]/35'
    : user?.role === 'AUDITOR'
    ? 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.12)]'
    : 'bg-[#6ba883]/15 text-[#6ba883] border-[#6ba883]/30';

  return (
    <div className="h-screen max-h-screen bg-[#121011] text-[#f0ece4] flex flex-col font-sans selection:bg-[#8a4a6b]/30 overflow-hidden">
      {/* Top Command Bar */}
      <header className="bg-[#1a1719] border-b border-[rgba(244,241,235,0.07)] sticky top-0 z-40">
        <div className="flex items-center justify-between h-[50px] px-4 sm:px-5">
          {/* Left: Brand & Mobile Sidebar Toggle */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1.5 text-[#a89f97] hover:text-[#f0ece4] rounded hover:bg-[#221e20] transition-colors"
              aria-label="Toggle sidebar"
            >
              <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${sidebarOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-[#8a4a6b] flex items-center justify-center shadow-sm">
                <Shield className="w-3.5 h-3.5 text-[#f0ece4]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-bold tracking-tight text-[#f0ece4] font-heading">ARGUS</span>
                <span className="hidden sm:inline-block text-[10px] font-medium px-1.5 py-px rounded bg-[#221e20] text-[#a89f97] border border-[rgba(244,241,235,0.08)] font-sans">
                  Exam Integrity Registrar
                </span>
              </div>
            </div>

            {/* Breadcrumb / Current Exam */}
            {exam && (
              <div className="hidden md:flex items-center gap-2.5 pl-3.5 border-l border-[rgba(244,241,235,0.08)] text-xs">
                <span className="text-[#a89f97] text-[11px] font-sans">Session</span>
                <span className="font-semibold text-[#f0ece4] max-w-[200px] truncate font-heading">{exam.exam_name}</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${
                  exam.status === 'IN_PROGRESS'
                    ? 'bg-[#6ba883]/10 text-[#6ba883] border-[#6ba883]/25'
                    : 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.12)]'
                }`}>
                  {exam.status.replace('_', ' ')}
                </span>
              </div>
            )}
          </div>

          {/* Right: Live Telemetry & Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Stream Telemetry */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
              connected 
                ? 'bg-[#6ba883]/10 text-[#6ba883] border-[#6ba883]/25'
                : 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.12)]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-[#6ba883] pulse-live' : 'bg-[#6b6560]'}`} />
              <span className="hidden sm:inline">{connected ? 'Live Stream' : 'Offline'}</span>
            </div>

            {/* AI Engine Status */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
              pipelineRunning
                ? 'bg-[#8a4a6b]/15 text-[#b8789a] border-[#8a4a6b]/30'
                : 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.12)]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pipelineRunning ? 'bg-[#b8789a] pulse-warning' : 'bg-[#6b6560]'}`} />
              <span>{pipelineRunning ? 'AI Active' : 'Standby'}</span>
            </div>

            {/* Staff & RBAC (Admin) */}
            {isAdmin && (
              <button
                onClick={() => setShowStaffModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#f0ece4] bg-[#221e20] hover:bg-[#2a2528] border border-[rgba(244,241,235,0.12)] rounded transition-colors"
                title="Manage Staff and Role Assignments"
              >
                <Users size={12} />
                <span className="hidden sm:inline">Staff</span>
              </button>
            )}

            <div className="w-px h-3.5 bg-[rgba(244,241,235,0.08)]" />

            {/* User Profile */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-6 h-6 rounded bg-[#221e20] border border-[rgba(244,241,235,0.14)] flex items-center justify-center text-xs font-semibold text-[#f0ece4]">
                  {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              </div>
              <div className="hidden md:flex flex-col items-start leading-none">
                <span className="text-xs font-medium text-[#f0ece4]">{user?.username}</span>
                <span className={`mt-0.5 text-[9px] font-mono px-1.5 py-px rounded border uppercase tracking-wider font-semibold ${roleBadgeStyle}`}>
                  {user?.role}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="p-1.5 text-[#a89f97] hover:text-[#c76454] hover:bg-[#221e20] rounded transition-colors"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-[50px] left-0 z-30 w-60 flex-shrink-0 h-full bg-[#1a1719] border-r border-[rgba(244,241,235,0.07)] transform transition-transform duration-200 ease-in-out flex flex-col min-h-0 overflow-hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Exam Selector */}
          <div className="px-3.5 pt-3.5 pb-3 border-b border-[rgba(244,241,235,0.07)]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#f0ece4] font-sans">
                {isProctor && user?.assigned_exam_id ? 'Assigned Hall' : 'Exam Hall'}
              </label>
              {examsList.length > 0 && (
                <span className="text-[10px] font-mono font-medium text-[#a89f97] bg-[#221e20] px-1.5 py-px rounded border border-[rgba(244,241,235,0.08)]">
                  {examsList.length}
                </span>
              )}
            </div>

            <select
              value={exam?.exam_id || ''}
              disabled={isProctor && Boolean(user?.assigned_exam_id)}
              onChange={(e) => e.target.value && loadExam(e.target.value)}
              className="w-full bg-[#0b0a0a] border border-[rgba(244,241,235,0.12)] rounded px-2.5 py-1.5 text-xs text-[#f0ece4] focus:outline-none focus:border-[#b8789a] transition-colors font-sans cursor-pointer hover:border-[rgba(244,241,235,0.22)]"
            >
              <option value="">Select session...</option>
              {examsList.map((e) => (
                <option key={e.exam_id} value={e.exam_id}>
                  {e.exam_name} ({e.status})
                </option>
              ))}
            </select>

            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full mt-2 ess-btn-primary text-xs"
              >
                <span>+ Configure Hall</span>
              </button>
            )}
          </div>

          {/* Exam Lifecycle Controls */}
          {exam && (
            <div className="px-3.5 py-3 border-b border-[rgba(244,241,235,0.07)] space-y-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-[#a89f97] font-sans">Session State</span>
                <span className={`text-[10px] font-mono font-medium px-2 py-px rounded border uppercase tracking-wider ${
                  exam.status === 'IN_PROGRESS'
                    ? 'bg-[#6ba883]/10 text-[#6ba883] border-[#6ba883]/25'
                    : 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.12)]'
                }`}>
                  {exam.status.replace('_', ' ')}
                </span>
              </div>

              {isAdmin ? (
                <>
                  {exam.status === 'CREATED' && (
                    <button
                      onClick={startExam}
                      disabled={loading}
                      className="w-full ess-btn-success text-xs"
                    >
                      <Play size={11} className="fill-white" /> Start Surveillance
                    </button>
                  )}
                  {exam.status === 'IN_PROGRESS' && (
                    <button
                      onClick={endExam}
                      disabled={loading}
                      className="w-full ess-btn-danger text-xs"
                    >
                      <Pause size={11} className="fill-white" /> Terminate Session
                    </button>
                  )}
                </>
              ) : (
                <div className="py-1.5 text-center text-xs bg-[#221e20] border border-[rgba(244,241,235,0.07)] rounded text-[#a89f97] font-medium">
                  {exam.status === 'IN_PROGRESS' ? 'Surveillance Active' : 'Hall on Standby'}
                </div>
              )}

              <button
                onClick={downloadReport}
                className="w-full ess-btn-secondary text-xs"
              >
                <Download size={11} className="text-[#a89f97]" /> Export Dossier
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto py-2.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#221e20] text-[#f0ece4] border border-[rgba(244,241,235,0.14)] font-semibold'
                      : 'text-[#a89f97] hover:text-[#f0ece4] hover:bg-[rgba(244,241,235,0.04)] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={isActive ? 'text-[#b8789a]' : 'text-[#a89f97]'}>
                      <Icon size={13} />
                    </div>
                    <span>{tab.label}</span>
                  </div>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-px rounded border font-semibold min-w-[18px] text-center ${
                      isActive 
                        ? 'bg-[#8a4a6b]/20 text-[#b8789a] border-[#8a4a6b]/35' 
                        : 'bg-[#221e20] text-[#a89f97] border-[rgba(244,241,235,0.08)]'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Live Telemetry Sidebar Footer */}
          {exam && (() => {
            const summary = analytics?.summary || analytics || {};
            const totalEnrolled = Math.max(summary.total_students || 0, exam?.num_students || 0, participants.length);
            const actualCheckedIn = participants.filter(p => p.status === 'CHECKED_IN').length;
            const checkedIn = Math.max(summary.checked_in || 0, actualCheckedIn);
            const attendancePercent = totalEnrolled > 0 ? Math.min(100, Math.round((checkedIn / totalEnrolled) * 100)) : 0;
            const totalEventsCount = summary.total_events ?? events.length;
            const highEventsCount = summary.high_severity_events ?? events.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length;

            return (
              <div className="px-3.5 py-3 border-t border-[rgba(244,241,235,0.07)] bg-[#0b0a0a]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#a89f97] font-sans">Live Attendance</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6ba883] pulse-live" />
                    <span className="text-[10px] font-mono text-[#6ba883] font-medium">LIVE</span>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-medium">
                      <span className="text-[#a89f97]">Verified Presence</span>
                      <span className="font-mono text-[#f0ece4]">
                        {checkedIn}<span className="text-[#6b6560]">/{totalEnrolled}</span>
                      </span>
                    </div>
                    <div className="w-full bg-[#221e20] rounded h-1 overflow-hidden">
                      <div
                        className="bg-[#6ba883] h-full rounded transition-all duration-300"
                        style={{ width: `${attendancePercent}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] font-mono text-[#a89f97] mt-0.5">{attendancePercent}% present</div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <div className="bg-[#1a1719] border border-[rgba(244,241,235,0.07)] rounded px-2 py-1">
                      <div className="text-[10px] text-[#a89f97] font-sans">Flags</div>
                      <div className="font-mono font-semibold text-[#f0ece4] text-xs">{totalEventsCount}</div>
                    </div>
                    <div className={`border rounded px-2 py-1 ${
                      highEventsCount > 0
                        ? 'bg-[#c76454]/10 border-[#c76454]/25'
                        : 'bg-[#1a1719] border-[rgba(244,241,235,0.07)]'
                    }`}>
                      <div className="text-[10px] text-[#a89f97] font-sans">High / Crit</div>
                      <div className={`font-mono font-semibold text-xs ${highEventsCount > 0 ? 'text-[#c76454]' : 'text-[#6b6560]'}`}>
                        {highEventsCount}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </aside>

        {/* Dynamic Center Work Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden min-h-0 relative bg-[#121011]">
          {error && (
            <div className="mx-4 mt-3 p-2.5 bg-[#c76454]/10 border border-[#c76454]/25 rounded flex items-center justify-between text-xs text-[#c76454]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#c76454]" />
                <span className="font-medium">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-[#c76454] hover:text-[#f0ece4] p-1">
                <X size={13} />
              </button>
            </div>
          )}

          {!exam ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="ess-card p-8 max-w-md text-center border border-[rgba(244,241,235,0.08)]">
                <div className="w-12 h-12 mx-auto mb-4 rounded bg-[#221e20] border border-[rgba(244,241,235,0.12)] flex items-center justify-center text-[#f0ece4]">
                  <Shield size={24} strokeWidth={1.75} className="text-[#b8789a]" />
                </div>
                <h3 className="text-base font-bold text-[#f0ece4] tracking-tight mb-1.5 font-heading">Select Examination Hall</h3>
                <p className="text-[#a89f97] text-xs leading-relaxed mb-5 max-w-sm mx-auto font-sans">
                  Choose an active invigilation session from the sidebar or configure a new examination hall to activate surveillance.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="ess-btn-primary text-xs"
                  >
                    + Configure New Exam Hall
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
              {activeTab === 'monitor' && (
                <ExamMonitor
                  exam={exam}
                  participants={participants}
                  ws={ws}
                  connected={connected}
                  registerFrameHandler={registerFrameHandler}
                />
              )}
              {activeTab === 'roster' && (
                <RosterView
                  participants={participants}
                  exam={exam}
                  onCheckIn={handleCheckInParticipant}
                  onCheckOut={handleCheckOutParticipant}
                  onBatchCheckIn={handleBatchCheckIn}
                  onAddParticipant={handleAddParticipant}
                  onSeedCohort={handleSeedCohort}
                  onRefresh={() => exam && loadExam(exam.exam_id)}
                  loading={loading}
                />
              )}
              {activeTab === 'alerts' && (
                <AlertPanel
                  alerts={alerts && alerts.length > 0 ? alerts : events}
                  participants={participants}
                  onViewIncident={handleViewIncident}
                />
              )}
              {activeTab === 'analytics' && (
                <AnalyticsBoard analytics={analytics} exam={exam} />
              )}
              {activeTab === 'events' && (
                <EventTimeline events={events} examId={exam.exam_id} onViewIncident={handleViewIncident} />
              )}
              {activeTab === 'incidents' && (
                <IncidentViewer events={events} examId={exam.exam_id} selectedEventId={selectedIncidentId} />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateExamModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={createExam}
        />
      )}

      {showStaffModal && (
        <StaffManagementModal
          onClose={() => setShowStaffModal(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}

function AppRoot() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121011] flex items-center justify-center text-[#a89f97] text-xs">
        <div className="ess-spinner mr-2.5" />
        <span className="font-mono text-[#a89f97]">INITIALIZING SECURITY SESSION...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal isOpen={true} />;
  }

  return <SurveillanceDashboard />;
}

export default App;