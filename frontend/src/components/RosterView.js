import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, UserCheck, UserX, Search, CheckCircle2, Clock,
  Crosshair, ShieldAlert, CheckCheck, RefreshCw, AlertCircle,
  UserPlus, Sparkles, X, PlusCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';

function RosterView({
  participants = [],
  exam,
  onCheckIn,
  onCheckOut,
  onBatchCheckIn,
  onAddParticipant,
  onSeedCohort,
  onRefresh,
  loading = false
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL'); // ALL, CHECKED_IN, REGISTERED, CHECKED_OUT
  const [actionLoading, setActionLoading] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, itemsPerPage]);

  // New Candidate Form State
  const nextSuggestedSeat = useMemo(() => {
    if (!participants || participants.length === 0) return 1;
    const maxSeat = Math.max(...participants.map(p => p.seat_number || 0), 0);
    return maxSeat + 1;
  }, [participants]);

  const [addForm, setAddForm] = useState({
    name: '',
    roll_number: '',
    seat_number: nextSuggestedSeat,
    assigned_camera_id: 0,
    checkInNow: false
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Sync default seat when modal opens or participants change
  const openAddModal = () => {
    setAddForm({
      name: '',
      roll_number: `REG-${2024000 + nextSuggestedSeat}`,
      seat_number: nextSuggestedSeat,
      assigned_camera_id: 0,
      checkInNow: false
    });
    setAddError(null);
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.roll_number.trim()) {
      setAddError('Name and Roll Number are required.');
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      if (onAddParticipant) {
        await onAddParticipant({
          name: addForm.name.trim(),
          roll_number: addForm.roll_number.trim(),
          seat_number: parseInt(addForm.seat_number) || nextSuggestedSeat,
          assigned_camera_id: parseInt(addForm.assigned_camera_id) || 0
        });
        setShowAddModal(false);
      }
    } catch (err) {
      setAddError(err.message || 'Failed to add candidate');
    } finally {
      setAddLoading(false);
    }
  };

  const handleSeed = async (count) => {
    if (!onSeedCohort) return;
    setSeedingLoading(true);
    try {
      await onSeedCohort(count);
    } catch (err) {
      console.error('Seeding failed:', err);
    } finally {
      setSeedingLoading(false);
    }
  };

  const totalEnrolled = Math.max(exam?.num_students || 0, participants.length, 1);
  const checkedInCount = useMemo(
    () => participants.filter(p => p.status === 'CHECKED_IN').length,
    [participants]
  );
  const pendingCount = useMemo(
    () => participants.filter(p => p.status === 'REGISTERED').length,
    [participants]
  );
  const checkedOutCount = useMemo(
    () => participants.filter(p => p.status === 'CHECKED_OUT').length,
    [participants]
  );
  const attendanceRate = totalEnrolled > 0 ? Math.round((checkedInCount / totalEnrolled) * 100) : 0;
  const missingDesks = Math.max(0, (exam?.num_students || 0) - participants.length);

  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const matchSearch =
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.roll_number?.toLowerCase().includes(search.toLowerCase()) ||
        String(p.seat_number).includes(search);
      const matchFilter = filter === 'ALL' || p.status === filter;
      return matchSearch && matchFilter;
    });
  }, [participants, search, filter]);

  const totalPages = Math.ceil(filteredParticipants.length / itemsPerPage) || 1;

  const paginatedParticipants = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredParticipants.slice(start, start + itemsPerPage);
  }, [filteredParticipants, currentPage, itemsPerPage]);

  const handleAction = async (actionFn, id) => {
    setActionLoading(id);
    try {
      await actionFn(id);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePaginationWheel = (e) => {
    if (totalPages <= 1) return;
    if (e.deltaY > 0 && currentPage < totalPages) {
      e.preventDefault();
      setCurrentPage(p => p + 1);
    } else if (e.deltaY < 0 && currentPage > 1) {
      e.preventDefault();
      setCurrentPage(p => p - 1);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#f5f5f7] dark:bg-[#000000] overflow-y-auto p-4 sm:p-6 space-y-5 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header & Attendance Summary Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-black/[0.08] dark:border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0071e3]" />
            <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
              Candidate Roster & Attendance
            </h2>
          </div>
          <p className="text-xs text-[#86868b] mt-0.5">
            Real-time candidate identity verification, seat mapping, and presence validation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Candidate Button */}
          <button
            onClick={openAddModal}
            className="ess-btn-primary rounded-xl text-xs py-2 px-3.5"
          >
            <UserPlus size={13} />
            <span>+ Add Candidate</span>
          </button>

          {/* Auto-Populate Cohort Desks */}
          {onSeedCohort && missingDesks > 0 && (
            <button
              onClick={() => handleSeed(missingDesks)}
              disabled={seedingLoading || loading}
              className="ess-btn-secondary rounded-xl text-xs py-2 px-3.5"
              title={`Generate the remaining ${missingDesks} desks to reach hall capacity of ${exam?.num_students}`}
            >
              <Sparkles size={13} className={seedingLoading ? 'animate-spin' : 'text-[#0071e3]'} />
              <span>Auto-Fill {missingDesks} Desk{missingDesks !== 1 ? 's' : ''}</span>
            </button>
          )}

          {/* Fallback seed if no missing desks */}
          {onSeedCohort && missingDesks === 0 && (
            <button
              onClick={() => handleSeed(5)}
              disabled={seedingLoading || loading}
              className="ess-btn-secondary rounded-xl text-xs py-2 px-3.5"
              title="Add 5 more test candidate desks"
            >
              <PlusCircle size={13} />
              <span>+5 Desks</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="ess-btn-secondary rounded-xl text-xs py-2 px-3.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}

          {onBatchCheckIn && (
            <button
              onClick={onBatchCheckIn}
              disabled={loading || pendingCount === 0}
              className="ess-btn-success rounded-xl text-xs py-2 px-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCheck size={13} />
              <span>Mark All Present ({pendingCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Cohort Capacity Advisory Notice */}
      {participants.length < (exam?.num_students || 0) && (
        <div className="p-4 bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2 text-[#1d1d1f] dark:text-white">
            <Sparkles size={15} className="text-[#0071e3] shrink-0" />
            <span>
              Hall capacity is <strong className="font-semibold">{exam?.num_students} desks</strong>, with <strong className="font-semibold">{participants.length} registered</strong>.
            </span>
          </div>
          {onSeedCohort && (
            <button
              onClick={() => handleSeed(missingDesks)}
              disabled={seedingLoading}
              className="self-start sm:self-auto ess-btn-primary text-xs py-1.5 px-3 rounded-xl shrink-0 cursor-pointer"
            >
              Populate Missing {missingDesks} Desks
            </button>
          )}
        </div>
      )}

      {/* Attendance Telemetry Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
        <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-4 flex flex-col justify-between shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between text-xs text-[#86868b] mb-1 font-medium uppercase tracking-wider text-[11px]">
            <span className="truncate mr-1">Enrolled</span>
            <Users size={14} className="text-[#86868b]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#1d1d1f] dark:text-white tracking-tight my-0.5">{totalEnrolled}</div>
          <div className="text-[11px] text-[#86868b]">Expected Cohort</div>
        </div>

        <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-4 flex flex-col justify-between shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between text-xs text-[#86868b] mb-1 font-medium uppercase tracking-wider text-[11px]">
            <span className="truncate mr-1">In-Hall</span>
            <UserCheck size={14} className="text-[#34c759]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#34c759] tracking-tight my-0.5">{checkedInCount}</div>
          <div className="text-[11px] text-[#86868b]">{attendanceRate}% Verified</div>
        </div>

        <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-4 flex flex-col justify-between shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between text-xs text-[#86868b] mb-1 font-medium uppercase tracking-wider text-[11px]">
            <span className="truncate mr-1">Pending</span>
            <Clock size={14} className="text-[#ff9500]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#ff9500] tracking-tight my-0.5">{pendingCount}</div>
          <div className="text-[11px] text-[#86868b]">Awaiting check-in</div>
        </div>

        <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-4 flex flex-col justify-between shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between text-xs text-[#86868b] mb-1 font-medium uppercase tracking-wider text-[11px]">
            <span className="truncate mr-1">Departed</span>
            <UserX size={14} className="text-[#86868b]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#86868b] tracking-tight my-0.5">{checkedOutCount}</div>
          <div className="text-[11px] text-[#86868b]">Completed session</div>
        </div>
      </div>

      {/* Attendance Progress Bar */}
      <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-3 sm:p-3.5 shadow-xs flex-shrink-0">
        <div className="flex justify-between items-center text-xs mb-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1d1d1f] dark:text-white text-xs">Attendance Progress</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] font-medium">
              {checkedInCount} of {totalEnrolled} Verified ({attendanceRate}%)
            </span>
          </div>
          <span className="text-[#86868b] text-[11px] font-mono">{pendingCount} remaining</span>
        </div>
        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-[#34c759] h-full rounded-full transition-all duration-300"
            style={{ width: `${attendanceRate}%` }}
          />
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate name, roll number, or seat..."
            className="w-full bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl pl-9 pr-4 py-2 text-xs text-[#1d1d1f] dark:text-white placeholder-[#86868b] focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All', count: participants.length },
            { id: 'CHECKED_IN', label: 'Checked In', count: checkedInCount },
            { id: 'REGISTERED', label: 'Pending', count: pendingCount },
            { id: 'CHECKED_OUT', label: 'Departed', count: checkedOutCount },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                filter === f.id
                  ? 'bg-[#0071e3] text-white shadow-xs font-semibold'
                  : 'bg-white dark:bg-[#1c1c1e] text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white border border-black/[0.08] dark:border-white/[0.08]'
              }`}
            >
              <span>{f.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                filter === f.id ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/10 text-[#86868b]'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Candidate Count Badge */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0 text-xs text-[#86868b] dark:text-[#a1a1a6]">
          <span className="font-mono bg-black/5 dark:bg-white/10 px-3 py-1.5 rounded-full text-[11px] font-medium">
            {filteredParticipants.length} Candidate{filteredParticipants.length !== 1 ? 's' : ''} Listed
          </span>
        </div>
      </div>

      {/* Participants Directory Table (macOS Grouped Style) */}
      <div className="rounded-3xl overflow-hidden border border-black/[0.08] dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex-1 min-h-[350px] flex flex-col bg-white dark:bg-[#1c1c1e]">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-left text-xs text-[#1d1d1f] dark:text-[#f5f5f7] border-collapse">
            <thead className="sticky top-0 z-20 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.06]">
              <tr className="text-[11px] text-[#86868b] uppercase tracking-wider font-medium">
                <th className="px-5 py-3 font-medium">Candidate</th>
                <th className="px-5 py-3 font-medium">Roll Number</th>
                <th className="px-5 py-3 font-medium">Seat</th>
                <th className="px-5 py-3 font-medium">Camera Node</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Check-In</th>
                <th className="px-5 py-3 font-medium">Integrity Risk</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[#5d6b82] dark:text-[#94a3b8]">
                    <div className="flex flex-col items-center justify-center space-y-1.5">
                      <AlertCircle className="w-7 h-7 text-[#8b95a8] mb-1" />
                      <p className="text-sm font-semibold text-[#17233a] dark:text-slate-100 font-heading">No candidate records match current filter</p>
                      <button
                        onClick={openAddModal}
                        className="mt-2 ess-btn-primary text-xs"
                      >
                        + Add First Candidate
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedParticipants.map((p) => {
                  const isCheckedIn = p.status === 'CHECKED_IN';
                  const isPending = p.status === 'REGISTERED';
                  const isCheckedOut = p.status === 'CHECKED_OUT';
                  const riskScore = p.risk_score || 0;
                  const isActing = actionLoading === p.participant_id;

                  return (
                    <tr key={p.participant_id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                      {/* Candidate Avatar & Name */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {p.name ? p.name.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="font-medium text-[#1d1d1f] dark:text-white text-xs">{p.name || 'Unnamed Candidate'}</div>
                            <div className="text-[10px] text-[#86868b] font-mono">ID: {p.participant_id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>

                      {/* Roll Number */}
                      <td className="px-5 py-3 font-mono text-xs text-[#1d1d1f] dark:text-white">
                        {p.roll_number}
                      </td>

                      {/* Seat */}
                      <td className="px-5 py-3 text-xs">
                        <span className="px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 font-semibold font-mono text-[11px] text-[#1d1d1f] dark:text-white">
                          #{p.seat_number || '—'}
                        </span>
                      </td>

                      {/* Camera Node ID */}
                      <td className="px-5 py-3 text-xs">
                        {p.current_track_id !== null && p.current_track_id !== undefined ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0071e3] font-medium text-[11px]">
                            <Crosshair size={11} className="text-[#0071e3]" />
                            <span>Track #{p.current_track_id}</span>
                          </div>
                        ) : (
                          <span className="text-[#86868b]">Camera {p.assigned_camera_id ?? 0}</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-5 py-3">
                        {isCheckedIn && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#34c759]/15 text-[#34c759] border border-[#34c759]/25 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] breathe-dot" />
                            <span>Checked In</span>
                          </div>
                        )}
                        {isPending && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ff9500]/15 text-[#ff9500] border border-[#ff9500]/25 text-[11px] font-medium">
                            <Clock size={11} />
                            <span>Pending Entry</span>
                          </div>
                        )}
                        {isCheckedOut && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[#86868b] text-[11px] font-medium">
                            <UserX size={11} />
                            <span>Departed</span>
                          </div>
                        )}
                      </td>

                      {/* Check-In Time */}
                      <td className="px-5 py-3 font-mono text-xs text-[#86868b]">
                        {p.check_in_time ? (
                          <span className="text-[#1d1d1f] dark:text-white font-medium">{new Date(p.check_in_time).toLocaleTimeString()}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>

                      {/* Integrity Risk Score */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full font-mono ${
                            riskScore > 70
                              ? 'bg-[#ff3b30] text-white shadow-xs'
                              : riskScore > 30
                              ? 'bg-[#ff9500]/15 text-[#ff9500] border border-[#ff9500]/25'
                              : 'bg-[#34c759]/10 text-[#34c759]'
                          }`}>
                            {riskScore.toFixed(0)}%
                          </span>
                          {riskScore > 70 && (
                            <ShieldAlert size={14} className="text-[#ff3b30]" />
                          )}
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="px-5 py-3 text-right">
                        {isPending && onCheckIn && (
                          <button
                            onClick={() => handleAction(onCheckIn, p.participant_id)}
                            disabled={isActing}
                            className="bg-[#34c759] hover:bg-[#30d158] text-white text-xs py-1.5 px-3 rounded-xl inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <CheckCircle2 size={12} />
                            <span>Check In</span>
                          </button>
                        )}

                        {isCheckedIn && onCheckOut && (
                          <button
                            onClick={() => handleAction(onCheckOut, p.participant_id)}
                            disabled={isActing}
                            className="bg-black/5 dark:bg-white/10 hover:bg-black/10 hover:text-[#ff3b30] dark:hover:text-[#ff453a] text-[#86868b] text-xs py-1.5 px-3 rounded-xl inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer disabled:opacity-50"
                          >
                            <UserX size={12} />
                            <span>Depart</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Apple Table Pagination Dock */}
        {filteredParticipants.length > 0 && (
          <div 
            onWheel={handlePaginationWheel}
            className="flex-shrink-0 mt-auto px-6 py-3.5 border-t border-black/5 dark:border-white/5 bg-[#fbfbfd]/90 dark:bg-[#1c1c1e]/90 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          >
            <div className="text-[#86868b] dark:text-[#a1a1a6] font-medium">
              Showing <span className="font-semibold text-[#1d1d1f] dark:text-white">{Math.min(filteredParticipants.length, (currentPage - 1) * itemsPerPage + 1)}</span>–<span className="font-semibold text-[#1d1d1f] dark:text-white">{Math.min(filteredParticipants.length, currentPage * itemsPerPage)}</span> of <span className="font-semibold text-[#0071e3]">{filteredParticipants.length}</span> candidates
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-[#86868b] dark:text-[#a1a1a6]">
                <span>Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-black/5 dark:bg-white/10 border border-transparent hover:border-black/10 dark:hover:border-white/20 text-[#1d1d1f] dark:text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer transition-all"
                >
                  <option value={5}>5 / page</option>
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="First Page"
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Previous Page"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="px-2.5 text-xs font-medium text-[#1d1d1f] dark:text-white">
                  {currentPage} of {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Next Page"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Last Page"
                >
                  <ChevronsRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Apple Sheet Modal: Add Candidate */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all">
          <div className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative border border-black/10 dark:border-white/15 bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-white transition-all">
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10 bg-[#fbfbfd]/70 dark:bg-[#2c2c2e]/70 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">Add Candidate</h2>
                  <p className="text-[11px] text-[#86868b] dark:text-[#a1a1a6]">Register new examination seat</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-[#ff3b30]/10 border border-[#ff3b30]/20 text-[#ff3b30] text-xs rounded-xl font-medium">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Candidate Full Name</label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                  placeholder="e.g. Alex Johnson"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Roll / Registration No.</label>
                  <input
                    type="text"
                    required
                    value={addForm.roll_number}
                    onChange={(e) => setAddForm({ ...addForm, roll_number: e.target.value })}
                    className="w-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#1d1d1f] dark:text-white placeholder-[#86868b]/60 focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                    placeholder="e.g. REG-2024005"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Desk / Seat Number</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    required
                    value={addForm.seat_number}
                    onChange={(e) => setAddForm({ ...addForm, seat_number: parseInt(e.target.value) || 1 })}
                    className="w-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#86868b] dark:text-[#a1a1a6] mb-1.5">Assigned Camera Sensor</label>
                <select
                  value={addForm.assigned_camera_id}
                  onChange={(e) => setAddForm({ ...addForm, assigned_camera_id: parseInt(e.target.value) || 0 })}
                  className="w-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#1d1d1f] dark:text-white focus:outline-none focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/15 transition-all cursor-pointer"
                >
                  <option value={0}>Camera 0 — Primary Hall Overhead</option>
                  <option value={1}>Camera 1 — Secondary Front Overview</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-medium text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-5 py-2 rounded-full text-xs font-medium bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.98] text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {addLoading ? 'Registering...' : 'Add Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default RosterView;
