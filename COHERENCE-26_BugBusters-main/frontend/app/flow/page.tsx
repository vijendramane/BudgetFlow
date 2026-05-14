'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'

const SankeyFlow = dynamic(() => import('@/components/charts/SankeyFlow'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div className="spinner" />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-muted)' }}>Building fund flow graph...</span>
    </div>
  ),
})

const STATES = ['All States', 'Maharashtra', 'Uttar Pradesh', 'Rajasthan', 'Madhya Pradesh', 'Karnataka']
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', HIGH: 'var(--amber)', MEDIUM: '#eab308', NORMAL: 'var(--green)',
}

function fmtCr(n: number) { return `₹${(n / 1e7).toFixed(1)}Cr` }
function fmtL(n: number)  { return `₹${(n / 1e5).toFixed(1)}L` }

export default function FlowPage() {
  const { selectedYear } = useAppStore()
  const [stateFilter, setStateFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'sankey' | 'edges' | 'state'>('sankey')

  const sankeyKey   = `/api/flow/sankey?year=${selectedYear}${stateFilter ? `&state=${encodeURIComponent(stateFilter)}` : ''}`
  const summaryKey  = `/api/flow/summary?year=${selectedYear}`
  const edgesKey    = `/api/flow/leakage-edges?year=${selectedYear}&min_score=5${stateFilter ? `&state=${encodeURIComponent(stateFilter)}` : ''}`

  const { data: sankey,  isLoading: sankeyLoading  } = useSWR(sankeyKey,  fetcher, { revalidateOnFocus: false })
  const { data: summary                             } = useSWR(summaryKey, fetcher)
  const { data: edges = [], isLoading: edgesLoading } = useSWR(edgesKey,   fetcher, { revalidateOnFocus: false })

  // Per-state summary from edges
  const stateStats: Record<string, { released: number; received: number; gap: number; count: number }> = {}
  ;(Array.isArray(edges) ? edges : []).forEach((e: { state: string; amount_released: number; amount_received: number; gap_amount: number }) => {
    if (!stateStats[e.state]) stateStats[e.state] = { released: 0, received: 0, gap: 0, count: 0 }
    stateStats[e.state].released  += e.amount_released
    stateStats[e.state].received  += e.amount_received
    stateStats[e.state].gap       += e.gap_amount
    stateStats[e.state].count     += 1
  })
  const stateRows = Object.entries(stateStats)
    .map(([state, s]) => ({ state, ...s, absorption: s.released > 0 ? s.received / s.released : 1 }))
    .sort((a, b) => a.absorption - b.absorption)

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
          DIRECTED GRAPH ANALYSIS · ABSORPTION RATIOS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>
            Fund Flow Analysis
          </h2>
          {/* State selector */}
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value === 'All States' ? '' : e.target.value)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: stateFilter ? 'var(--cyan)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 13,
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer', outline: 'none',
            }}
          >
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'TOTAL RELEASED', value: summary ? fmtCr(summary.total_released)    : '…', color: 'var(--cyan)',  sub: 'Central disbursement' },
          { label: 'TOTAL RECEIVED', value: summary ? fmtCr(summary.total_received)    : '…', color: 'var(--green)', sub: 'State absorption' },
          { label: 'TOTAL GAP',      value: summary ? fmtCr(summary.total_gap_amount)  : '…', color: 'var(--red)',   sub: 'Unabsorbed funds' },
          { label: 'LEAKAGE EDGES',  value: String(summary?.leakage_edge_count ?? '…'),        color: 'var(--amber)', sub: 'Flagged transfers' },
        ].map(({ label, value, color, sub }, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '14px 18px',
            animation: `fadeUp 0.4s ease ${i * 50}ms both`,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color }}>{value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Absorption bar */}
      {summary && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 20,
          animation: 'fadeUp 0.4s ease 200ms both',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)' }}>AVERAGE ABSORPTION RATIO</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>
              {(summary.avg_absorption_ratio * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(summary.avg_absorption_ratio * 100, 100)}%`,
              background: 'linear-gradient(90deg, var(--cyan)88, var(--cyan))',
              borderRadius: 4, transition: 'width 1s ease',
            }} />
          </div>
          {/* Leakage legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {[['CRITICAL', 'var(--red)', '<70%'], ['HIGH', 'var(--amber)', '70–85%'], ['MEDIUM', '#eab308', '85–92%'], ['NORMAL', 'var(--green)', '>92%']].map(([label, color, range]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{label} {range}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { id: 'sankey', label: 'Fund Flow Graph' },
          { id: 'state',  label: 'State Comparison' },
          { id: 'edges',  label: 'Leakage Edges' },
        ] as { id: typeof activeTab; label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '8px 18px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
            fontFamily: 'var(--font-mono)', fontSize: 13,
            background: activeTab === tab.id ? 'var(--cyan-dim)' : 'var(--bg-card)',
            border: `1px solid ${activeTab === tab.id ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
            color: activeTab === tab.id ? 'var(--cyan)' : 'var(--text-secondary)',
          }}>
            {tab.label}
            {tab.id === 'edges' && Array.isArray(edges) && edges.length > 0 && (
              <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 10, background: 'var(--red-dim)', color: 'var(--red)', fontSize: 9 }}>
                {edges.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Sankey ── */}
      {activeTab === 'sankey' && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '18px 20px', overflow: 'hidden',
          animation: 'fadeUp 0.3s ease both',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 14 }}>
            {stateFilter ? `FUND FLOW · ${stateFilter.toUpperCase()}` : 'NATIONAL FUND FLOW · ALL STATES'} · VALUES IN LAKHS
          </div>
          {sankeyLoading ? (
            <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div className="spinner" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>Building graph...</span>
            </div>
          ) : sankey?.nodes?.length > 0 ? (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <SankeyFlow data={{ nodes: sankey.nodes, links: sankey.links }} height={460} />
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 8 }}>
              No flow data for selected filter
            </div>
          )}
        </div>
      )}

      {/* ── Tab: State Comparison ── */}
      {activeTab === 'state' && (
        <div style={{ animation: 'fadeUp 0.3s ease both' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 16 }}>
            {stateRows.map((row, i) => {
              const absColor = row.absorption < 0.70 ? 'var(--red)' : row.absorption < 0.85 ? 'var(--amber)' : row.absorption < 0.92 ? '#eab308' : 'var(--green)'
              return (
                <div key={row.state} onClick={() => setStateFilter(row.state)} style={{
                  background: stateFilter === row.state ? 'var(--cyan-dim)' : 'var(--bg-card)',
                  border: `1px solid ${stateFilter === row.state ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)', padding: '14px 16px', cursor: 'pointer',
                  animation: `fadeUp 0.3s ease ${i * 40}ms both`, transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{row.state}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{row.count} leakage edges</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: absColor }}>
                      {(row.absorption * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {[
                      { label: 'RELEASED', value: fmtCr(row.released), color: 'var(--cyan)'  },
                      { label: 'RECEIVED', value: fmtCr(row.received), color: 'var(--green)' },
                      { label: 'GAP',      value: fmtCr(row.gap),      color: absColor        },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 5, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${row.absorption * 100}%`, background: absColor, borderRadius: 3, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
          {stateFilter && (
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => { setStateFilter(''); setActiveTab('sankey') }} style={{
                padding: '8px 20px', background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.35)',
                borderRadius: 8, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
              }}>
                → View {stateFilter} Flow Graph
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Leakage Edges ── */}
      {activeTab === 'edges' && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          animation: 'fadeUp 0.3s ease both',
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              LEAKAGE EDGES · SORTED BY ABSORPTION RATIO
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)' }}>
              {Array.isArray(edges) ? edges.length : 0} FLAGGED
            </div>
          </div>

          {edgesLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24 }}>
              <div className="spinner" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>Scanning edges...</span>
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 90px 90px 90px 90px',
                padding: '8px 18px', borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em',
              }}>
                <span>FROM</span><span>TO</span><span>RELEASED</span><span>RECEIVED</span><span>GAP</span><span>ABSORPTION</span>
              </div>

              {(Array.isArray(edges) ? edges : []).map((edge: {
                from_entity: string; to_entity: string; state: string
                amount_released: number; amount_received: number
                gap_amount: number; absorption_ratio: number
                leakage_score: number; severity?: string
              }, i: number) => {
                const absorption = edge.absorption_ratio * 100
                const severity = edge.severity || (absorption < 70 ? 'CRITICAL' : absorption < 85 ? 'HIGH' : 'MEDIUM')
                const color = SEVERITY_COLOR[severity] || 'var(--amber)'
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 90px 90px 90px 90px',
                    padding: '10px 18px', borderBottom: '1px solid var(--border)',
                    alignItems: 'center', animation: `fadeUp 0.3s ease ${i * 25}ms both`,
                  }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{edge.from_entity}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{edge.state}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{edge.to_entity}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtL(edge.amount_released)}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtL(edge.amount_received)}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtL(edge.gap_amount)}</div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                      borderRadius: 4, background: `${color}15`, border: `1px solid ${color}40`,
                      fontFamily: 'var(--font-mono)', fontSize: 10, color,
                    }}>
                      {absorption.toFixed(1)}%
                    </div>
                  </div>
                )
              })}
              {(!Array.isArray(edges) || edges.length === 0) && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  ✓ No leakage edges above threshold
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}