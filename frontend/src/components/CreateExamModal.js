import React, { useState } from 'react';
import { X, Clock, Users, MapPin, Shield } from 'lucide-react';

function CreateExamModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    exam_name: '',
    duration_minutes: 120,
    location: '',
    num_students: 30,
    num_cameras: 1,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      console.error('Failed to create exam:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="ess-card w-full max-w-md shadow-[var(--shadow-modal)] overflow-hidden relative border border-[rgba(255,255,255,0.1)]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.07)] bg-[#221e20]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[var(--accent-wash)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
              <Shield size={14} />
            </div>
            <h2 className="text-sm font-semibold text-white tracking-tight font-heading">Configure New Exam Session</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#1a1719] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 bg-[#1a1719]">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Exam Session Title</label>
            <input
              type="text"
              required
              value={form.exam_name}
              onChange={(e) => setForm({ ...form, exam_name: e.target.value })}
              className="w-full bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans"
              placeholder="e.g. CS204 Advanced Algorithms Physical Exam"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Duration (Minutes)</label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="number"
                  required
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-xs text-slate-100 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Desk Capacity</label>
              <div className="relative">
                <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="number"
                  required
                  min={1}
                  value={form.num_students}
                  onChange={(e) => setForm({ ...form, num_students: parseInt(e.target.value) || 10 })}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-xs text-slate-100 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Hall Location / Venue</label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full pl-8 pr-2.5 py-1.5 bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans"
                placeholder="e.g. Hall 4B - Main Science Block"
              />
            </div>
          </div>

          <div className="flex gap-2.5 pt-3 border-t border-[rgba(255,255,255,0.07)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 ess-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 ess-btn-primary disabled:opacity-50"
            >
              {submitting ? 'Initializing...' : 'Initialize Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateExamModal;