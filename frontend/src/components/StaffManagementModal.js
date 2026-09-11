import React, { useState, useEffect } from 'react';
import { X, UserPlus, Users, Check } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

function StaffManagementModal({ onClose }) {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New user form state
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'PROCTOR',
    assigned_exam_id: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [uList, pList] = await Promise.all([
        api.auth.listUsers(),
        api.auth.listPendingActions()
      ]);
      setUsers(uList || []);
      setPendingActions(pList || []);
    } catch (err) {
      setError(err.message || 'Failed to load staff data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        assigned_exam_id: form.assigned_exam_id || null
      };
      await api.auth.createUser(payload);
      setForm({ username: '', email: '', password: '', role: 'PROCTOR', assigned_exam_id: '' });
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to register new staff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveAction = async (actionId, approved) => {
    try {
      await api.auth.approvePendingAction(actionId, approved);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to process pending action');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="ess-card relative w-full max-w-xl overflow-hidden border border-[rgba(255,255,255,0.1)] shadow-[var(--shadow-modal)] z-10 bg-[#1a1719]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.07)] bg-[#221e20]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[var(--accent-wash)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
              <Users size={14} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight font-heading">Staff Governance & RBAC</h2>
              <p className="text-[11px] text-slate-400">Manage surveillance operators, roles, and two-person sign-offs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#1a1719] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[rgba(255,255,255,0.07)] bg-[#121011] px-5">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-[var(--accent-primary)] text-[var(--accent-text)] font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Staff Directory ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-2 px-3 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'pending'
                ? 'border-[var(--accent-primary)] text-[var(--accent-text)] font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Pending Approvals</span>
            {pendingActions.filter(a => a.status === 'PENDING').length > 0 && (
              <span className="px-1.5 py-px rounded text-[10px] font-mono font-semibold bg-[#c2ab5c]/15 text-[#c2ab5c] border border-[#c2ab5c]/30">
                {pendingActions.filter(a => a.status === 'PENDING').length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-3.5 bg-[#1a1719]">
          {error && (
            <div className="p-2.5 text-xs text-[#c76454] border border-[#c76454]/25 rounded bg-[#c76454]/10">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2.5">
              <div className="ess-spinner" />
              <span className="text-xs text-slate-400 font-sans">Loading staff registry...</span>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-4">
              {/* Add User Form */}
              <form onSubmit={handleCreateUser} className="ess-card p-3.5 space-y-2.5 bg-[#221e20]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <UserPlus size={13} className="text-[var(--accent-text)]" />
                  <span>Register Authorized Operator</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="px-2.5 py-1.5 text-xs bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] font-sans"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Institutional Email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="px-2.5 py-1.5 text-xs bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] font-sans"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    required
                    placeholder="Password (min 6 chars)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="px-2.5 py-1.5 text-xs bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] font-sans"
                  />
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="px-2.5 py-1.5 text-xs bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-slate-200 focus:outline-none focus:border-[var(--border-focus)] font-sans cursor-pointer"
                  >
                    <option value="PROCTOR">Proctor (Hall Invigilator)</option>
                    <option value="AUDITOR">Auditor (Forensics & Review)</option>
                    <option value="ADMIN">Admin (Full System Governance)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="ess-btn-primary w-full py-1.5 disabled:opacity-50"
                >
                  {submitting ? 'Creating Account...' : 'Provision Staff Account'}
                </button>
              </form>

              {/* Users List */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-slate-400">
                  Active Operators Directory
                </div>
                <div className="divide-y divide-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] rounded overflow-hidden bg-[#0b0a0a]">
                  {users.map((u) => {
                    const roleBadge =
                      u.role === 'ADMIN'
                        ? 'bg-[var(--accent-wash)] text-[var(--accent-text)] border-[var(--accent-border)]'
                        : u.role === 'AUDITOR'
                        ? 'bg-[#221e20] text-slate-300 border-[rgba(255,255,255,0.08)]'
                        : 'bg-[#6ba883]/10 text-[#6ba883] border-[#6ba883]/25';
                    return (
                      <div key={u.user_id} className="flex items-center justify-between p-3 hover:bg-[#221e20]/60 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-100">{u.username}</span>
                            <span className={`px-1.5 py-px rounded text-[9px] font-mono uppercase font-semibold border ${roleBadge}`}>
                              {u.role}
                            </span>
                            {u.user_id === currentUser?.user_id && (
                              <span className="text-[10px] text-slate-500 font-mono">(Current)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{u.email}</div>
                        </div>
                        <div className="text-right text-[11px] font-mono text-slate-500">
                          {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Pending Approvals Tab */
            <div className="space-y-2.5">
              <div className="p-3 text-xs bg-[#c2ab5c]/10 border border-[#c2ab5c]/25 rounded text-[#c2ab5c] leading-relaxed">
                <strong>Two-Person Integrity Rule:</strong> High-stakes operations require independent concurrence from a secondary administrator.
              </div>

              {pendingActions.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 font-sans">
                  No pending actions in two-person queue.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingActions.map((action) => {
                    const isSelf = action.requested_by === currentUser?.user_id;
                    const isPending = action.status === 'PENDING';
                    return (
                      <div
                        key={action.id}
                        className="p-3 rounded border border-[rgba(255,255,255,0.08)] bg-[#0b0a0a] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-100">
                              {action.action_type}
                            </span>
                            <span
                              className={`px-1.5 py-px rounded text-[9px] font-mono uppercase font-semibold ${
                                action.status === 'PENDING'
                                   ? 'bg-[#c2ab5c]/15 text-[#c2ab5c] border border-[#c2ab5c]/30'
                                  : action.status === 'APPROVED'
                                  ? 'bg-[#6ba883]/15 text-[#6ba883] border border-[#6ba883]/30'
                                  : 'bg-[#c76454]/15 text-[#c76454] border border-[#c76454]/30'
                              }`}
                            >
                              {action.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                            Target: <span className="text-slate-200">{action.target_id}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Queued: {new Date(action.created_at).toLocaleString()}
                          </div>
                        </div>

                        {isPending && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSelf ? (
                              <span className="text-[11px] text-[#c2ab5c] italic font-mono">
                                Awaiting secondary signoff
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleApproveAction(action.id, true)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0b0a0a] bg-[#6ba883] hover:bg-[#5d9472] rounded transition-colors shadow-sm font-semibold"
                                >
                                  <Check size={12} />
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => handleApproveAction(action.id, false)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-[#221e20] hover:bg-[#2a2528] border border-[rgba(255,255,255,0.08)] rounded transition-colors"
                                >
                                  <X size={12} />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StaffManagementModal;
