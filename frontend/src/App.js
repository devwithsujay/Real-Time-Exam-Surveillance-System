import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, AlertTriangle, Users, Activity, Bell, ChevronLeft,
  X, Play, Pause, Download, Shield, LogOut, Sun, Moon, Film,
  RotateCcw, Loader2
} from 'lucide-react';
import ExamMonitor from './components/ExamMonitor';
import AlertPanel from './components/AlertPanel';
import AnalyticsBoard from './components/AnalyticsBoard';
import EventTimeline from './components/EventTimeline';
import IncidentViewer from './components/IncidentViewer';
import RosterView from './components/RosterView';
import VideoAuditDesk from './components/VideoAuditDesk';
import CreateExamModal from './components/CreateExamModal';
import LoginModal from './components/LoginModal';
import StaffManagementModal from './components/StaffManagementModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { api } from './services/api';

const WS_BASE = process.env.REACT_APP_WS_URL || 'ws://127.0.0.1:8000/ws';

function SurveillanceDashboard() {
  const { user, token, logout, isAdmin, isProctor } = useAuth();
  const isAuditor = user?.role === 'AUDITOR' || isAdmin;

  const [exam, setExam] = useState(null);
  const examRef = useRef(exam);
  useEffect(() => {
    examRef.current = exam;
  }, [exam]);

  const [selectedExamId, setSelectedExamId] = useState(() => localStorage.getItem('active_exam_id') || '');
  const [isSwitching, setIsSwitching] = useState(false);
  const examCacheRef = useRef(new Map());
  const activeRequestRef = useRef(null);

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
  const [recordFullSession, setRecordFullSession] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const frameHandlersRef = useRef(new Set());

  // Unified Theme Hook
  const { isDark, toggleTheme } = useTheme();

  const handleViewIncident = (eventId) => {
    setSelectedIncidentId(eventId);
    setActiveTab('incidents');
  };

  // Fetch exams on mount and auto-restore active exam
  const fetchExams = useCallback(async () => {
    try {
      const data = await api.exams.list();
      setExamsList(data || []);
      if (data && data.length > 0) {
        const curExam = examRef.current;
        // 1. If proctor is scoped to specific exam, auto-select it
        if (isProctor && user?.assigned_exam_id) {
          const scoped = data.find(e => e.exam_id === user.assigned_exam_id);
          if (scoped && (!curExam || curExam.exam_id !== scoped.exam_id)) {
            loadExam(scoped.exam_id);
            return;
          }
        }

        // 2. Check for running or persisted exam on page refresh
        const activeRunningExam = data.find(e => e.status === 'IN_PROGRESS');
        const savedExamId = localStorage.getItem('active_exam_id');
        const savedExam = savedExamId ? data.find(e => e.exam_id === savedExamId) : null;

        const targetExam = activeRunningExam || savedExam || data[0];
        if (targetExam && (!curExam || curExam.exam_id !== targetExam.exam_id)) {
          setSelectedExamId(targetExam.exam_id);
          loadExam(targetExam.exam_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch exams:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProctor, user?.assigned_exam_id]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // WebSocket connection with JWT token (deduped by exam_id to prevent redundant reconnects)
  const activeExamId = exam?.exam_id;
  const isOptimistic = Boolean(exam?._optimistic);

  useEffect(() => {
    if (!activeExamId || isOptimistic) return;

    let websocket;
    let reconnectTimeout;
    let unmounted = false;

    const connect = () => {
      const authQuery = token ? `?token=${token}` : '?token=demo';
      websocket = new WebSocket(`${WS_BASE}/exam/${activeExamId}${authQuery}`);
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
              const updatedPayload = message.payload;
              setEvents(prev => {
                const idx = prev.findIndex(e => e.event_id === updatedPayload.event_id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...updatedPayload };
                  return next;
                }
                return [updatedPayload, ...prev.slice(0, 199)];
              });
              setAlerts(prev => {
                const idx = prev.findIndex(a =>
                  a.event_id === updatedPayload.event_id ||
                  (!a.event_id && a.track_id === updatedPayload.track_id)
                );
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...updatedPayload };
                  return next;
                }
                return [updatedPayload, ...prev.slice(0, 99)];
              });
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
  }, [activeExamId, isOptimistic, token]);

  const registerFrameHandler = useCallback((handler) => {
    frameHandlersRef.current.add(handler);
    return () => frameHandlersRef.current.delete(handler);
  }, []);

  const loadExam = async (examId, options = {}) => {
    if (!examId) return;
    const { bypassCache = false } = options;
    activeRequestRef.current = examId;
    setSelectedExamId(examId);
    setError(null);

    // 1. Instant SWR In-Memory Cache Hydration (0ms Switch)
    const cached = !bypassCache ? examCacheRef.current.get(examId) : null;
    const isCacheFresh = cached && (Date.now() - cached.timestamp < 60000);

    if (cached) {
      setExam(cached.exam);
      setParticipants(cached.participants || []);
      setEvents(cached.events || []);
      setAnalytics(cached.analytics || null);
      setPipelineRunning(cached.exam.status === 'IN_PROGRESS');
      localStorage.setItem('active_exam_id', examId);

      // Auto-switch assigned camera source if configured
      if (cached.exam.settings) {
        try {
          const st = typeof cached.exam.settings === 'string' ? JSON.parse(cached.exam.settings) : cached.exam.settings;
          if (st?.assigned_camera_source !== undefined) {
            api.cameras.switch({
              camera_source: String(st.assigned_camera_source),
              resolution: st.assigned_camera_resolution || '1920x1080'
            }).catch(e => console.debug('Auto-switch camera on cached exam select:', e));
          }
        } catch (e) {
          console.debug('Error parsing exam settings on load:', e);
        }
      }

      // If cache is fresh, render immediately and skip redundant re-fetching
      if (isCacheFresh) {
        setLoading(false);
        setIsSwitching(false);
        return;
      }
    }

    // 2. Optimistic Preview State from examsList
    if (!cached) {
      const preview = examsList.find(e => e.exam_id === examId);
      if (preview) {
        setExam(prev => (prev?.exam_id === examId ? prev : { ...preview, _optimistic: true }));
      }
    }

    setIsSwitching(true);
    if (!cached) setLoading(true);

    try {
      // Tier 1: Render-Critical Core Payload (Exam Meta + Participants)
      const [examData, participantsData] = await Promise.all([
        api.exams.get(examId),
        api.participants.list(examId, 1, 100)
      ]);

      if (activeRequestRef.current !== examId) return;

      if (examData) {
        localStorage.setItem('active_exam_id', examId);
        setExam(examData);
        setPipelineRunning(examData.status === 'IN_PROGRESS');

        if (examData.settings) {
          try {
            const st = typeof examData.settings === 'string' ? JSON.parse(examData.settings) : examData.settings;
            if (st?.assigned_camera_source !== undefined) {
              api.cameras.switch({
                camera_source: String(st.assigned_camera_source),
                resolution: st.assigned_camera_resolution || '1920x1080'
              }).catch(e => console.debug('Auto-switch camera on exam select:', e));
            }
          } catch (e) {
            console.debug('Error parsing exam settings on load:', e);
          }
        }
      }

      const cleanParticipants = participantsData?.participants || participantsData || [];
      setParticipants(cleanParticipants);

      // Release blocking screen state immediately: workspace is now active and usable
      setLoading(false);

      // Tier 2: Deferred Heavy Data (Events Timeline + Analytics)
      Promise.all([
        api.events.list(examId, { limit: 100 }),
        api.exams.getAnalytics(examId)
      ]).then(([eventsData, analyticsData]) => {
        if (activeRequestRef.current !== examId) return;

        const cleanEvents = eventsData?.events || eventsData || [];
        const cleanAnalytics = analyticsData || null;

        if (cleanEvents) setEvents(cleanEvents);
        if (cleanAnalytics) setAnalytics(cleanAnalytics);

        // Commit to in-memory SWR cache
        examCacheRef.current.set(examId, {
          exam: examData,
          participants: cleanParticipants,
          events: cleanEvents,
          analytics: cleanAnalytics,
          timestamp: Date.now()
        });
      }).catch(err => {
        console.debug('Deferred background events/analytics sync warning:', err);
      }).finally(() => {
        if (activeRequestRef.current === examId) {
          setIsSwitching(false);
        }
      });

    } catch (err) {
      if (activeRequestRef.current === examId) {
        setError(err.message || 'Failed to load exam data');
        console.error(err);
      }
    } finally {
      if (activeRequestRef.current === examId) {
        setLoading(false);
      }
    }
  };

  const createExam = async (examData) => {
    try {
      const data = await api.exams.create(examData);
      if (data) {
        examCacheRef.current.delete(data.exam_id);
        await fetchExams();
        await loadExam(data.exam_id, { bypassCache: true });
      }
    } catch (err) {
      setError(err.message || 'Failed to create exam');
    }
  };

  const startExam = async () => {
    if (!exam) return;
    try {
      const data = await api.exams.start(exam.exam_id, recordFullSession);
      if (data) {
        examCacheRef.current.delete(exam.exam_id);
        setExam(prev => ({ ...prev, status: data.status, started_at: data.started_at, _optimistic: false }));
        setPipelineRunning(true);
        fetchExams();
      }
    } catch (err) {
      setError(err.message || 'Failed to start exam');
    }
  };

  const handleReanalyzeExam = async () => {
    const target = exam || displayExam;
    if (!target || !target.exam_id) return;
    setReanalyzing(true);
    try {
      const res = await api.exams.reanalyze(target.exam_id, { sample_fps: 2, enable_vlm: true });
      if (res && res.audit_id) {
        alert(`Forensic re-analysis launched for "${target.exam_name}"!\nCheck the Video Audits tab to track progress.`);
        setActiveTab('audit');
      }
    } catch (err) {
      alert(`Failed to launch re-analysis: ${err.message}`);
    } finally {
      setReanalyzing(false);
    }
  };

  const endExam = async () => {
    if (!exam) return;
    try {
      const data = await api.exams.end(exam.exam_id);
      if (data) {
        examCacheRef.current.delete(exam.exam_id);
        setExam(prev => ({
          ...prev,
          status: data.status,
          ended_at: data.ended_at,
          recording_path: data.recording_path || prev.recording_path,
          _optimistic: false
        }));
        setPipelineRunning(false);
        fetchExams();
      }
    } catch (err) {
      setError(err.message || 'Failed to end exam');
    }
  };

  const downloadReport = async () => {
    const target = exam || displayExam;
    if (!target || !target.exam_id) return;
    try {
      const blob = await api.exams.downloadReport(target.exam_id);
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      const safeName = (target.exam_name || 'exam').replace(/[^a-zA-Z0-9_-]/g, '_');
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `exam_report_${safeName}_${target.exam_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 3000);
    } catch (err) {
      if (target?.exam_id) {
        window.location.href = `/api/exams/${target.exam_id}/report?format=pdf`;
      }
    }
  };

  const handleCheckInParticipant = async (participantId) => {
    try {
      await api.participants.checkIn(participantId);
      if (exam) {
        examCacheRef.current.delete(exam.exam_id);
        await loadExam(exam.exam_id, { bypassCache: true });
      }
    } catch (err) {
      console.error('Check-in failed:', err);
    }
  };

  const handleCheckOutParticipant = async (participantId) => {
    try {
      await api.participants.checkOut(participantId);
      if (exam) {
        examCacheRef.current.delete(exam.exam_id);
        await loadExam(exam.exam_id, { bypassCache: true });
      }
    } catch (err) {
      console.error('Check-out failed:', err);
    }
  };

  const handleBatchCheckIn = async () => {
    if (!exam) return;
    try {
      await api.participants.batchCheckIn(exam.exam_id);
      examCacheRef.current.delete(exam.exam_id);
      await loadExam(exam.exam_id, { bypassCache: true });
    } catch (err) {
      console.error('Batch check-in failed:', err);
    }
  };

  const handleAddParticipant = async (participantData) => {
    if (!exam) return;
    try {
      await api.participants.create(exam.exam_id, participantData);
      examCacheRef.current.delete(exam.exam_id);
      await loadExam(exam.exam_id, { bypassCache: true });
    } catch (err) {
      console.error('Failed to add participant:', err);
      throw err;
    }
  };

  const handleSeedCohort = async (count) => {
    if (!exam) return;
    try {
      await api.participants.seedCohort(exam.exam_id, count);
      examCacheRef.current.delete(exam.exam_id);
      await loadExam(exam.exam_id, { bypassCache: true });
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
    { id: 'incidents', label: 'Forensic Dossier', icon: Shield },
    ...(isAuditor ? [{ id: 'videoAudit', label: 'Video Forensic Audit', icon: Film }] : [])
  ];

  const displayExam = exam || (selectedExamId ? examsList.find(e => e.exam_id === selectedExamId) : null);

  const roleBadgeStyle = user?.role === 'ADMIN'
    ? 'bg-[#0071e3]/15 text-[#0071e3] dark:text-[#0a84ff] border-[#0071e3]/30'
    : user?.role === 'AUDITOR'
    ? 'bg-[#86868b]/15 text-[#86868b] dark:text-[#8e8e93] border-[#86868b]/30'
    : 'bg-[#34c759]/15 text-[#34c759] dark:text-[#30d158] border-[#34c759]/30';

  return (
    <div className="h-screen max-h-screen bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] flex flex-col font-sans selection:bg-[#0071e3]/20 overflow-hidden transition-colors duration-200">
      {/* Top macOS Unified Toolbar (Frosted Translucent Bar) */}
      <header className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/[0.08] sticky top-0 z-40 relative">
        {(loading || isSwitching) && (
          <div className="apple-hairline-progress">
            <div className="apple-hairline-progress-bar" />
          </div>
        )}
        <div className="flex items-center justify-between h-[52px] px-3 sm:px-5 gap-2 min-w-0">
          {/* Left: macOS Traffic Lights + Brand & Mobile Sidebar Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
            {/* Native macOS Window Controls (Traffic Lights) */}
            <div className="hidden lg:flex items-center gap-2 mr-1">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/40 shadow-xs inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/40 shadow-xs inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/40 shadow-xs inline-block" />
            </div>

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Toggle sidebar"
              title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`} />
            </button>
            
            {/* Wordmark: ARGUS. with Apple blue dot */}
            <div className="flex items-baseline gap-1.5 flex-shrink-0">
              <span className="font-brand font-bold text-[#1d1d1f] dark:text-white text-[16px] sm:text-[17px] tracking-wide leading-none select-none">
                ARGUS<span className="text-[#0071e3]">.</span>
              </span>
              <span className="hidden xl:inline-block text-xs italic text-[#86868b] font-normal">
                Never blinks.
              </span>
            </div>

            {/* Breadcrumb / Current Exam Session (Visible only on large desktop screens to avoid clashing) */}
            {displayExam && (
              <div className="hidden 2xl:flex items-center gap-2 pl-3.5 border-l border-black/[0.08] dark:border-white/[0.08] text-xs">
                <span className="text-[#86868b] text-[11px]">Session:</span>
                <span className="font-medium text-[#1d1d1f] dark:text-white max-w-[160px] truncate">{displayExam.exam_name}</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                  displayExam.status === 'IN_PROGRESS'
                    ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25 font-semibold'
                    : 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent'
                }`}>
                  {displayExam.status.replace('_', ' ')}
                </span>
                {isSwitching && (
                  <Loader2 size={11} className="text-[#0071e3] animate-spin ml-0.5" />
                )}
              </div>
            )}
          </div>

          {/* Right: Telemetry Badges & Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* Live Stream Status Pill */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium transition-colors ${
              connected 
                ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25'
                : 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-[#34c759] breathe-dot' : 'bg-[#86868b]'}`} />
              <span className="hidden md:inline font-sans">{connected ? 'Live Feed' : 'Offline'}</span>
            </div>

            {/* AI Engine Status Pill (Compact on split screens, labeled on full desktop) */}
            <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium transition-colors ${
              pipelineRunning
                ? 'bg-[#0071e3]/10 text-[#0071e3] dark:text-[#0a84ff] border-[#0071e3]/25'
                : 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pipelineRunning ? 'bg-[#0071e3] breathe-dot' : 'bg-[#86868b]'}`} />
              <span className="font-sans">{pipelineRunning ? 'AI Active' : 'AI Standby'}</span>
            </div>

            {/* Staff & RBAC (Admin) */}
            {isAdmin && (
              <button
                onClick={() => setShowStaffModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1d1d1f] dark:text-white bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 rounded-full transition-colors cursor-pointer"
                title="Manage Staff and Role Assignments"
              >
                <Users size={13} />
                <span className="hidden xl:inline">Staff</span>
              </button>
            )}

            {/* Dark Mode Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Appearance' : 'Switch to Dark Appearance'}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-colors cursor-pointer"
              aria-label="Toggle appearance"
            >
              {isDark ? <Sun size={13} className="text-amber-400 pointer-events-none" /> : <Moon size={13} className="text-[#0071e3] pointer-events-none" />}
            </button>

            <div className="w-px h-4 bg-black/[0.08] dark:border-white/[0.08]" />

            {/* User Profile Capsule */}
            <div className="flex items-center gap-1.5 pl-0.5">
              <div className="w-7 h-7 rounded-full bg-[#0071e3] flex items-center justify-center text-xs font-semibold text-white shadow-xs">
                {user?.username?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="hidden xl:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium text-[#1d1d1f] dark:text-white">{user?.username}</span>
                <span className={`mt-0.5 text-[9px] font-mono px-1.5 py-px rounded-full border uppercase tracking-wider font-semibold ${roleBadgeStyle}`}>
                  {user?.role}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="p-1.5 text-[#86868b] hover:text-[#ff3b30] hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Mobile Backdrop Scrim (Closes drawer on tap outside) */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/25 dark:bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
            aria-label="Close sidebar overlay"
          />
        )}

        {/* Apple macOS Translucent Frosted Sidebar */}
        <aside
          className={`
            fixed md:static inset-y-0 left-0 z-40 md:z-auto
            h-full flex-shrink-0
            bg-[#fbfbfd]/95 dark:bg-[#1c1c1e]/95 md:bg-[#fbfbfd]/90 md:dark:bg-[#1c1c1e]/90
            backdrop-blur-2xl border-r border-black/[0.08] dark:border-white/[0.08]
            transition-all duration-200 ease-in-out flex flex-col min-h-0 overflow-hidden
            ${sidebarOpen 
              ? 'w-64 translate-x-0' 
              : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0'
            }
          `}
        >
          {/* Exam Selector */}
          <div className="px-4 pt-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">
                  {isProctor && user?.assigned_exam_id ? 'Assigned Hall' : 'Exam Session'}
                </label>
                {examsList.length > 0 && (
                  <span className="text-xs font-mono font-medium text-[#86868b] bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full">
                    {examsList.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Close sidebar"
              >
                <X size={14} />
              </button>
            </div>

            <div className="relative">
              <select
                value={selectedExamId || exam?.exam_id || ''}
                disabled={isProctor && Boolean(user?.assigned_exam_id)}
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (nextId) {
                    setSelectedExamId(nextId);
                    loadExam(nextId);
                  }
                }}
                className="w-full bg-[#f5f5f7] dark:bg-[#2c2c2e] border border-transparent focus:border-[#0071e3] rounded-xl pl-3 pr-8 py-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all cursor-pointer"
              >
                <option value="">Select session...</option>
                {examsList.map((e) => (
                  <option key={e.exam_id} value={e.exam_id}>
                    {e.exam_name} ({e.status})
                  </option>
                ))}
              </select>
              {(loading || isSwitching) && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Loader2 size={12} className="text-[#0071e3] animate-spin" />
                </div>
              )}
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full mt-2.5 ess-btn-primary text-xs py-2 rounded-xl font-medium"
              >
                <span>+ New Exam Session</span>
              </button>
            )}
          </div>

          {/* Exam Lifecycle Controls */}
          {displayExam && (
            <div className="px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06] space-y-2 bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">Status</span>
                <span className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                  displayExam.status === 'IN_PROGRESS'
                    ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/30'
                    : 'bg-black/5 dark:bg-white/10 text-[#86868b] border-transparent'
                }`}>
                  {displayExam.status.replace('_', ' ')}
                </span>
              </div>

              {isAdmin ? (
                <>
                  {displayExam.status === 'CREATED' && (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[#1d1d1f] dark:text-white/90 bg-black/[0.04] dark:bg-white/[0.04] p-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
                        <input
                          type="checkbox"
                          checked={recordFullSession}
                          onChange={(e) => setRecordFullSession(e.target.checked)}
                          className="rounded text-[#0071e3] focus:ring-0 cursor-pointer w-3.5 h-3.5"
                        />
                        <span className="select-none font-medium">Record Full Session Video</span>
                      </label>
                      <button
                        onClick={startExam}
                        disabled={loading || Boolean(displayExam._optimistic)}
                        className="w-full ess-btn-success text-xs py-2 rounded-xl font-medium disabled:opacity-50"
                      >
                        <Play size={12} className="fill-white" /> Start Session
                      </button>
                    </>
                  )}
                  {displayExam.status === 'IN_PROGRESS' && (
                    <button
                      onClick={endExam}
                      disabled={loading || Boolean(displayExam._optimistic)}
                      className="w-full ess-btn-danger text-xs py-2 rounded-xl font-medium disabled:opacity-50"
                    >
                      <Pause size={12} className="fill-white" /> End Session
                    </button>
                  )}
                </>
              ) : (
                <div className="py-2 text-center text-xs bg-black/5 dark:bg-white/5 rounded-xl text-[#86868b] font-medium">
                  {displayExam.status === 'IN_PROGRESS' ? 'Surveillance Active' : 'Session on Standby'}
                </div>
              )}

              <button
                onClick={downloadReport}
                className="w-full ess-btn-secondary text-xs py-2 rounded-xl font-medium"
              >
                <Download size={12} className="text-[#86868b]" /> Export Report
              </button>

              {displayExam?.recording_path && (
                <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
                  <a
                    href={`/api/exams/${displayExam.exam_id}/recording?download=true`}
                    download
                    className="w-full ess-btn-secondary text-xs py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 text-[#0071e3]"
                    title="Download full continuous session video recording (H.264 MP4)"
                  >
                    <Download size={12} />
                    <span>Full Video Recording</span>
                  </a>

                  {isAdmin && (
                    <button
                      onClick={handleReanalyzeExam}
                      disabled={reanalyzing}
                      className="w-full ess-btn-primary text-xs py-2 rounded-xl font-medium flex items-center justify-center gap-1.5"
                      title="Re-analyze the entire recorded video using forensic AI"
                    >
                      {reanalyzing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      <span>{reanalyzing ? 'Starting Audit...' : 'Re-Analyze Whole Exam'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation Tabs with Apple Highlight Pills */}
          <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto py-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0071e3] text-white shadow-xs font-semibold'
                      : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-white' : 'text-[#86868b]'} />
                    <span className="text-[13px]">{tab.label}</span>
                  </div>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold min-w-[20px] text-center ${
                      isActive 
                        ? 'bg-white/25 text-white' 
                        : 'bg-black/5 dark:bg-white/10 text-[#86868b]'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Live Telemetry Sidebar Footer (Apple Activity Widget) */}
          {exam && (() => {
            const summary = analytics?.summary || analytics || {};
            const totalEnrolled = Math.max(summary.total_students || 0, exam?.num_students || 0, participants.length);
            const actualCheckedIn = participants.filter(p => p.status === 'CHECKED_IN').length;
            const checkedIn = Math.max(summary.checked_in || 0, actualCheckedIn);
            const attendancePercent = totalEnrolled > 0 ? Math.min(100, Math.round((checkedIn / totalEnrolled) * 100)) : 0;
            const totalEventsCount = summary.total_events ?? events.length;
            const highEventsCount = summary.high_severity_events ?? events.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length;

            return (
              <div className="px-4 py-3.5 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">Attendance</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] breathe-dot" />
                    <span className="text-[11px] text-[#34c759] font-medium font-sans">Live</span>
                  </div>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-medium">
                      <span className="text-[#86868b]">Verified In-Hall</span>
                      <span className="font-mono text-[#1d1d1f] dark:text-white font-semibold">
                        {checkedIn}<span className="text-[#86868b]">/{totalEnrolled}</span>
                      </span>
                    </div>
                    <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#34c759] h-full rounded-full transition-all duration-300"
                        style={{ width: `${attendancePercent}%` }}
                      />
                    </div>
                    <div className="text-right text-[11px] text-[#86868b] mt-1 font-medium">{attendancePercent}% present</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div className="bg-white dark:bg-[#2c2c2e] border border-black/[0.06] dark:border-white/[0.06] rounded-xl px-2.5 py-1.5 shadow-xs">
                      <div className="text-[10px] text-[#86868b] uppercase font-semibold">Total Flags</div>
                      <div className="font-semibold text-[#1d1d1f] dark:text-white text-sm">{totalEventsCount}</div>
                    </div>
                    <div className={`border rounded-xl px-2.5 py-1.5 shadow-xs ${
                      highEventsCount > 0
                        ? 'bg-[#ff3b30]/10 border-[#ff3b30]/25'
                        : 'bg-white dark:bg-[#2c2c2e] border-black/[0.06] dark:border-white/[0.06]'
                    }`}>
                      <div className="text-[10px] text-[#86868b] uppercase font-semibold">Attention</div>
                      <div className={`font-semibold text-sm ${highEventsCount > 0 ? 'text-[#ff3b30]' : 'text-[#86868b]'}`}>
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
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden min-h-0 relative bg-[#f5f5f7] dark:bg-[#000000]">
          {error && (
            <div className="mx-4 mt-3 p-2.5 bg-[#c0392b]/10 border border-[#c0392b]/25 rounded-md flex items-center justify-between text-xs text-[#c0392b] ess-error-shake">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#c0392b]" />
                <span className="font-medium">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-[#c0392b] hover:text-[#17233a] p-1">
                <X size={13} />
              </button>
            </div>
          )}

          {activeTab === 'videoAudit' ? (
            <VideoAuditDesk user={user} exam={exam} />
          ) : !exam ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-8 sm:p-10 max-w-md text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_16px_40px_rgb(0,0,0,0.4)]">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#0071e3]/10 dark:bg-[#0071e3]/20 flex items-center justify-center text-[#0071e3]">
                  <Camera size={26} strokeWidth={2} />
                </div>
                <h3 className="text-xl font-semibold text-[#1d1d1f] dark:text-white tracking-tight mb-2">
                  Select an Exam Session
                </h3>
                <p className="text-[#86868b] text-xs leading-relaxed mb-6 max-w-sm mx-auto">
                  Choose an active examination session from the sidebar or configure a new hall to start live video surveillance.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="ess-btn-primary text-xs py-2.5 px-5 rounded-2xl mx-auto font-medium shadow-sm cursor-pointer"
                  >
                    + Configure Exam Session
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
                  onExamUpdate={(updated) => {
                    if (updated?.exam_id) examCacheRef.current.delete(updated.exam_id);
                    setExam(updated);
                    fetchExams();
                  }}
                  onNavigateTab={setActiveTab}
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
                  onRefresh={() => exam && loadExam(exam.exam_id, { bypassCache: true })}
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
    <ThemeProvider>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppRoot() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#000000] flex items-center justify-center text-[#86868b] dark:text-[#a1a1a6] text-xs">
        <div className="ess-spinner mr-2.5" />
        <span className="font-mono text-[#1d1d1f] dark:text-white font-medium tracking-wider text-[11px]">INITIALIZING SECURITY SESSION...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal isOpen={true} />;
  }

  return <SurveillanceDashboard />;
}

export default App;