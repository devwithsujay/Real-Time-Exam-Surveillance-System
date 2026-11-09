import React, { useState, useEffect } from 'react';
import { X, Clock, Users, MapPin, CalendarPlus, Camera, Sparkles } from 'lucide-react';
import api from '../services/api';

function CreateExamModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    exam_name: '',
    duration_minutes: 120,
    location: '',
    num_students: 30,
    num_cameras: 1,
    camera_source: '0',
    camera_resolution: '1920x1080'
  });
  const [cameras, setCameras] = useState([]);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadCameras = async () => {
      setLoadingCameras(true);
      try {
        const res = await api.cameras.list();
        if (res && res.cameras) {
          setCameras(res.cameras);
          // Pre-select 1080p webcam if detected
          const hdCam = res.cameras.find(c => c.is_1080p || c.max_resolution?.includes('1920'));
          if (hdCam) {
            setForm(prev => ({
              ...prev,
              camera_source: String(hdCam.source),
              camera_resolution: '1920x1080'
            }));
          } else if (res.active_source) {
            setForm(prev => ({ ...prev, camera_source: String(res.active_source) }));
          }
        }
      } catch (err) {
        console.warn('Could not load camera list:', err);
      } finally {
        setLoadingCameras(false);
      }
    };
    loadCameras();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const selectedCam = cameras.find(c => String(c.source) === String(form.camera_source));
      const payload = {
        exam_name: form.exam_name,
        duration_minutes: form.duration_minutes,
        location: form.location,
        num_students: form.num_students,
        num_cameras: form.num_cameras,
        settings: {
          assigned_camera_source: String(form.camera_source),
          assigned_camera_name: selectedCam?.name || `Webcam ${form.camera_source}`,
          assigned_camera_resolution: form.camera_resolution
        }
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      console.error('Failed to create exam:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all">
      <div className="w-full max-w-md bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-white border border-black/10 dark:border-white/15 shadow-2xl rounded-3xl overflow-hidden relative transition-all">
        {/* Apple Sheet Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10 bg-[#fbfbfd]/70 dark:bg-[#2c2c2e]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center">
              <CalendarPlus size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">New Exam Session</h2>
              <p className="text-[11px] text-[#86868b] dark:text-[#a1a1a6]">Set room, camera, and capacity parameters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Session Name</label>
            <input
              type="text"
              required
              value={form.exam_name}
              onChange={(e) => setForm({ ...form, exam_name: e.target.value })}
              className="w-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
              placeholder="e.g. CS204 Advanced Algorithms Final Evaluation"
            />
          </div>

          {/* Camera Selection Section */}
          <div className="p-3 bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#1d1d1f] dark:text-white flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#0071e3]" />
                <span>Assigned Physical Camera (USB / Built-in)</span>
              </label>
              <span className="text-[10px] text-[#0071e3] font-medium flex items-center gap-1">
                <Sparkles size={10} /> Auto-Switches on Start
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <select
                  value={form.camera_source}
                  disabled={loadingCameras}
                  onChange={(e) => setForm({ ...form, camera_source: e.target.value })}
                  className="w-full bg-white dark:bg-[#2c2c2e] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all cursor-pointer disabled:opacity-60"
                >
                  {loadingCameras ? (
                    <option value="0">Scanning webcams...</option>
                  ) : cameras.length === 0 ? (
                    <option value="0">Camera 0 (Default)</option>
                  ) : (
                    cameras.map((c) => (
                      <option key={c.source} value={c.source}>
                        {c.name} {c.is_1080p ? '★ 1080p' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <select
                  value={form.camera_resolution}
                  onChange={(e) => setForm({ ...form, camera_resolution: e.target.value })}
                  className="w-full bg-white dark:bg-[#2c2c2e] border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-2 text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all cursor-pointer font-mono"
                >
                  <option value="1920x1080">1080p FHD</option>
                  <option value="1280x720">720p HD</option>
                  <option value="640x480">480p SD</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Duration (Minutes)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" />
                <input
                  type="number"
                  required
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })}
                  className="w-full pl-9 pr-3 py-2.5 bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Candidate Seats</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" />
                <input
                  type="number"
                  required
                  min={1}
                  value={form.num_students}
                  onChange={(e) => setForm({ ...form, num_students: parseInt(e.target.value) || 10 })}
                  className="w-full pl-9 pr-3 py-2.5 bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Hall Location / Venue</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" />
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                placeholder="e.g. Hall 4B — Main Examination Complex"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-medium text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-full text-xs font-medium bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.98] text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateExamModal;