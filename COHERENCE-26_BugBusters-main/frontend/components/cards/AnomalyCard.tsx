'use client'
import { Anomaly } from '@/lib/api'

interface Props { anomaly: Anomaly; delay?: number }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function AnomalyCard({ anomaly, delay = 0 }: Props) {
  const isCritical = anomaly.severity === 'CRITICAL'
  const color = isCritical ? 'var(--red)' : 'var(--amber)'
  const bg    = isCritical ? 'var(--red-dim)' : 'var(--amber-dim)'
  const border = isCritical ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'

  const zAbs = Math.abs(anomaly.z_score)
 // FIXED
  const utilPct = anomaly.utilization_rate.toFixed(1)
  const peerPct = anomaly.peer_mean.toFixed(1)
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${border}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      position: 'relative',
      overflow: 'hidden',
      animation: `fadeUp 0.4s ease ${delay}ms both`,
    }}>
      {/* Left accent bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: 3,
        background: color,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 8 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--text-primary)',
          }}>
            {anomaly.department}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            marginTop: 2,
          }}>
            {anomaly.district}, {anomaly.state} · {MONTHS[anomaly.month - 1]} {anomaly.year}
          </div>
        </div>
        <div style={{
          padding: '3px 8px',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 4,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: color,
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          {anomaly.severity}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, paddingLeft: 8 }}>
        <div style={{
          flex: 1, padding: '8px 10px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>UTILIZATION</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color }}>
            {utilPct}%
          </div>
        </div>
        <div style={{
          flex: 1, padding: '8px 10px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>PEER MEAN</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-secondary)' }}>
            {peerPct}%
          </div>
        </div>
        <div style={{
          flex: 1, padding: '8px 10px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>Z-SCORE</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color }}>
            {zAbs.toFixed(2)}σ
          </div>
        </div>
      </div>

      {/* Scheme tag */}
      <div style={{ paddingLeft: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-muted)',
          padding: '2px 6px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 3,
        }}>
          {anomaly.scheme}
        </span>
      </div>

      {/* Explanation */}
      {anomaly.explanation && (
        <div style={{
          paddingLeft: 8,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          borderTop: '1px solid var(--border)',
          paddingTop: 10,
        }}>
          {anomaly.explanation}
        </div>
      )}
    </div>
  )
}