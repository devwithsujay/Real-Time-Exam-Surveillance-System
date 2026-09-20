/**
 * Centralized API Service for Real-Time Exam Surveillance System.
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // Attach JWT Bearer token if stored
  const token = localStorage.getItem('ess_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  const response = await fetch(url, config);
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('ess_token');
      localStorage.removeItem('ess_user');
      window.dispatchEvent(new Event('ess-unauthorized'));
    }
    const errorBody = await response.text();
    throw new Error(`API Error ${response.status} (${response.statusText}): ${errorBody}`);
  }

  // Return raw blob if requested (e.g. PDF reports)
  if (options.asBlob) {
    const b = await response.blob();
    const contentType = response.headers.get('content-type') || 'application/pdf';
    return new Blob([b], { type: contentType });
  }

  return response.json();
}

export const api = {
  // Authentication & Staff Access Control
  auth: {
    login: async (username, password) => {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (data && data.access_token) {
        localStorage.setItem('ess_token', data.access_token);
        localStorage.setItem('ess_user', JSON.stringify(data.user));
      }
      return data;
    },
    me: () => request('/api/auth/me'),
    logout: () => {
      localStorage.removeItem('ess_token');
      localStorage.removeItem('ess_user');
      window.dispatchEvent(new Event('ess-unauthorized'));
    },
    getCurrentUser: () => {
      const u = localStorage.getItem('ess_user');
      try {
        return u ? JSON.parse(u) : null;
      } catch {
        return null;
      }
    },
    getToken: () => localStorage.getItem('ess_token'),
    listUsers: () => request('/api/auth/users'),
    createUser: (data) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(data) }),
    listPendingActions: () => request('/api/auth/pending-actions'),
    approvePendingAction: (actionId, approved) =>
      request(`/api/auth/pending-actions/${actionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approved })
      }),
  },

  // Exams
  exams: {
    list: (page = 1, limit = 50) => request(`/api/exams?page=${page}&limit=${limit}`),
    get: (examId) => request(`/api/exams/${examId}`),
    create: (data) => request('/api/exams', { method: 'POST', body: JSON.stringify(data) }),
    update: (examId, data) => request(`/api/exams/${examId}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (examId) => request(`/api/exams/${examId}`, { method: 'DELETE' }),
    start: (examId) => request(`/api/exams/${examId}/start`, { method: 'POST' }),
    end: (examId) => request(`/api/exams/${examId}/end`, { method: 'POST' }),
    downloadReport: (examId, format = 'pdf') => request(`/api/exams/${examId}/report?format=${format}`, { asBlob: true }),
    getAnalytics: (examId) => request(`/api/exams/${examId}/analytics`),
  },

  // Participants
  participants: {
    list: (examId, page = 1, limit = 100) =>
      request(`/api/exams/${examId}/participants?page=${page}&limit=${limit}`),
    get: (participantId) => request(`/api/participants/${participantId}`),
    create: (examId, data) =>
      request(`/api/exams/${examId}/participants`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    seedCohort: (examId, count) =>
      request(`/api/exams/${examId}/participants/seed`, {
        method: 'POST',
        body: JSON.stringify({ count })
      }),
    checkIn: (participantId, trackId) =>
      request(`/api/participants/${participantId}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ current_track_id: trackId })
      }),
    checkOut: (participantId) =>
      request(`/api/participants/${participantId}/checkout`, { method: 'POST' }),
    batchCheckIn: (examId) =>
      request(`/api/exams/${examId}/participants/batch-checkin`, { method: 'POST' }),
    getAnalytics: (participantId) => request(`/api/participants/${participantId}/analytics`),
  },

  // Events & Violations
  events: {
    list: (examId, params = {}) => {
      const query = new URLSearchParams({ limit: 100, ...params });
      return request(`/api/exams/${examId}/events?${query.toString()}`);
    },
    get: (eventId) => request(`/api/events/${eventId}`),
    review: (eventId, data) =>
      request(`/api/events/${eventId}/review`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    clipUrl: (eventId) => `${API_BASE}/api/events/${eventId}/clip`,
    screenshotUrl: (eventId) => `${API_BASE}/api/events/${eventId}/screenshot`,
  },

  // Runtime Configuration
  config: {
    get: () => request('/api/config'),
    update: (data) => request('/api/config', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Health & System
  system: {
    health: () => request('/health'),
    cameras: () => request('/health/cameras'),
  },

  // Video Forensic Audit (Phase 6)
  videoAudit: {
    list: () => request('/api/v1/video-audit'),
    get: (auditId) => request(`/api/v1/video-audit/${auditId}`),
    upload: async (formData) => {
      const token = localStorage.getItem('ess_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/v1/video-audit/upload`, {
        method: 'POST',
        headers,
        body: formData
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Upload failed (${res.status}): ${err}`);
      }
      return res.json();
    },
    delete: (auditId) => request(`/api/v1/video-audit/${auditId}`, { method: 'DELETE' }),
    streamUrl: (auditId) => `${API_BASE}/api/v1/video-audit/${auditId}/stream`,
    snapshotUrl: (auditId, filename) => `${API_BASE}/api/v1/video-audit/${auditId}/snapshots/${filename}`,
    downloadReport: (auditId) => request(`/api/v1/video-audit/${auditId}/report`, { asBlob: true }),
    verifyIncidentVLM: (auditId, incidentId) => request(`/api/v1/video-audit/${auditId}/incidents/${incidentId}/vlm-verify`, { method: 'POST' }),
    verifyAllVLM: (auditId) => request(`/api/v1/video-audit/${auditId}/vlm-verify-all`, { method: 'POST' }),
  }
};

export default api;

