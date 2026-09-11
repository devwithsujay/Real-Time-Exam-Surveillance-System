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
    <div className="flex-1 min-h-0 flex flex-col bg-[#121011] overflow-y-auto p-4 sm:p-6 space-y-5 text-slate-200">
      {/* Header & Attendance Summary Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-[rgba(255,255,255,0.07)]">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--accent-text)]" />
            <h2 className="text-sm font-semibold text-white tracking-tight font-heading">
              Candidate Roster & Live Attendance Desk
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time candidate verification, desk spatial tracking, and check-in management
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Candidate Button */}
          <button
            onClick={openAddModal}
            className="ess-btn-primary"
          >
            <UserPlus size={13} />
            <span>+ Add Candidate</span>
          </button>

          {/* Auto-Populate Cohort Desks */}
          {onSeedCohort && missingDesks > 0 && (
            <button
              onClick={() => handleSeed(missingDesks)}
              disabled={seedingLoading || loading}
              className="ess-btn-secondary"
              title={`Generate the remaining ${missingDesks} desks to reach hall capacity of ${exam?.num_students}`}
            >
              <Sparkles size={12} className={seedingLoading ? 'animate-spin' : 'text-[var(--accent-text)]'} />
              <span>Auto-Fill {missingDesks} Desk{missingDesks !== 1 ? 's' : ''}</span>
            </button>
          )}

          {/* Fallback seed if no missing desks */}
          {onSeedCohort && missingDesks === 0 && (
            <button
              onClick={() => handleSeed(5)}
              disabled={seedingLoading || loading}
              className="ess-btn-secondary"
              title="Add 5 more test candidate desks"
            >
              <PlusCircle size={12} />
              <span>+5 Desks</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="ess-btn-secondary"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}

          {onBatchCheckIn && (
            <button
              onClick={onBatchCheckIn}
              disabled={loading || pendingCount === 0}
              className="ess-btn-success disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCheck size={13} />
              <span>Mark All Present ({pendingCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Cohort Capacity Advisory Notice */}
      {participants.length < (exam?.num_students || 0) && (
        <div className="p-3 ess-card bg-[#1a1719] border-[rgba(255,255,255,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Sparkles size={14} className="text-[var(--accent-text)] shrink-0" />
            <span>
              Hall capacity is <strong>{exam?.num_students} desks</strong>, with <strong>{participants.length} registered</strong>.
            </span>
          </div>
          {onSeedCohort && (
            <button
              onClick={() => handleSeed(missingDesks)}
              disabled={seedingLoading}
              className="self-start sm:self-auto px-2.5 py-1 ess-btn-primary text-xs font-medium shrink-0"
            >
              Populate Missing {missingDesks} Desk{missingDesks !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Attendance Telemetry Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="ess-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="truncate mr-1">Enrolled Capacity</span>
            <Users size={13} className="text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight my-0.5">{totalEnrolled}</div>
          <div className="text-[10px] text-slate-500 font-mono">Expected Cohort</div>
        </div>

        <div className="ess-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="truncate mr-1">Present / In-Hall</span>
            <UserCheck size={13} className="text-[#6ba883]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#6ba883] tracking-tight my-0.5">{checkedInCount}</div>
          <div className="text-[10px] text-slate-500 font-mono">{attendanceRate}% Verified</div>
        </div>

        <div className="ess-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="truncate mr-1">Pending Entry</span>
            <Clock size={13} className="text-[#c2ab5c]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#c2ab5c] tracking-tight my-0.5">{pendingCount}</div>
          <div className="text-[10px] text-slate-500 font-mono">Awaiting entry</div>
        </div>

        <div className="ess-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="truncate mr-1">Departed</span>
            <UserX size={13} className="text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-300 tracking-tight my-0.5">{checkedOutCount}</div>
          <div className="text-[10px] text-slate-500 font-mono">Completed session</div>
        </div>
      </div>

      {/* Attendance Progress Bar */}
      <div className="ess-card p-3.5">
        <div className="flex justify-between items-center text-xs mb-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Live Attendance Ratio</span>
            <span className="text-[10px] font-mono px-2 py-px rounded bg-[#6ba883]/10 text-[#6ba883] border border-[#6ba883]/25 font-semibold">
              {checkedInCount} of {totalEnrolled} Verified ({attendanceRate}%)
            </span>
          </div>
          <span className="text-slate-400 font-mono text-xs">{pendingCount} remaining</span>
        </div>
        <div className="w-full bg-[#0b0a0a] rounded h-1.5 overflow-hidden border border-[rgba(255,255,255,0.06)]">
          <div
            className="bg-[#6ba883] h-full rounded transition-all duration-300"
            style={{ width: `${attendanceRate}%` }}
          />
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name, roll number, or seat..."
            className="w-full bg-[#0b0a0a] border border-[rgba(255,255,255,0.08)] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Candidates', count: participants.length },
            { id: 'CHECKED_IN', label: 'Checked In', count: checkedInCount },
            { id: 'REGISTERED', label: 'Pending', count: pendingCount },
            { id: 'CHECKED_OUT', label: 'Checked Out', count: checkedOutCount },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                filter === f.id
                  ? 'bg-[var(--accent-wash)] text-[var(--accent-text)] border border-[var(--accent-border)] font-semibold shadow-sm'
                  : 'bg-[#1a1719] text-slate-400 hover:text-white border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]'
              }`}
            >
              <span>{f.label}</span>
              <span className={`text-[10px] font-mono px-1 py-px rounded ${
                filter === f.id ? 'bg-[var(--accent-wash)] text-[var(--accent-text)]' : 'bg-[#221e20] text-slate-400'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Top Pagination Toolbar */}
        <div 
          onWheel={handlePaginationWheel}
          className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0"
        >
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono bg-[#1a1719] px-2 py-1 rounded border border-[rgba(255,255,255,0.08)]">
            <span>Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] text-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[var(--border-focus)] cursor-pointer"
            >
              <option value={5}>5 / page</option>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-[#1a1719] p-0.5 rounded border border-[rgba(255,255,255,0.08)]">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-[#221e20] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="First Page"
            >
              <ChevronsLeft size={13} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-[#221e20] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous Page"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="px-1.5 text-xs font-mono text-slate-300">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-[#221e20] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next Page"
            >
              <ChevronRight size={13} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-[#221e20] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Last Page"
            >
              <ChevronsRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Participants Directory Table */}
      <div className="ess-card rounded overflow-hidden border border-[rgba(255,255,255,0.07)] shadow-sm flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px] min-h-[160px]">
          <table className="w-full text-left text-xs text-slate-200 border-collapse">
            <thead className="sticky top-0 z-20 bg-[#121011] border-b border-[rgba(255,255,255,0.08)]">
              <tr className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-2.5 font-semibold">Candidate</th>
                <th className="px-4 py-2.5 font-semibold">Roll Number</th>
                <th className="px-4 py-2.5 font-semibold">Seat</th>
                <th className="px-4 py-2.5 font-semibold">CV Track ID</th>
                <th className="px-4 py-2.5 font-semibold">Attendance Status</th>
                <th className="px-4 py-2.5 font-semibold">Check-In Time</th>
                <th className="px-4 py-2.5 font-semibold">Integrity Risk</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-1.5">
                      <AlertCircle className="w-7 h-7 text-slate-600 mb-1" />
                      <p className="text-sm font-semibold text-white font-heading">No candidate records match current filter</p>
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
                    <tr key={p.participant_id} className="hover:bg-[#221e20]/60 transition-colors">
                      {/* Candidate Avatar & Name */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded bg-[#221e20] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-xs font-semibold text-slate-300 flex-shrink-0">
                            {p.name ? p.name.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="font-medium text-white">{p.name || 'Unnamed Candidate'}</div>
                            <div className="text-[10px] text-slate-500 font-mono">UID: {p.participant_id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      {/* Roll Number */}
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-200">
                        {p.roll_number}
                      </td>

                      {/* Seat */}
                      <td className="px-4 py-2.5 font-mono text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-[#221e20] border border-[rgba(255,255,255,0.08)] font-semibold text-xs">
                          #{p.seat_number || '—'}
                        </span>
                      </td>

                      {/* CV Track ID */}
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {p.current_track_id !== null && p.current_track_id !== undefined ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-wash)] text-[var(--accent-text)] border border-[var(--accent-border)] font-medium">
                            <Crosshair size={10} className="text-[var(--accent-text)]" />
                            <span>TRK #{p.current_track_id}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600 font-mono">—</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-2.5">
                        {isCheckedIn && (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#6ba883]/10 text-[#6ba883] border border-[#6ba883]/25 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6ba883] ess-pulse" />
                            <span>Checked In</span>
                          </div>
                        )}
                        {isPending && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#c2ab5c]/10 text-[#c2ab5c] border border-[#c2ab5c]/25 text-[11px] font-medium">
                            <Clock size={10} />
                            <span>Pending Entry</span>
                          </div>
                        )}
                        {isCheckedOut && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#221e20] text-slate-400 border border-[rgba(255,255,255,0.08)] text-[11px] font-medium">
                            <UserX size={10} />
                            <span>Departed</span>
                          </div>
                        )}
                      </td>

                      {/* Check-In Time */}
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">
                        {p.check_in_time ? (
                          <span className="text-slate-300 font-medium">{new Date(p.check_in_time).toLocaleTimeString()}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Integrity Risk Score */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-xs font-semibold px-1.5 py-px rounded ${
                            riskScore > 70
                              ? 'bg-[#c76454]/15 text-[#c76454] border border-[#c76454]/30'
                              : riskScore > 30
                              ? 'bg-[#c98a52]/15 text-[#c98a52] border border-[#c98a52]/30'
                              : 'bg-[#6ba883]/10 text-[#6ba883] border border-[#6ba883]/20'
                          }`}>
                            {riskScore.toFixed(0)}%
                          </span>
                          {riskScore > 70 && (
                            <ShieldAlert size={13} className="text-[#c76454]" />
                          )}
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="px-4 py-2.5 text-right">
                        {isPending && onCheckIn && (
                          <button
                            onClick={() => handleAction(onCheckIn, p.participant_id)}
                            disabled={isActing}
                            className="px-2.5 py-1 rounded bg-[#6ba883] hover:bg-[#5d9472] text-[#0b0a0a] text-xs font-semibold shadow-sm transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <CheckCircle2 size={12} />
                            <span>Verify In</span>
                          </button>
                        )}

                        {isCheckedIn && onCheckOut && (
                          <button
                            onClick={() => handleAction(onCheckOut, p.participant_id)}
                            disabled={isActing}
                            className="px-2.5 py-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-slate-300 hover:text-white border border-[rgba(255,255,255,0.08)] text-xs font-medium transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <UserX size={12} />
                            <span>Check Out</span>
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

        {/* Table Pagination Dock */}
        {filteredParticipants.length > 0 && (
          <div 
            onWheel={handlePaginationWheel}
            className="sticky bottom-0 z-20 px-4 py-2.5 border-t border-[rgba(255,255,255,0.07)] bg-[#1a1719] flex flex-col sm:flex-row items-center justify-between gap-2.5"
          >
            <div className="text-xs font-mono text-slate-400">
              Showing <strong className="text-slate-200">{Math.min(filteredParticipants.length, (currentPage - 1) * itemsPerPage + 1)}</strong>–<strong className="text-slate-200">{Math.min(filteredParticipants.length, currentPage * itemsPerPage)}</strong> of <strong className="text-[var(--accent-text)]">{filteredParticipants.length}</strong> candidates
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <span>Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] text-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-[var(--border-focus)] cursor-pointer"
                >
                  <option value={5}>5 / page</option>
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="px-2 text-xs font-mono text-slate-200">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next Page"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-[#221e20] hover:bg-[#2a2528] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Last Page"
                >
                  <ChevronsRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="ess-card w-full max-w-md shadow-[var(--shadow-modal)] overflow-hidden relative border border-[rgba(255,255,255,0.1)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.07)] bg-[#221e20]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-[var(--accent-wash)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
                  <UserPlus size={14} />
                </div>
                <h2 className="text-sm font-semibold text-white tracking-tight font-heading">Register Examination Candidate</h2>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#1a1719] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-3.5 bg-[#1a1719]">
              {addError && (
                <div className="p-2.5 bg-[#c76454]/10 border border-[#c76454]/25 text-[#c76454] text-xs rounded">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Candidate Full Name</label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans"
                  placeholder="e.g. Alex Johnson"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Roll / Registration No.</label>
                  <input
                    type="text"
                    required
                    value={addForm.roll_number}
                    onChange={(e) => setAddForm({ ...addForm, roll_number: e.target.value })}
                    className="w-full bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                    placeholder="e.g. REG-2024005"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Desk / Seat Number</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    required
                    value={addForm.seat_number}
                    onChange={(e) => setAddForm({ ...addForm, seat_number: parseInt(e.target.value) || 1 })}
                    className="w-full bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Camera Sensor</label>
                <select
                  value={addForm.assigned_camera_id}
                  onChange={(e) => setAddForm({ ...addForm, assigned_camera_id: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0b0a0a] border border-[rgba(255,255,255,0.1)] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[var(--border-focus)] transition-colors font-sans cursor-pointer"
                >
                  <option value={0}>CAM-0 (Primary Hall Fisheye / Overhead)</option>
                  <option value={1}>CAM-1 (Secondary Front Overview)</option>
                </select>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-[rgba(255,255,255,0.07)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 ess-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 ess-btn-primary disabled:opacity-50"
                >
                  {addLoading ? 'Registering...' : 'Register Candidate'}
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
