'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type ScoreBreakdown = {
  velocity: number
  scheme_deviation: number
  march_rush: number
  persistence: number
  parking: number
}

type AuditRisk = {
  state: string
  district: string
  department: string
  scheme: string
  budget_lakh: number
  audit_risk_score: number
  risk_score: number
  risk_tier: string
  intervention_urgency: string
  months_to_ponr: number
  catchup_feasible: boolean
  // Signal 1 - Velocity
  current_util_pct: number
  projected_util_pct: number
  velocity_trend: string
  recent_velocity_pct: number
  required_velocity_pct: number
  ponr_month: number
  // Signal 2 - Scheme
  scheme_expected_util_pct: number
  scheme_deviation_pct: number
  // Signal 3 - March Rush
  historical_rush_pct: number
  march_rush_probability: number
  rush_risk: string
  // Signal 4 - Persistence
  util_2023_pct: number
  util_2024_pct: number
  persistence_delta: number
  is_deteriorating: boolean
  // Signal 5 - Parking
  avg_release_month: number
  avg_spend_month: number
  lag_months: number
  // Objections
  primary_objection: string
  secondary_objections: string[]
  objection_text: string
  score_breakdown: ScoreBreakdown
}

type Summary = {
  total_departments: number
  critical_count: number
  high_risk_count: number
  medium_risk_count: number
  avg_audit_score: number
  ponr_count: number
  pct_march_rush_high: number
  pct_deteriorating: number
  avg_lag_months: number
  worst_state: string
  worst_department: string
  most_common_objection: string
  urgency_breakdown: Record<string, number>
  velocity_breakdown: Record<string, number>
  objection_breakdown: Record<string, number>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f59e0b',
  MEDIUM:   '#3b82f6',
  LOW:      '#10b981',
}

const URGENCY_COLOR: Record<string, string> = {
  POINT_OF_NO_RETURN: '#ef4444',
  IMMEDIATE:          '#f97316',
  THIS_MONTH:         '#f59e0b',
  NEXT_QUARTER:       '#3b82f6',
  MONITOR:            '#10b981',
}

const TREND_ICON: Record<string, string> = {
  FLATLINED:    '━',
  DECELERATING: '↘',
  STABLE:       '→',
  ACCELERATING: '↗',
}

const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const OBJECTION_SHORT: Record<string, string> = {
  IDLE_FUNDS:        'Idle Funds',
  RUSH_EXPENDITURE:  'Rush Spend',
  SLOW_PROGRESS:     'Slow Progress',
  SHORT_UTILIZATION: 'Short Util',
  ADVANCE_PENDING:   'Adv. Pending',
  UC_PENDING:        'UC Pending',
  DIVERSION:         'Diversion',
}

// ── Mini bar component ────────────────────────────────────────────────────────

function Bar({ value, max = 100, color = 'var(--cyan)', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{value.toFixed(1)}</span>
        </div>
      )}
      <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ── Persistence bar (side-by-side 2023 vs 2024) ───────────────────────────────

function PersistenceBar({ util23, util24 }: { util23: number; util24: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>FY23</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>FY24</span>
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${Math.min(100, util23)}%`, background: '#6366f1', borderRadius: 2 }} />
        </div>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${Math.min(100, util24)}%`,
            background: util24 < util23 ? '#ef4444' : '#10b981', borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#6366f1' }}>{util23.toFixed(1)}%</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12,
          color: util24 < util23 ? '#ef4444' : '#10b981' }}>{util24.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [risks, setRisks]       = useState<AuditRisk[]>([])
  const [summary, setSummary]   = useState<Summary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState<string>('ALL')
  const [sortBy, setSortBy]     = useState<string>('score')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.auditRisk(2024, 8),
      api.auditSummary(2024, 8),
    ])
      .then(([r, s]) => { 
        setRisks((r.risks ?? []) as unknown as AuditRisk[])
        setSummary((s.summary ?? s) as unknown as Summary) 
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const tierOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  let filtered = filter === 'ALL' ? risks
    : filter === 'PONR' ? risks.filter(r => r.intervention_urgency === 'POINT_OF_NO_RETURN')
    : filter === 'RUSH' ? risks.filter(r => r.rush_risk === 'HIGH')
    : filter === 'DETERIORATING' ? risks.filter(r => r.is_deteriorating)
    : risks.filter(r => r.risk_tier === filter)

  if (sortBy === 'score')   filtered = [...filtered].sort((a, b) => b.audit_risk_score - a.audit_risk_score)
  if (sortBy === 'lag')     filtered = [...filtered].sort((a, b) => b.lag_months - a.lag_months)
  if (sortBy === 'rush')    filtered = [...filtered].sort((a, b) => b.march_rush_probability - a.march_rush_probability)
  if (sortBy === 'persist') filtered = [...filtered].sort((a, b) => a.persistence_delta - b.persistence_delta)

  return (
    <div style={{ maxWidth: 1300 }}>

      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
          CAG AUDIT INTELLIGENCE · 5-SIGNAL RISK ENGINE · FY 2024-25 · AS OF AUGUST
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', margin: 0 }}>
          Department Audit Risk Dashboard
        </h2>
      </div>

      {/* TOP KPI STRIP */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'CRITICAL', value: summary.critical_count, color: '#ef4444', sub: 'depts' },
            { label: 'POINT OF NO RETURN', value: summary.ponr_count, color: '#ef4444', sub: 'depts' },
            { label: 'HIGH MARCH RUSH', value: `${summary.pct_march_rush_high}%`, color: '#f59e0b', sub: 'of depts' },
            { label: 'DETERIORATING', value: `${summary.pct_deteriorating}%`, color: '#f97316', sub: 'YoY worse' },
            { label: 'AVG FUND LAG', value: `${summary.avg_lag_months}m`, color: '#a855f7', sub: 'release→spend' },
            { label: 'AVG RISK SCORE', value: summary.avg_audit_score, color: 'var(--cyan)', sub: '/ 100' },
          ].map(c => (
            <div key={c.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 14px'
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* VELOCITY + URGENCY breakdown row */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>

          {/* Velocity distribution */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.1em' }}>SPENDING VELOCITY DISTRIBUTION</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(summary.velocity_breakdown).map(([v, count]) => (
                <div key={v} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
                    color: v === 'FLATLINED' ? '#ef4444' : v === 'DECELERATING' ? '#f59e0b' : v === 'ACCELERATING' ? '#10b981' : 'var(--text-secondary)'
                  }}>{count}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {TREND_ICON[v]} {v.slice(0, 5)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Urgency distribution */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.1em' }}>INTERVENTION URGENCY</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(summary.urgency_breakdown).filter(([,v]) => v > 0).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: URGENCY_COLOR[k] ?? '#888', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: URGENCY_COLOR[k] ?? '#888' }}>{v}</span>
                  <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${(v / (summary.total_departments || 1)) * 100}%`, background: URGENCY_COLOR[k], borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FILTER BAR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>FILTER:</span>
        {[
          { key: 'ALL',          label: 'All' },
          { key: 'CRITICAL',     label: '🔴 Critical' },
          { key: 'HIGH',         label: '🟡 High' },
          { key: 'PONR',         label: '⛔ No Return' },
          { key: 'RUSH',         label: '⚡ March Rush' },
          { key: 'DETERIORATING',label: '📉 Deteriorating' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, padding: '4px 10px',
            borderRadius: 14, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            background: filter === f.key ? 'var(--cyan)' : 'var(--bg-card)',
            color: filter === f.key ? '#000' : 'var(--text-muted)',
          }}>{f.label}</button>
        ))}

        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>SORT:</span>
        {[
          { key: 'score',   label: 'Risk Score' },
          { key: 'lag',     label: 'Fund Lag' },
          { key: 'rush',    label: 'Rush Prob' },
          { key: 'persist', label: 'YoY Δ' },
        ].map(s => (
          <button key={s.key} onClick={() => setSortBy(s.key)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, padding: '4px 10px',
            borderRadius: 14, border: 'none', cursor: 'pointer',
            background: sortBy === s.key ? 'rgba(0,212,255,0.15)' : 'var(--bg-card)',
            color: sortBy === s.key ? 'var(--cyan)' : 'var(--text-muted)',
          }}>{s.label}</button>
        ))}

        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} departments
        </span>
      </div>

      {/* RISK LIST */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr 90px 90px 90px 90px 90px 32px',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          gap: 8,
        }}>
          {['SCORE', 'DEPARTMENT', 'VELOCITY', 'SCHEME DEV', 'MARCH RUSH', 'YoY PERSIST', 'FUND LAG', ''].map(h => (
            <div key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)' }}>
            ◌ Running 5-signal audit analysis...
          </div>
        ) : (
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {filtered.map((r, i) => (
              <div key={i} style={{
                borderBottom: '1px solid var(--border)',
                background: expanded === i ? 'rgba(0,212,255,0.03)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => setExpanded(expanded === i ? null : i)}
              >

                {/* SUMMARY ROW */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr 90px 90px 90px 90px 90px 32px',
                  padding: '10px 16px', gap: 8, alignItems: 'center',
                }}>

                  {/* Score */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: `2px solid ${TIER_COLOR[r.risk_tier]}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: TIER_COLOR[r.risk_tier] }}>
                      {(r.audit_risk_score ?? 0).toFixed(0)}
                    </span>
                  </div>

                  {/* Dept info */}
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cyan)', marginBottom: 3 }}>
                      {r.department} · {r.district}, {r.state}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 6px',
                        borderRadius: 3, background: `${TIER_COLOR[r.risk_tier]}22`,
                        color: TIER_COLOR[r.risk_tier]
                      }}>{r.risk_tier}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 6px',
                        borderRadius: 3, background: `${URGENCY_COLOR[r.intervention_urgency] ?? '#888'}22`,
                        color: URGENCY_COLOR[r.intervention_urgency] ?? '#888'
                      }}>{r.intervention_urgency?.replace(/_/g, ' ')}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                        {OBJECTION_SHORT[r.primary_objection] ?? r.primary_objection}
                      </span>
                    </div>
                  </div>

                  {/* Signal 1: Velocity */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11,
                        color: r.velocity_trend === 'FLATLINED' ? '#ef4444'
                          : r.velocity_trend === 'DECELERATING' ? '#f59e0b'
                          : r.velocity_trend === 'ACCELERATING' ? '#10b981' : 'var(--text-muted)'
                      }}>{TREND_ICON[r.velocity_trend]}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
                        {(r.current_util_pct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      proj {(r.projected_util_pct ?? 0).toFixed(0)}%
                    </div>
                  </div>

                  {/* Signal 2: Scheme deviation */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 3,
                      color: (r.scheme_deviation_pct ?? 0) < -20 ? '#ef4444'
                        : (r.scheme_deviation_pct ?? 0) < -10 ? '#f59e0b' : '#10b981'
                    }}>
                      {(r.scheme_deviation_pct ?? 0) > 0 ? '+' : ''}{(r.scheme_deviation_pct ?? 0).toFixed(1)}pp
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      vs {(r.scheme_expected_util_pct ?? 0).toFixed(0)}% exp
                    </div>
                  </div>

                  {/* Signal 3: March Rush */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 3,
                      color: r.rush_risk === 'HIGH' ? '#ef4444' : r.rush_risk === 'MEDIUM' ? '#f59e0b' : '#10b981'
                    }}>
                      {(r.march_rush_probability ?? 0).toFixed(0)}%
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      hist {(r.historical_rush_pct ?? 0).toFixed(0)}% in Q4
                    </div>
                  </div>

                  {/* Signal 4: Persistence */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 3,
                      color: r.is_deteriorating ? '#ef4444' : (r.persistence_delta ?? 0) > 5 ? '#10b981' : 'var(--text-muted)'
                    }}>
                      {(r.persistence_delta ?? 0) > 0 ? '+' : ''}{(r.persistence_delta ?? 0).toFixed(1)}pp
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.is_deteriorating ? '↘ worse' : '→ stable'}
                    </div>
                  </div>

                  {/* Signal 5: Parking lag */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 3,
                      color: (r.lag_months ?? 0) > 3 ? '#ef4444' : (r.lag_months ?? 0) > 1.5 ? '#f59e0b' : '#10b981'
                    }}>
                      {(r.lag_months ?? 0).toFixed(1)}m
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      lag
                    </div>
                  </div>

                  {/* Expand */}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded === i ? '▲' : '▼'}</span>
                </div>

                {/* ── EXPANDED DETAIL ─────────────────────────────── */}
                {expanded === i && (
                  <div style={{ padding: '0 16px 18px 68px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ paddingTop: 14 }}>

                      {/* Objection full text */}
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 12, color: '#f59e0b',
                        marginBottom: 14, padding: '8px 12px',
                        background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #f59e0b',
                        borderRadius: '0 4px 4px 0',
                      }}>
                        ⚠ PRIMARY OBJECTION: {r.objection_text}
                        {r.secondary_objections?.length > 0 && (
                          <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                            Also risk: {r.secondary_objections.map(o => OBJECTION_SHORT[o] ?? o).join(' · ')}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 16 }}>

                        {/* Signal 1: Velocity detail */}
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 8 }}>① VELOCITY</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                              { label: 'Current Util',    val: `${(r.current_util_pct ?? 0).toFixed(1)}%` },
                              { label: 'Projected EOY',   val: `${(r.projected_util_pct ?? 0).toFixed(1)}%` },
                              { label: 'Recent vel/mo',   val: `${(r.recent_velocity_pct ?? 0).toFixed(2)}%` },
                              { label: 'Required vel/mo', val: `${(r.required_velocity_pct ?? 0).toFixed(2)}%` },
                              { label: 'Catchup feasible', val: r.catchup_feasible ? '✓ Yes' : '✗ No' },
                              { label: 'PoNR month',      val: r.ponr_month > 0 ? MONTH_NAMES[r.ponr_month] : 'Passed' },
                            ].map(m => (
                              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{m.val}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Signal 2: Scheme deviation */}
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 8 }}>② SCHEME BENCHMARK</div>
                          <div style={{ marginBottom: 10 }}>
                            <Bar value={r.current_util_pct ?? 0} label="Actual util" color="var(--cyan)" />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <Bar value={r.scheme_expected_util_pct ?? 0} label="Expected (scheme norm)" color="rgba(255,255,255,0.2)" />
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, marginTop: 6,
                            color: (r.scheme_deviation_pct ?? 0) < 0 ? '#ef4444' : '#10b981'
                          }}>
                            Gap: {(r.scheme_deviation_pct ?? 0) > 0 ? '+' : ''}{(r.scheme_deviation_pct ?? 0).toFixed(1)}pp vs {r.scheme} norm
                          </div>
                        </div>

                        {/* Signal 3: March Rush */}
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 8 }}>③ MARCH RUSH RISK</div>
                          <div style={{ marginBottom: 8 }}>
                            <Bar value={r.historical_rush_pct ?? 0} label="2023 Q4 spend share" color="#f59e0b" />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <Bar value={r.march_rush_probability ?? 0} label="2024 rush probability" color="#ef4444" />
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                            {(r.historical_rush_pct ?? 0) > 65
                              ? `Historically ${(r.historical_rush_pct ?? 0).toFixed(0)}% spend in Oct-Dec`
                              : 'Spending pattern within norms'}
                          </div>
                        </div>

                        {/* Signal 4: Persistence */}
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 8 }}>④ YoY PERSISTENCE</div>
                          <PersistenceBar util23={r.util_2023_pct ?? 0} util24={r.util_2024_pct ?? 0} />
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 8,
                            color: r.is_deteriorating ? '#ef4444' : '#10b981'
                          }}>
                            {r.is_deteriorating
                              ? `⚠ Worse by ${Math.abs(r.persistence_delta ?? 0).toFixed(1)}pp YoY`
                              : `Stable or improving`}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {(r.util_2023_pct ?? 0) < 35 && (r.util_2024_pct ?? 0) < 35 ? '⚠ Both years below 35% — systemic' : ''}
                          </div>
                        </div>

                        {/* Signal 5: Parking */}
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 8 }}>⑤ FUND PARKING</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                            {[
                              { label: 'Avg release month', val: MONTH_NAMES[Math.round(r.avg_release_month ?? 6)] },
                              { label: 'Avg spend month',   val: MONTH_NAMES[Math.round(r.avg_spend_month ?? 6)] },
                              { label: 'Lag',              val: `${(r.lag_months ?? 0).toFixed(1)} months` },
                            ].map(m => (
                              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{m.val}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{
                            fontFamily: 'var(--font-mono)', fontSize: 12, color: (r.lag_months ?? 0) > 3 ? '#ef4444' : 'var(--text-muted)'
                          }}>
                            {(r.lag_months ?? 0) > 3 ? '⚠ Funds parked for 3+ months after release' : 'Release-spend timing acceptable'}
                          </div>
                        </div>
                      </div>

                      {/* Score breakdown */}
                      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.1em' }}>
                          COMPOSITE SCORE BREAKDOWN (total: {(r.audit_risk_score ?? 0).toFixed(1)})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                          {r.score_breakdown && Object.entries({
                            'Velocity\n(25%)':    r.score_breakdown.velocity,
                            'Scheme Dev\n(20%)':  r.score_breakdown.scheme_deviation,
                            'March Rush\n(20%)':  r.score_breakdown.march_rush,
                            'Persistence\n(20%)': r.score_breakdown.persistence,
                            'Parking\n(15%)':     r.score_breakdown.parking,
                          }).map(([label, val]) => (
                            <div key={label}>
                              <Bar value={val ?? 0} max={25} label={label.split('\n')[0]} color="var(--cyan)" />
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2, textAlign: 'center' }}>
                                {label.split('\n')[1]}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 16, color: '#ef4444', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}
    </div>
  )
}