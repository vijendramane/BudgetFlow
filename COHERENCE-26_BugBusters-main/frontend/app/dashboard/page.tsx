'use client'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import KPICard from '@/components/cards/KPICard'
import MorningBriefing from '@/components/dashboard/MorningBriefing'

const SankeyFlow = dynamic(() => import('@/components/charts/SankeyFlow'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div className="spinner" />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Building graph...</span>
    </div>
  ),
})

function fmtCr(n: number) { return `₹${(n / 1e7).toFixed(1)}Cr` }

export default function DashboardPage() {
  const { selectedYear } = useAppStore()
  const { data: overview, isLoading: ovLoading } = useSWR(`/api/overview?year=${selectedYear}`, fetcher, { refreshInterval: 30000 })
  const { data: flow } = useSWR(`/api/flow/summary?year=${selectedYear}`, fetcher)
  const { data: sankey } = useSWR(`/api/flow/sankey?year=${selectedYear}`, fetcher)

  const health = overview?.health_score ?? 0
  const healthColor = health >= 80 ? 'var(--green)' : health >= 60 ? 'var(--amber)' : 'var(--red)'

  return (
    <div style={{ maxWidth: 1200 }}>
      <MorningBriefing />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) 200px', gap: 14, marginBottom: 20 }}>
        <KPICard label="TOTAL ALLOCATED" accent="cyan"   value={ovLoading ? '…' : fmtCr(overview?.total_allocated ?? 0)} delay={0}   />
        <KPICard label="TOTAL RELEASED"  accent="purple" value={ovLoading ? '…' : fmtCr(overview?.total_released ?? 0)}  delay={40}  />
        <KPICard label="TOTAL SPENT"     accent="green"  value={ovLoading ? '…' : fmtCr(overview?.total_spent ?? 0)}     delay={80}
          trend={overview?.overall_absorption_pct ? (overview.overall_absorption_pct >= 85 ? 'up' : overview.overall_absorption_pct >= 60 ? 'neutral' : 'down') : undefined} />
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeUp 0.4s ease 120ms both',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 8 }}>HEALTH SCORE</div>
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <svg width={80} height={80} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={40} cy={40} r={32} fill="none" stroke="var(--bg-secondary)" strokeWidth={7} />
              <circle cx={40} cy={40} r={32} fill="none" stroke={healthColor} strokeWidth={7}
                strokeDasharray={`${(health/100)*201} 201`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: healthColor, lineHeight: 1 }}>{health}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: healthColor, marginTop: 2 }}>
                {health >= 80 ? 'HEALTHY' : health >= 60 ? 'MOD' : 'CRIT'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <KPICard label="LEAKAGE EDGES"      accent="red"   value={String(overview?.leakage_edges_count ?? '…')}      delay={120} />
        <KPICard label="CRITICAL ANOMALIES" accent="amber" value={String(overview?.critical_anomalies_count ?? '…')} delay={160} />
        <KPICard label="HIGH LAPSE RISK"    accent="red"   value={String(overview?.high_lapse_risk_count ?? '…')}    delay={200} />
      </div>

      {/* Absorption pipeline */}
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'18px 20px', marginBottom:20, animation:'fadeUp 0.4s ease 240ms both' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', letterSpacing:'0.08em', marginBottom:14 }}>ABSORPTION PIPELINE</div>
        {[
          { label:'Allocated → Released', pct: flow?.avg_absorption_ratio ? Math.min(flow.avg_absorption_ratio * 120, 100) : 0, color:'var(--cyan)' },
          { label:'Released → Absorbed',  pct: overview?.overall_absorption_pct ?? 0, color:'var(--purple)' },
          { label:'Allocated → Spent',    pct: overview ? (overview.total_spent / Math.max(overview.total_allocated, 1)) * 100 : 0, color:'var(--green)' },
        ].map(({ label, pct, color }, i) => (
          <div key={i} style={{ marginBottom: i < 2 ? 12 : 0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color }}>{pct.toFixed(1)}%</span>
            </div>
            <div style={{ height:7, background:'var(--bg-secondary)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:`linear-gradient(90deg,${color}88,${color})`, borderRadius:4, transition:'width 1s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Coverage stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'STATES',       value: overview?.states_covered ?? '…',      color:'var(--cyan)' },
          { label:'DEPARTMENTS',  value: overview?.departments_covered ?? '…',  color:'var(--purple)' },
          { label:'ABSORPTION %', value: overview ? `${overview.overall_absorption_pct?.toFixed(1)}%` : '…', color:'var(--green)' },
          { label:'UTILIZATION %',value: overview ? `${overview.overall_utilization_pct?.toFixed(1)}%` : '…', color:'var(--amber)' },
        ].map(({ label, value, color }, i) => (
          <div key={i} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 16px', animation:`fadeUp 0.4s ease ${280+i*40}ms both` }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginBottom:6 }}>{label}</div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:24, color }}>{value}</div>
          </div>
        ))}
      </div>

      {sankey && sankey.nodes?.length > 0 && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'18px 20px', animation:'fadeUp 0.4s ease 400ms both' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', letterSpacing:'0.08em', marginBottom:12 }}>FUND FLOW OVERVIEW</div>
          <SankeyFlow data={sankey} />
        </div>
      )}
    </div>
  )
}