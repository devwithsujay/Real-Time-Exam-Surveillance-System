import React, { useState } from 'react';
import { Shield, Lock, User, AlertCircle, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@12345');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (user, pass) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
    setLoading(true);
    try {
      await login(user, pass);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="ess-card relative w-full max-w-sm overflow-hidden border border-[rgba(255,255,255,0.1)] shadow-[var(--shadow-modal)] z-10 bg-[#1a1719]">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-white rounded hover:bg-[#221e20] transition-colors z-20"
          >
            <X size={15} />
          </button>
        )}

        {/* Clean Header */}
        <div className="p-5 text-center border-b border-[rgba(255,255,255,0.07)] bg-[#221e20]">
          <div className="inline-flex items-center justify-center w-10 h-10 mb-2.5 rounded bg-[var(--accent-wash)] border border-[var(--accent-border)] text-[var(--accent-text)]">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-white tracking-tight font-heading">
            ARGUS Registrar Console
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Institutional authentication and operator access gateway
          </p>
        </div>

        <div className="p-5 space-y-3.5 bg-[#1a1719]">
          {error && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-[#c76454] border border-[#c76454]/25 rounded bg-[#c76454]/10">
              <AlertCircle size={14} className="shrink-0 text-[#c76454]" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block mb-1 text-xs font-medium text-slate-300">
                Operator Username
              </label>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username (e.g. admin)"
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium text-slate-300">
                Security Password
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter security password"
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="ess-btn-primary w-full py-2 mt-1.5 disabled:opacity-50"
            >
              {loading ? (
                <span>Validating Credentials...</span>
              ) : (
                <>
                  <span>Authenticate Operator</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </form>

          {/* Quick Login Profiles */}
          <div className="pt-3 border-t border-[rgba(255,255,255,0.07)]">
            <div className="mb-2 text-center">
              <span className="text-[11px] text-slate-400 font-medium">
                Quick demo profiles
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'Admin@12345')}
                className="flex flex-col items-center p-2 text-left border border-[rgba(255,255,255,0.08)] hover:border-[var(--accent-border)] bg-[#221e20] hover:bg-[#2a2528] rounded transition-colors group"
              >
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Admin
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Superuser</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('auditor1', 'Auditor@12345')}
                className="flex flex-col items-center p-2 text-left border border-[rgba(255,255,255,0.08)] hover:border-[var(--accent-border)] bg-[#221e20] hover:bg-[#2a2528] rounded transition-colors group"
              >
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Auditor
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Forensics</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('proctor1', 'Proctor@12345')}
                className="flex flex-col items-center p-2 text-left border border-[rgba(255,255,255,0.08)] hover:border-[var(--accent-border)] bg-[#221e20] hover:bg-[#2a2528] rounded transition-colors group"
              >
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Proctor
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Hall Stream</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginModal;
