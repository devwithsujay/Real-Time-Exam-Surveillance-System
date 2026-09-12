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
    '#ff3b30', '#ff9500', '#0071e3', '#34c759', '#af52de',
    '#5856d6', '#86868b', '#1d1d1f'
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
    { label: 'Enrolled', value: totalEnrolled, icon: Users, statusColor: 'text-[#86868b]' },
    { label: 'In-Hall', value: `${checkedIn} (${attendanceRate}%)`, icon: UserCheck, statusColor: 'text-[#34c759]' },
    { label: 'Active Tracks', value: activeTracks, icon: Crosshair, statusColor: 'text-[#0071e3]' },
    { label: 'Total Events', value: totalEvents, icon: AlertTriangle, statusColor: totalEvents > 0 ? 'text-[#ff9500]' : 'text-[#86868b]' },
    { label: 'High Severity', value: highSeverity, icon: ShieldAlert, statusColor: highSeverity > 0 ? 'text-[#ff3b30]' : 'text-[#86868b]' },
    { label: 'Medium', value: mediumSeverity, icon: AlertCircle, statusColor: mediumSeverity > 0 ? 'text-[#ff9500]' : 'text-[#86868b]' },
    { label: 'Low', value: lowSeverity, icon: Info, statusColor: 'text-[#86868b]' },
    { label: 'Flagged', value: flaggedCount, icon: UserX, statusColor: flaggedCount > 0 ? 'text-[#ff3b30]' : 'text-[#86868b]' },
  ];

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-[#f5f5f7] dark:bg-[#000000] overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/[0.08] dark:border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0071e3]" />
            <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
              Telemetry & Session Analytics
            </h2>
          </div>
          <p className="text-xs text-[#86868b] mt-0.5">
            Real-time attention metrics, anomaly distribution curves, and proctoring indices.
          </p>
        </div>

        {exam && (
          <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] text-xs text-[#1d1d1f] dark:text-white shadow-xs">
            <span className="text-[#86868b]">Session:</span>
            <span className="font-semibold">{exam.exam_name}</span>
            <span className="text-black/20 dark:text-white/20">•</span>
            <span className="text-[#0071e3] font-medium font-mono">{exam.duration_minutes}m</span>
          </div>
        )}
      </div>

      {/* Telemetry Metric Cards (Apple Health Style) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {metricCards.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div
              key={i}
              className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-4 flex flex-col justify-between shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[#86868b] font-medium uppercase tracking-wider truncate mr-1">
                  {metric.label}
                </span>
                <Icon className={`w-3.5 h-3.5 ${metric.statusColor} shrink-0`} />
              </div>
              <div className="text-xl font-bold font-mono text-[#1d1d1f] dark:text-white tracking-tight">
                {metric.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Incident Frequency Timeline"
          subtitle="Events observed per minute throughout the exam"
          height={260}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={event_timeline || []}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
              <XAxis
                dataKey="minute"
                stroke="var(--ink-muted)"
                fontSize={10}
                tick={{ fill: 'var(--ink-muted)' }}
                label={{ value: 'Minute', position: 'insideBottom', offset: -5, fill: 'var(--ink-muted)', fontSize: 10 }}
              />
              <YAxis
                stroke="var(--ink-muted)"
                fontSize={10}
                tick={{ fill: 'var(--ink-muted)' }}
                label={{ value: 'Flags', angle: -90, position: 'insideLeft', fill: 'var(--ink-muted)', fontSize: 10 }}
              />
              <Tooltip content={<CustomChartTooltip unit="Flags" />} />
              <Area
                type="monotone"
                dataKey="events"
                stroke="#0071e3"
                strokeWidth={2.5}
                fill="#0071e3"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top Anomaly Classifications"
          subtitle="Breakdown by detected behavioral patterns"
          height={260}
        >
          <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 250 }}>
            {top_violations?.length > 0 ? (
              top_violations.map((v, i) => (
                <ViolationRow key={i} violation={v} color={VIOLATION_COLORS[i % VIOLATION_COLORS.length]} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-44 text-[#86868b]">
                <TrendingUp className="w-6 h-6 text-[#86868b] mb-1.5" />
                <p className="text-xs">No behavioral anomalies logged yet</p>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Security Risk Stratification"
          subtitle="Proctoring risk distribution across all candidates"
          height={240}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'Normal', value: risk_distribution?.low || 0, color: '#34c759' },
                  { name: 'Moderate Review', value: risk_distribution?.medium || 0, color: '#ff9500' },
                  { name: 'High Attention', value: risk_distribution?.high || 0, color: '#ff3b30' }
                ].filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={64}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
              >
                {[
                  { name: 'Normal', value: risk_distribution?.low || 0, color: '#34c759' },
                  { name: 'Moderate Review', value: risk_distribution?.medium || 0, color: '#ff9500' },
                  { name: 'High Attention', value: risk_distribution?.high || 0, color: '#ff3b30' }
                ].filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="var(--card)" strokeWidth={3} />
                ))}
              </Pie>
              <Tooltip content={<CustomChartTooltip unit="Students" />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Candidate Engagement Indices"
          subtitle="Gaze focus stability and attention consistency"
          height={240}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'Focused', value: engagement_distribution?.high || 0, color: '#0071e3' },
                  { name: 'Occasional Gaze Shift', value: engagement_distribution?.medium || 0, color: '#86868b' },
                  { name: 'Distracted', value: engagement_distribution?.low || 0, color: '#ff9500' }
                ].filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={64}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
              >
                {[
                  { name: 'Focused', value: engagement_distribution?.high || 0, color: '#0071e3' },
                  { name: 'Occasional Gaze Shift', value: engagement_distribution?.medium || 0, color: '#86868b' },
                  { name: 'Distracted', value: engagement_distribution?.low || 0, color: '#ff9500' }
                ].filter(d => d.value > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="var(--card)" strokeWidth={3} />
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
      <div className="bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-md border border-black/[0.08] dark:border-white/[0.08] px-3.5 py-2.5 rounded-2xl text-xs shadow-lg text-[#1d1d1f] dark:text-white">
        {label !== undefined && (
          <p className="text-[#86868b] mb-1">Minute: <span className="text-[#1d1d1f] dark:text-white font-semibold">{label}</span></p>
        )}
        <p className="font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].color || payload[0].fill }} />
          <span>{payload[0].name || 'Value'}: <span className="font-bold">{payload[0].value}</span> {unit || ''}</span>
        </p>
      </div>
    );
  }
  return null;
}

function ChartCard({ title, subtitle, height, children }) {
  return (
    <div className="bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]" style={{ minHeight: height + 70 }}>
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-[#1d1d1f] dark:text-white tracking-tight uppercase">{title}</h3>
        {subtitle && <p className="text-xs text-[#86868b] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1" style={{ height }}>{children}</div>
    </div>
  );
}

function ViolationRow({ violation, color }) {
  const percentage = violation.percentage || 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[#1d1d1f] dark:text-white font-medium truncate">{violation.type?.replace(/_/g, ' ')}</span>
          <span className="text-[#86868b] font-mono font-medium">{violation.count}</span>
        </div>
        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-xs font-mono text-[#86868b] w-12 text-right">{percentage.toFixed(1)}%</span>
    </div>
  );
}

export default React.memo(AnalyticsBoard);