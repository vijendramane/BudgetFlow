'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, api, Trajectory, LapseRisk } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import LapseTimeline from '@/components/charts/LapseTimeline'
import PatternBadge from '@/components/shared/PatternBadge'
import ConfidenceInterval from '@/components/shared/ConfidenceInterval'

type Tier = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'

const TIER_COLOR: Record<string, string> = {
  HIGH: 'var(--red)', MEDIUM: 'var(--amber)', LOW: 'var(--green)',
}
const TIER_BG: Record<string, string> = {
  HIGH: 'var(--red-dim)', MEDIUM: 'var(--amber-dim)', LOW: 'var(--green-dim)',
}

const URGENCY_COLOR: Record<string, string> = {
  IMMEDIATE: 'var(--red)', HIGH: 'var(--amber)', MEDIUM: '#eab308', LOW: 'var(--green)',
}

function fmtCr(n: number) { return `₹${(n / 1e7).toFixed(1)}Cr` }

export default function ForecastPage() {
  const { selectedYear, selectedMonth } = useAppStore()
  const [tier, setTier]             = useState<Tier>('ALL')
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null)
  const [selected, setSelected]     = useState<LapseRisk | null>(null)
  const [trajLoading, setTrajLoading] = useState(false)

  const swrKey = `/api/forecast/lapse-risks?year=${selectedYear}&as_of_month=${selectedMonth}${tier !== 'ALL' ? `&risk_tier=${tier}` : ''}`
  const { data: risks = [], isLoading, error } = useSWR<LapseRisk[]>(swrKey, fetcher, { revalidateOnFocus: false })

  const tierCounts = {
    HIGH:   risks.filter(r => r.risk_tier === 'HIGH').length,
    MEDIUM: risks.filter(r => r.risk_tier === 'MEDIUM').length,
    LOW:    risks.filter(r => r.risk_tier === 'LOW').length,
  }

  const loadTrajectory = async (risk: LapseRisk) => {
    setSelected(risk)
    setTrajLoading(true)
    try { setTrajectory(await api.trajectory(risk.department, risk.district, risk.state, selectedYear)) }
    catch { setTrajectory(null) }
    finally { setTrajLoading(false) }
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
          LINEAR TRAJECTORY PROJECTION · AS OF MONTH {selectedMonth}
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>
          Fund Lapse Forecasting
        </h2>
      </div>

      {/* Risk tier cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {(['HIGH', 'MEDIUM', 'LOW'] as const).map(t => (
          <button key={t} onClick={() => setTier(t === tier ? 'ALL' : t)} style={{
            background: tier === t ? TIER_BG[t] : 'var(--bg-card)',
            border: `1px solid ${tier === t ? TIER_COLOR[t] : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)', padding: '16px 18px',
            textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: TIER_COLOR[t], letterSpacing: '0.1em', marginBottom: 6 }}>
              {t} RISK
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: TIER_COLOR[t] }}>
              {tierCounts[t]}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {t === 'HIGH' ? '>60% projected lapse' : t === 'MEDIUM' ? '30–60% projected lapse' : '<30% projected lapse'}
            </div>
          </button>
        ))}
      </div>

      {/* Method strip */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '12px 18px', marginBottom: 20,
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>METHOD:</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
          monthly_rate = cumulative / months_elapsed
        </div>
        <div style={{ height: 20, width: 1, background: 'var(--border)' }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
          projected_final = rate × 12
        </div>
        {/* Pattern legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <PatternBadge pattern="flatline" />
          <PatternBadge pattern="march_rush" />
          <PatternBadge pattern="normal" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Risk registry */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>LAPSE RISK REGISTRY</span>
            <span style={{ color: 'var(--cyan)' }}>{risks.length} ENTRIES</span>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24 }}>
              <div className="spinner" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Projecting trajectories...
              </span>
            </div>
          ) : error ? (
            <div style={{ padding: 20, color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              ⚠ Failed to load lapse risks
            </div>
          ) : (
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {risks.map((risk, i) => {
                const color = TIER_COLOR[risk.risk_tier]
                const isSelected = selected?.department === risk.department && selected?.district === risk.district
                const hasCI = risk.confidence_interval && risk.confidence_interval.length === 2

                return (
                  <div
                    key={`${risk.department}-${risk.district}-${i}`}
                    onClick={() => loadTrajectory(risk)}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--bg-hover)' : 'transparent',
                      transition: 'background 0.15s',
                      animation: `fadeUp 0.3s ease ${i * 35}ms both`,
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {/* Row header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                          {risk.department}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                          {risk.district}, {risk.state}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div style={{
                          padding: '2px 7px', borderRadius: 3,
                          background: TIER_BG[risk.risk_tier], border: `1px solid ${color}`,
                          fontSize: 9, fontFamily: 'var(--font-mono)', color,
                        }}>
                          {risk.risk_tier}
                        </div>
                        {/* Urgency badge */}
                        {risk.urgency && risk.urgency !== 'LOW' && (
                          <div style={{
                            fontSize: 8, fontFamily: 'var(--font-mono)',
                            color: URGENCY_COLOR[risk.urgency] || 'var(--text-muted)',
                            letterSpacing: '0.06em',
                          }}>
                            ⚡ {risk.urgency}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pattern badge row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {risk.pattern && <PatternBadge pattern={risk.pattern} />}
                      {risk.confidence_level && (
                        <span style={{
                          fontSize: 9, fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)', padding: '1px 6px',
                          background: 'var(--bg-secondary)', borderRadius: 3,
                          border: '1px solid var(--border)',
                        }}>
                          {risk.confidence_level} CONFIDENCE
                        </span>
                      )}
                    </div>

                    {/* Confidence interval OR plain stats */}
                    {hasCI ? (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 4 }}>
                          LAPSE RISK RANGE
                        </div>
                        <ConfidenceInterval
                          low={risk.confidence_interval![0]}
                          high={risk.confidence_interval![1]}
                          current={risk.lapse_risk_pct}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>LAPSE RISK</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color }}>{risk.lapse_risk_pct.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>PROJECTED</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {(risk.projected_final * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>ALLOCATED</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {fmtCr(risk.budget_allocated)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Intervention window */}
                    {risk.months_of_data !== undefined && (
                      <div style={{
                        marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 8,
                        color: 'var(--text-muted)', display: 'flex', gap: 10,
                      }}>
                        <span>{risk.months_of_data} months of data</span>
                        <span>·</span>
                        <span style={{ color: risk.lapse_risk_pct > 60 ? 'var(--red)' : 'var(--text-muted)' }}>
                          {12 - (risk.as_of_month ?? selectedMonth)} months remaining
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
              {risks.length === 0 && (
                <div style={{ padding: 24, color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  ✓ No lapse risks for current filter
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trajectory panel */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '18px 20px',
        }}>
          {!selected && (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              <span style={{ fontSize: 32, opacity: 0.3 }}>◉</span>
              <span>Select a department to view trajectory</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <PatternBadge pattern="flatline" />
                <PatternBadge pattern="march_rush" />
                <PatternBadge pattern="normal" />
              </div>
            </div>
          )}

          {selected && trajLoading && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div className="spinner" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                Loading trajectory...
              </span>
            </div>
          )}

          {selected && !trajLoading && trajectory && (
            <>
              {/* Selected dept summary */}
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14,
                paddingBottom: 12, borderBottom: '1px solid var(--border)',
              }}>
                {selected.pattern && <PatternBadge pattern={selected.pattern} />}
                {selected.confidence_interval && (
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 3 }}>
                      LAPSE RANGE
                    </div>
                    <ConfidenceInterval
                      low={selected.confidence_interval[0]}
                      high={selected.confidence_interval[1]}
                      current={selected.lapse_risk_pct}
                    />
                  </div>
                )}
                {selected.pattern_description && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', maxWidth: 140, textAlign: 'right' }}>
                    {selected.pattern_description.slice(0, 80)}…
                  </div>
                )}
              </div>
              <LapseTimeline trajectory={trajectory} />
            </>
          )}

          {selected && !trajLoading && !trajectory && (
            <div style={{ padding: 20, color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              ⚠ Could not load trajectory data
            </div>
          )}
        </div>
      </div>
    </div>
  )
}