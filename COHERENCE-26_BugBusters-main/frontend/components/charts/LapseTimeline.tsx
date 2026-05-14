'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'
import { Trajectory } from '@/lib/api'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props { trajectory: Trajectory }

interface MonthPoint { month: number; cumulative_rate: number; projected: boolean }

export default function LapseTimeline({ trajectory }: Props) {
  const data = trajectory.monthly_data.map((d: MonthPoint) => ({
    month: MONTHS[d.month - 1],
    actual: d.projected ? null : +(d.cumulative_rate * 100).toFixed(1),
    projected: d.projected ? +(d.cumulative_rate * 100).toFixed(1) : null,
  }))

  const riskColor = trajectory.risk_tier === 'HIGH'
    ? 'var(--red)' : trajectory.risk_tier === 'MEDIUM'
    ? 'var(--amber)' : 'var(--green)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            {trajectory.department} — {trajectory.district}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {trajectory.state} · Projected Final: {(trajectory.projected_final * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{
          padding: '4px 12px',
          background: riskColor === 'var(--red)' ? 'var(--red-dim)' : riskColor === 'var(--amber)' ? 'var(--amber-dim)' : 'var(--green-dim)',
          border: `1px solid ${riskColor}`,
          borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: riskColor,
        }}>
          {trajectory.risk_tier} RISK · {trajectory.lapse_risk_pct.toFixed(1)}% LAPSE
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--cyan)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--cyan)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradProjected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={riskColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={riskColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="month"
            tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
            }}
            formatter={(v: number) => [`${v}%`]} />
          <ReferenceLine y={100} stroke="var(--green)" strokeDasharray="4 4"
            label={{ value: 'Target', fill: 'var(--green)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
          <Area type="monotone" dataKey="actual" stroke="var(--cyan)" strokeWidth={2}
            fill="url(#gradActual)" name="Actual" connectNulls={false}
            dot={{ fill: 'var(--cyan)', r: 3, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="projected" stroke={riskColor} strokeWidth={2}
            strokeDasharray="5 3" fill="url(#gradProjected)" name="Projected"
            connectNulls={false} dot={false} />
          <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}