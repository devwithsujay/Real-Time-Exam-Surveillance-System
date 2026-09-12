import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, ShieldCheck } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-md transition-all">
      <div className="relative w-full max-w-xl overflow-hidden border border-black/10 dark:border-white/15 shadow-2xl z-10 bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-white rounded-3xl transition-all">
        {/* Apple Sheet Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10 bg-[#fbfbfd]/70 dark:bg-[#2c2c2e]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Staff Governance & Access</h2>
              <p className="text-[11px] text-[#86868b] dark:text-[#a1a1a6]">Proctor authorization and dual-signoff queue</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Apple Segmented Control */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex p-1 bg-black/5 dark:bg-white/10 rounded-full max-w-sm">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex-1 py-1.5 px-3 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-white shadow-xs'
                  : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-white'
              }`}
            >
              Staff Directory ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-1.5 px-3 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-white shadow-xs'
                  : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-white'
              }`}
            >
              <span>Pending</span>
              {pendingActions.filter(a => a.status === 'PENDING').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-[#ff9500]/15 text-[#ff9500]">
                  {pendingActions.filter(a => a.status === 'PENDING').length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[65vh] overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 text-xs text-[#ff3b30] border border-[#ff3b30]/20 rounded-2xl bg-[#ff3b30]/10 font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5">
              <div className="w-6 h-6 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[#86868b] dark:text-[#a1a1a6]">Loading staff registry...</span>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-5">
              {/* Add User Form */}
              <form onSubmit={handleCreateUser} className="p-4 rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1d1d1f] dark:text-white">
                  <UserPlus size={14} className="text-[#0071e3]" />
                  <span>Register Proctor or Administrator</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="px-3.5 py-2 text-xs bg-white dark:bg-[#2c2c2e] border border-black/10 dark:border-white/10 rounded-xl text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Institutional Email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="px-3.5 py-2 text-xs bg-white dark:bg-[#2c2c2e] border border-black/10 dark:border-white/10 rounded-xl text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    required
                    placeholder="Password (min 6 chars)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="px-3.5 py-2 text-xs bg-white dark:bg-[#2c2c2e] border border-black/10 dark:border-white/10 rounded-xl text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                  />
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="px-3.5 py-2 text-xs bg-white dark:bg-[#2c2c2e] border border-black/10 dark:border-white/10 rounded-xl text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 cursor-pointer transition-all"
                  >
                    <option value="PROCTOR">Proctor (Hall Invigilator)</option>
                    <option value="AUDITOR">Auditor (Forensics & Review)</option>
                    <option value="ADMIN">Admin (Full System Governance)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-full text-xs font-medium bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.99] text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Creating Account...' : 'Provision Staff Account'}
                </button>
              </form>

              {/* Users List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#86868b] dark:text-[#a1a1a6]">
                  Active Personnel
                </div>
                <div className="divide-y divide-black/5 dark:divide-white/5 border border-black/5 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#2c2c2e] shadow-xs">
                  {users.map((u) => {
                    const roleBadge =
                      u.role === 'ADMIN'
                        ? 'bg-[#0071e3]/10 text-[#0071e3]'
                        : u.role === 'AUDITOR'
                        ? 'bg-[#af52de]/10 text-[#af52de]'
                        : 'bg-[#34c759]/10 text-[#34c759]';
                    return (
                      <div key={u.user_id} className="flex items-center justify-between p-3.5 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">{u.username}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${roleBadge}`}>
                              {u.role}
                            </span>
                            {u.user_id === currentUser?.user_id && (
                              <span className="text-[10px] text-[#0071e3] font-medium">(You)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#86868b] dark:text-[#a1a1a6] mt-0.5">{u.email}</div>
                        </div>
                        <div className="text-right text-[11px] text-[#86868b] dark:text-[#a1a1a6]">
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
            <div className="space-y-3">
              <div className="p-3 text-xs bg-[#ff9500]/10 border border-[#ff9500]/20 rounded-2xl text-[#ff9500] leading-relaxed">
                <strong>Two-Person Integrity Rule:</strong> High-stakes actions require independent concurrence from a secondary administrator.
              </div>

              {pendingActions.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#86868b] dark:text-[#a1a1a6]">
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
                        className="p-3.5 rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#2c2c2e] flex items-center justify-between gap-3 shadow-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                              {action.action_type}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                action.status === 'PENDING'
                                  ? 'bg-[#ff9500]/15 text-[#ff9500]'
                                  : action.status === 'APPROVED'
                                  ? 'bg-[#34c759]/15 text-[#34c759]'
                                  : 'bg-[#ff3b30]/15 text-[#ff3b30]'
                              }`}
                            >
                              {action.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#86868b] dark:text-[#a1a1a6] mt-1">
                            Target: <span className="text-[#1d1d1f] dark:text-white font-medium">{action.target_id}</span>
                          </div>
                          <div className="text-[10px] text-[#86868b] mt-0.5">
                            Queued: {new Date(action.created_at).toLocaleString()}
                          </div>
                        </div>

                        {isPending && (
                          <div className="flex items-center gap-2 shrink-0">
                            {isSelf ? (
                              <span className="text-[11px] text-[#ff9500] italic">
                                Awaiting secondary signoff
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleApproveAction(action.id, true)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-[#34c759] hover:bg-[#30d158] text-white transition-all cursor-pointer shadow-xs"
                                >
                                  <Check size={12} />
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => handleApproveAction(action.id, false)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] text-[#86868b] transition-all cursor-pointer"
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
