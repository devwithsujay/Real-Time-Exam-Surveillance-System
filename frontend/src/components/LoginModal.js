import React, { useState, useEffect } from 'react';
import { ArrowRight, Eye, EyeOff, AlertCircle, Sun, Moon, Lock, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState('admin');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@12345');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ||
        localStorage.getItem('argus_theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('argus_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('argus_theme', 'light');
    }
  }, [isDark]);

  const ROLES = [
    { id: 'admin', label: 'Admin', u: 'admin', p: 'Admin@12345' },
    { id: 'auditor', label: 'Auditor', u: 'auditor1', p: 'Auditor@12345' },
    { id: 'proctor', label: 'Proctor', u: 'proctor1', p: 'Proctor@12345' },
  ];

  const handleSelectRole = (r) => {
    setSelectedRole(r.id);
    setUsername(r.u);
    setPassword(r.p);
    setError(null);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Your operator credentials could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#fbfbfd] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] font-sans antialiased transition-colors duration-300 select-none">
      
      {/* Top minimal navigation bar */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-brand font-bold text-lg tracking-wider text-[#1d1d1f] dark:text-white">
            ARGUS<span className="text-[#0071e3]">.</span>
          </span>
          <span className="text-xs text-[#86868b] font-normal italic ml-1">Never blinks.</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDark(!isDark)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-[#f5f5f7] dark:bg-[#1c1c1e] hover:bg-[#e8e8ed] dark:hover:bg-[#2c2c2e] transition-colors"
            title={isDark ? "Light Appearance" : "Dark Appearance"}
            aria-label="Toggle appearance"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white bg-[#f5f5f7] dark:bg-[#1c1c1e] hover:bg-[#e8e8ed] dark:hover:bg-[#2c2c2e] transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* Center Apple-Style Authentication Card */}
      <main className="w-full flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[400px]">
          
          <div className="bg-white dark:bg-[#1c1c1e] border border-[#e5e5ea] dark:border-[#2c2c2e] rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-8 sm:p-9 transition-all">
            
            {/* Ocular Icon Emblem */}
            <div className="flex justify-center mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#0071e3]/10 dark:bg-[#0071e3]/20 flex items-center justify-center text-[#0071e3] shadow-xs">
                <Lock size={24} strokeWidth={2.2} />
              </div>
            </div>

            {/* Human Welcome Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                Sign in to ARGUS
              </h1>
              <p className="text-[13px] text-[#86868b] mt-1.5 leading-normal">
                Enter your credentials to manage surveillance.
              </p>
            </div>

            {/* Apple-style Segmented Role Selector */}
            <div className="mb-6 p-1 rounded-2xl bg-[#f5f5f7] dark:bg-[#2c2c2e] flex items-center gap-1">
              {ROLES.map((r) => {
                const isActive = selectedRole === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white dark:bg-[#3a3a3c] text-[#1d1d1f] dark:text-white shadow-xs font-semibold'
                        : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-5 p-3 rounded-2xl bg-[#ff3b30]/10 border border-[#ff3b30]/20 text-xs text-[#ff3b30] flex items-center gap-2.5">
                <AlertCircle size={15} className="shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#86868b] mb-1.5 ml-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Operator username"
                  autoComplete="username"
                  className="w-full px-4 py-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] border border-transparent dark:border-transparent focus:border-[#0071e3] focus:bg-white dark:focus:bg-[#1c1c1e] rounded-2xl text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] focus:outline-none focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#86868b] mb-1.5 ml-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full px-4 pr-11 py-3 bg-[#f5f5f7] dark:bg-[#2c2c2e] border border-transparent dark:border-transparent focus:border-[#0071e3] focus:bg-white dark:focus:bg-[#1c1c1e] rounded-2xl text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] focus:outline-none focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white transition-colors p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Apple Pill Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-5 bg-[#0071e3] hover:bg-[#0077ED] active:scale-[0.99] text-white rounded-2xl text-[13.5px] font-medium tracking-tight transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,113,227,0.3)] disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-[#86868b]">
                Authorized operators under institutional review.
              </p>
            </div>

          </div>
        </div>
      </main>

      {/* Apple-style Minimal Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between text-xs text-[#86868b] gap-2 border-t border-[#e5e5ea]/80 dark:border-[#1c1c1e]">
        <span>Copyright © 2026 ARGUS Surveillance. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <span className="hover:text-[#1d1d1f] dark:hover:text-white transition-colors cursor-default">Privacy Policy</span>
          <span>•</span>
          <span className="hover:text-[#1d1d1f] dark:hover:text-white transition-colors cursor-default">Security Standards</span>
          <span>•</span>
          <span className="hover:text-[#1d1d1f] dark:hover:text-white transition-colors cursor-default">Support</span>
        </div>
      </footer>

    </div>
  );
}

export default LoginModal;
