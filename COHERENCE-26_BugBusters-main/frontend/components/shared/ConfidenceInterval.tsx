'use client'

interface Props { low: number; high: number; current?: number }

export default function ConfidenceInterval({ low, high, current }: Props) {
  const mid = current ?? (low + high) / 2
  const rangeWidth = Math.max(high - low, 1)
  const dotPct = ((mid - low) / rangeWidth) * ((high - low) / 100) * 100

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{low.toFixed(0)}%</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber)', fontWeight: 700 }}>{mid.toFixed(1)}%</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{high.toFixed(0)}%</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
        <div style={{
          position: 'absolute', top: 1,
          left: `${low}%`, width: `${high - low}%`,
          height: 4, background: 'rgba(245,158,11,0.3)', borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', top: '50%',
          left: `${low + dotPct}%`,
          transform: 'translate(-50%, -50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--amber)', boxShadow: '0 0 6px var(--amber)',
        }} />
      </div>
    </div>
  )
}