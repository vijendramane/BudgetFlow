'use client'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':    { title: 'National Overview',      subtitle: 'Budget health & KPI summary' },
  '/flow':         { title: 'Fund Flow Analysis',     subtitle: 'Sankey graph + leakage detection' },
  '/anomalies':    { title: 'Anomaly Detection',      subtitle: 'Z-score peer comparison engine' },
  '/forecast':     { title: 'Lapse Forecasting',      subtitle: 'Linear trajectory projection' },
  '/reallocation': { title: 'Fund Reallocation',      subtitle: 'Simulate budget transfers' },
  '/actions':      { title: 'Action Queue',           subtitle: 'Pre-justified transfer orders' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function TopBar() {
  const path = usePathname()
  const meta = PAGE_META[path] ?? { title: 'BudgetFlow', subtitle: '' }
  const { selectedYear, selectedMonth, setYear, setMonth } = useAppStore()

  return (
    <header style={{
      height: 60, background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16, flexShrink: 0,
    }}>
      <div style={{ flex: 1 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {meta.title}
        </h1>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', marginTop: 1 }}>
          {meta.subtitle.toUpperCase()}
        </div>
      </div>

      {/* Year selector */}
      <select value={selectedYear} onChange={e => setYear(Number(e.target.value))}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
          fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', outline: 'none',
        }}>
        <option value={2024}>FY 2024</option>
        <option value={2023}>FY 2023</option>
      </select>

      {/* Month selector */}
      <select value={selectedMonth} onChange={e => setMonth(Number(e.target.value))}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
          fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', outline: 'none',
        }}>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>Month {i + 1} ({MONTHS[i]})</option>
        ))}
      </select>

      <div style={{
        padding: '4px 10px', background: 'var(--green-dim)',
        border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20,
        fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-mono)',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse-cyan 2s infinite' }} />
        LIVE
      </div>
    </header>
  )
}