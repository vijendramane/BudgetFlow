'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, Anomaly } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'

type Severity = 'ALL' | 'CRITICAL' | 'WARNING'

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', WARNING: 'var(--amber)', NORMAL: 'var(--text-muted)',
}
const SEV_BG: Record<string, string> = {
  CRITICAL: 'var(--red-dim)', WARNING: 'var(--amber-dim)', NORMAL: 'transparent',
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function AnomaliesPage() {
  const { selectedYear } = useAppStore()
  const [severity, setSeverity] = useState<Severity>('ALL')

  const { data: anomalies = [], isLoading } = useSWR<Anomaly[]>(
    `/api/anomalies?year=${selectedYear}${severity !== 'ALL' ? `&severity=${severity}` : ''}&explain=true&limit=50`,
    fetcher, { revalidateOnFocus: false }
  )
  const { data: summary } = useSWR(`/api/anomalies/summary?year=${selectedYear}`, fetcher)

  const safeAnomalies = Array.isArray(anomalies) ? anomalies : []
  const critCount = safeAnomalies.filter(a => a.severity === 'CRITICAL').length
  const warnCount = safeAnomalies.filter(a => a.severity === 'WARNING').length

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
          Z-SCORE ENGINE · PEER COMPARISON
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>
          Anomaly Detection
        </h2>
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', animation: 'fadeUp 0.4s ease both' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 8 }}>TOTAL ANOMALIES</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, color: 'var(--cyan)' }}>
            {summary?.total_anomalies ?? '…'}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)' }}>◆ {summary?.critical_count ?? 0} CRITICAL</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)' }}>◆ {summary?.warning_count ?? 0} WARNING</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', animation: 'fadeUp 0.4s ease 50ms both' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 8 }}>TOP AFFECTED DEPARTMENTS</div>
          {(summary?.top_affected_departments ?? []).slice(0, 3).map((d: {department:string; count:number}, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{d.department}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>{d.count}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', animation: 'fadeUp 0.4s ease 100ms both' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 8 }}>TOP AFFECTED STATES</div>
          {(summary?.top_affected_states ?? []).slice(0, 3).map((s: {state:string; count:number}, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{s.state}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', fontWeight: 700 }}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Method strip */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '12px 18px', marginBottom: 20,
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>METHOD:</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
          z = (dept_utilization − peer_mean) / peer_std
        </div>
        <div style={{ height: 20, width: 1, background: 'var(--border)' }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>|z| &gt; 3.0 → CRITICAL</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber)' }}>|z| &gt; 2.0 → WARNING</div>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          Peers grouped by: department + state + month
        </div>
      </div>

      {/* Filter + count */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>FILTER:</span>
        {(['ALL', 'CRITICAL', 'WARNING'] as Severity[]).map(s => (
          <button key={s} onClick={() => setSeverity(s)} style={{
            padding: '5px 14px', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            background: severity === s
              ? (s === 'CRITICAL' ? 'var(--red-dim)' : s === 'WARNING' ? 'var(--amber-dim)' : 'var(--cyan-dim)')
              : 'var(--bg-card)',
            border: `1px solid ${severity === s
              ? (s === 'CRITICAL' ? 'rgba(239,68,68,0.4)' : s === 'WARNING' ? 'rgba(245,158,11,0.4)' : 'rgba(0,212,255,0.4)')
              : 'var(--border)'}`,
            color: severity === s
              ? (s === 'CRITICAL' ? 'var(--red)' : s === 'WARNING' ? 'var(--amber)' : 'var(--cyan)')
              : 'var(--text-secondary)',
          }}>
            {s}
            {s === 'CRITICAL' && critCount > 0 ? ` (${critCount})`
             : s === 'WARNING'  && warnCount > 0 ? ` (${warnCount})` : ''}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          SHOWING {safeAnomalies.length} ANOMALIES
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40 }}>
          <div className="spinner" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>Running z-score analysis...</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {safeAnomalies.map((a, i) => {
            const color = SEV_COLOR[a.severity] || 'var(--text-muted)'
            const bg    = SEV_BG[a.severity]   || 'transparent'
            const borderColor = a.severity === 'CRITICAL' ? 'rgba(239,68,68,0.35)' : a.severity === 'WARNING' ? 'rgba(245,158,11,0.25)' : 'var(--border)'
            return (
              <div key={`${a.exp_id}-${i}`} style={{
                background: 'var(--bg-card)', border: `1px solid ${borderColor}`,
                borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                animation: `fadeUp 0.3s ease ${i * 30}ms both`,
              }}>
                {/* Severity accent */}
                <div style={{ height: 3, background: color }} />
                <div style={{ padding: '14px 16px' }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {a.department}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
                        {a.district} · {a.state} · {MONTHS[(a.month ?? 1) - 1]} {a.year}
                      </div>
                    </div>
                    <div style={{
                      padding: '3px 8px', borderRadius: 4,
                      background: bg, border: `1px solid ${color}`,
                      fontFamily: 'var(--font-mono)', fontSize: 9, color, flexShrink: 0,
                    }}>
                      {a.severity}
                    </div>
                  </div>

                  {/* Scheme */}
                  {a.scheme && (
                    <div style={{
                      display: 'inline-block', padding: '2px 7px', marginBottom: 10,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                    }}>
                      {a.scheme}
                    </div>
                  )}

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                    {[
                      { label: 'UTILIZATION', value: `${a.utilization_rate.toFixed(1)}%`, color },
                      { label: 'PEER MEAN',   value: `${a.peer_mean.toFixed(1)}%`,        color: 'var(--text-secondary)' },
                      { label: 'Z-SCORE',     value: `${a.z_score.toFixed(2)}σ`,          color },
                    ].map(({ label, value, color: c }) => (
                      <div key={label} style={{ padding: '7px 8px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: c }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Deviation bar */}
                  <div style={{ marginBottom: a.explanation ? 10 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>DEVIATION FROM PEER</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color }}>
                        {a.z_score > 0 ? '+' : ''}{(a.utilization_rate - a.peer_mean).toFixed(1)}pp
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: 5, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                      <div style={{ position: 'absolute', left: '50%', top: -1, height: 7, width: 1, background: 'var(--border)' }} />
                      <div style={{
                        position: 'absolute', top: 0, height: '100%',
                        width: `${Math.min(Math.abs(a.z_score) * 8, 48)}%`,
                        background: color, borderRadius: 3, opacity: 0.8,
                        ...(a.z_score < 0 ? { right: '50%' } : { left: '50%' }),
                      }} />
                    </div>
                  </div>

                  {/* AI explanation */}
                  {a.explanation && (
                    <div style={{
                      padding: '8px 10px', background: 'var(--bg-secondary)',
                      borderRadius: 6, borderLeft: '2px solid var(--cyan)',
                      fontFamily: 'var(--font-body)', fontSize: 11,
                      color: 'var(--text-secondary)', lineHeight: 1.55,
                    }}>
                      {a.explanation}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {safeAnomalies.length === 0 && !isLoading && (
            <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              ✓ No anomalies detected for current filter
            </div>
          )}
        </div>
      )}
    </div>
  )
}