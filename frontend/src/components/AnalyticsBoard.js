import React from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import {
  Users, UserCheck, Crosshair, AlertTriangle, ShieldAlert,
  AlertCircle, Info, UserX, Activity, TrendingUp
} from 'lucide-react';

function AnalyticsBoard({ analytics, exam }) {
  const { summary, event_timeline, top_violations, engagement_distribution, risk_distribution } = analytics || {};

  const VIOLATION_COLORS = [
    '#c76454', '#c98a52', '#c2ab5c', '#8a4a6b', '#b8789a',
    '#6ba883', '#6b9ab5', '#9b5579', '#a89f97', '#6b6560'
  ];

  const totalEnrolled = summary?.total_students || analytics?.total_students || exam?.num_students || 0;
  const checkedIn = summary?.checked_in ?? analytics?.checked_in ?? 0;
  const activeTracks = summary?.active_tracks ?? analytics?.active_students ?? checkedIn;
  const totalEvents = summary?.total_events ?? analytics?.total_events ?? 0;
  const highSeverity = summary?.high_severity_events ?? analytics?.high_severity_events ?? 0;
  const mediumSeverity = summary?.medium_severity_events ?? analytics?.medium_severity_events ?? 0;
  const lowSeverity = summary?.low_severity_events ?? analytics?.low_severity_events ?? 0;
  const flaggedCount = summary?.flagged_students_count ?? analytics?.flagged_students_count ?? 0;
  const attendanceRate = totalEnrolled > 0 ? Math.round((checkedIn / totalEnrolled) * 100) : 0;

  const metricCards = [
    { label: 'Total Enrolled', value: totalEnrolled, icon: Users, statusColor: 'text-[#a89f97]' },
    { label: 'Present / In-Hall', value: `${checkedIn} (${attendanceRate}%)`, icon: UserCheck, statusColor: 'text-[#6ba883]' },
    { label: 'Active CV Tracks', value: activeTracks, icon: Crosshair, statusColor: 'text-[#b8789a]' },
    { label: 'Total Anomalies', value: totalEvents, icon: AlertTriangle, statusColor: totalEvents > 0 ? 'text-[#c2ab5c]' : 'text-[#6b6560]' },
    { label: 'High / Critical', value: highSeverity, icon: ShieldAlert, statusColor: highSeverity > 0 ? 'text-[#c76454]' : 'text-[#6b6560]' },
    { label: 'Medium Severity', value: mediumSeverity, icon: AlertCircle, statusColor: mediumSeverity > 0 ? 'text-[#c2ab5c]' : 'text-[#6b6560]' },
    { label: 'Low Severity', value: lowSeverity, icon: Info, statusColor: 'text-[#6b9ab5]' },
    { label: 'Flagged Candidates', value: flaggedCount, icon: UserX, statusColor: flaggedCount > 0 ? 'text-[#c76454]' : 'text-[#6b6560]' },
  ];

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-transparent overflow-y-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[rgba(244,241,235,0.07)]">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#b8789a]" />
            <h2 className="text-sm font-semibold text-[#f0ece4] tracking-tight font-heading">
              Real-Time Telemetry & Forensic Analytics
            </h2>
          </div>
          <p className="text-xs text-[#a89f97] mt-0.5 font-sans">
            Aggregated computer vision telemetry, anomaly distributions, and integrity risk indices
          </p>
        </div>

        {exam && (
          <div className="flex items-center gap-2 self-start sm:self-auto px-2.5 py-1 rounded bg-[#221e20] border border-[rgba(244,241,235,0.08)] text-xs text-[#f0ece4]">
            <span className="text-[#a89f97] text-[11px]">Session:</span>
            <span className="font-semibold text-[#f0ece4]">{exam.exam_name}</span>
            <span className="text-[#6b6560]">•</span>
            <span className="text-[#b8789a] font-semibold font-mono">{exam.duration_minutes}m</span>
          </div>
        )}
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {metricCards.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div
              key={i}
              className="ess-card p-3 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-[#a89f97] leading-tight truncate mr-1 font-sans">
                  {metric.label}
                </span>
                <Icon className={`w-3.5 h-3.5 ${metric.statusColor} shrink-0`} />
              </div>
              <div className="text-xl font-bold font-mono text-[#f0ece4] tracking-tight mt-1">
                {metric.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Incident Frequency Timeline (Events / Minute)"
          subtitle="Chronological distribution of computer vision infractions"
          height={260}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={event_timeline || []}>
              <defs>
                <linearGradient id="eventGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8a4a6b" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8a4a6b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 2" stroke="rgba(244,241,235,0.06)" />
              <XAxis
                dataKey="minute"
                stroke="#6b6560"
                fontSize={10}
                tick={{ fill: '#a89f97' }}
                label={{ value: 'Exam Minute', position: 'insideBottom', offset: -5, fill: '#a89f97', fontSize: 10 }}
              />
              <YAxis
                stroke="#6b6560"
                fontSize={10}
                tick={{ fill: '#a89f97' }}
                label={{ value: 'Flags', angle: -90, position: 'insideLeft', fill: '#a89f97', fontSize: 10 }}
              />
              <Tooltip content={<CustomChartTooltip unit="Flags" />} />
              <Area
                type="monotone"
                dataKey="events"
                stroke="#b8789a"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#eventGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top Anomaly Classifications"
          subtitle="Frequency breakdown by behavioral violation model"
          height={260}
        >
          <div className="space-y-2.5 overflow-y-auto pr-1" style={{ maxHeight: 250 }}>
            {top_violations?.length > 0 ? (
              top_violations.map((v, i) => (
                <ViolationRow key={i} violation={v} color={VIOLATION_COLORS[i % VIOLATION_COLORS.length]} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-44 text-[#6b6560]">
                <TrendingUp className="w-6 h-6 text-[#6b6560] mb-1.5" />
                <p className="text-xs">No behavioral anomalies logged yet</p>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Security Risk Stratification"
          subtitle="Proctoring risk distribution across all candidate tracks"
          height={240}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'Low Risk', value: risk_distribution?.low || 0, color: '#6ba883' },
                  { name: 'Medium Risk', value: risk_distribution?.medium || 0, color: '#c2ab5c' },
                  { name: 'High Risk', value: risk_distribution?.high || 0, color: '#c76454' }
                ].filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {[
                  { name: 'Low Risk', value: risk_distribution?.low || 0, color: '#6ba883' },
                  { name: 'Medium Risk', value: risk_distribution?.medium || 0, color: '#c2ab5c' },
                  { name: 'High Risk', value: risk_distribution?.high || 0, color: '#c76454' }
                ].filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#121011" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomChartTooltip unit="Students" />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Candidate Engagement Indices"
          subtitle="Head pose stability and attention consistency metric"
          height={240}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'High Engagement', value: engagement_distribution?.high || 0, color: '#8a4a6b' },
                  { name: 'Medium Engagement', value: engagement_distribution?.medium || 0, color: '#6b9ab5' },
                  { name: 'Low Engagement', value: engagement_distribution?.low || 0, color: '#c76454' }
                ].filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {[
                  { name: 'High Engagement', value: engagement_distribution?.high || 0, color: '#8a4a6b' },
                  { name: 'Medium Engagement', value: engagement_distribution?.medium || 0, color: '#6b9ab5' },
                  { name: 'Low Engagement', value: engagement_distribution?.low || 0, color: '#c76454' }
                ].filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#121011" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomChartTooltip unit="Students" />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function CustomChartTooltip({ active, payload, label, unit }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1719] border border-[rgba(244,241,235,0.12)] px-3 py-2 rounded text-xs font-mono shadow-lg">
        {label !== undefined && (
          <p className="text-[#a89f97] mb-1">Minute: <span className="text-[#f0ece4] font-semibold">{label}</span></p>
        )}
        <p className="text-[#f0ece4] font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].color || payload[0].fill }} />
          <span>{payload[0].name || 'Value'}: <span className="text-white font-bold">{payload[0].value}</span> {unit || ''}</span>
        </p>
      </div>
    );
  }
  return null;
}

function ChartCard({ title, subtitle, height, children }) {
  return (
    <div className="ess-card p-4 flex flex-col" style={{ minHeight: height + 60 }}>
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-[#f0ece4] font-heading">{title}</h3>
        {subtitle && <p className="text-[11px] text-[#a89f97] mt-0.5 font-sans">{subtitle}</p>}
      </div>
      <div className="flex-1" style={{ height }}>{children}</div>
    </div>
  );
}

function ViolationRow({ violation, color }) {
  const percentage = violation.percentage || 0;
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[#f0ece4] font-medium truncate font-sans">{violation.type?.replace(/_/g, ' ')}</span>
          <span className="text-[#a89f97] font-mono font-medium">{violation.count}</span>
        </div>
        <div className="w-full bg-[#1a1719] rounded h-1 overflow-hidden border border-[rgba(244,241,235,0.06)]">
          <div
            className="h-full rounded transition-all duration-300"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-[11px] font-mono text-[#a89f97] w-12 text-right">{percentage.toFixed(1)}%</span>
    </div>
  );
}

export default React.memo(AnalyticsBoard);