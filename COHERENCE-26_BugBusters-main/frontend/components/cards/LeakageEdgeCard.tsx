'use client'
import { LeakageEdge } from '@/lib/api'

interface Props { edge: LeakageEdge; delay?: number }

function fmtCr(n: number) {
  return `₹${(n / 1e7).toFixed(2)}Cr`
}

export default function LeakageEdgeCard({ edge, delay = 0 }: Props) {
  const pct = ((1 - edge.absorption_ratio) * 100).toFixed(1)
  const severity = edge.absorption_ratio < 0.7 ? 'SEVERE' : edge.absorption_ratio < 0.8 ? 'HIGH' : 'MODERATE'
  const color = severity === 'SEVERE' ? 'var(--red)' : severity === 'HIGH' ? 'var(--amber)' : 'rgba(245,158,11,0.6)'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      animation: `fadeUp 0.4s ease ${delay}ms both`,
    }}>
      {/* Flow path */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 17,
          color: 'var(--text-primary)',
          padding: '3px 8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
        }}>
          {edge.from_entity}
        </div>
        <div style={{ color: color, fontSize: 19, flexShrink: 0 }}>⟶</div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 17,
          color: 'var(--text-primary)',
          padding: '3px 8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
        }}>
          {edge.to_entity}
        </div>
        <div style={{
          marginLeft: 'auto',
          padding: '2px 7px',
          background: 'var(--red-dim)',
          border: `1px solid ${color}`,
          borderRadius: 3,
          fontSize: 15,
          fontFamily: 'var(--font-mono)',
          color,
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          {severity}
        </div>
      </div>

      {/* Absorption bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-muted)' }}>ABSORPTION RATIO</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color }}>
            {(edge.absorption_ratio * 100).toFixed(1)}%
          </span>
        </div>
        <div style={{
          height: 4, background: 'var(--bg-secondary)',
          borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${edge.absorption_ratio * 100}%`,
            background: color,
            borderRadius: 2,
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      {/* Numbers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-muted)', marginBottom: 2 }}>GAP (LEAKED)</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color }}>
            {fmtCr(edge.gap_amount)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-muted)', marginBottom: 2 }}>LEAKAGE %</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color }}>
            {pct}%
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-muted)', marginBottom: 2 }}>STATE</div>
          <div style={{ fontSize: 17, color: 'var(--text-secondary)' }}>{edge.state}</div>
        </div>
      </div>
    </div>
  )
}