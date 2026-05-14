'use client'

interface KPICardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'cyan' | 'amber' | 'red' | 'green' | 'purple'
  icon?: string
  trend?: 'up' | 'down' | 'neutral'
  delay?: number
}

const ACCENT_MAP = {
  cyan:   { color: 'var(--cyan)',   bg: 'var(--cyan-dim)',          border: 'rgba(0,212,255,0.2)' },
  amber:  { color: 'var(--amber)',  bg: 'var(--amber-dim)',         border: 'rgba(245,158,11,0.2)' },
  red:    { color: 'var(--red)',    bg: 'var(--red-dim)',           border: 'rgba(239,68,68,0.2)' },
  green:  { color: 'var(--green)',  bg: 'var(--green-dim)',         border: 'rgba(16,185,129,0.2)' },
  purple: { color: 'var(--purple)', bg: 'rgba(167,139,250,0.08)',  border: 'rgba(167,139,250,0.2)' },
}

export default function KPICard({ label, value, sub, accent = 'cyan', icon, trend, delay = 0 }: KPICardProps) {
  const a = ACCENT_MAP[accent]

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${a.border}`,
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
      animation: `fadeUp 0.4s ease ${delay}ms both`,
    }}>
      {/* Glow corner */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        width: 60, height: 60,
        background: `radial-gradient(circle at top left, ${a.bg}, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Top bar accent */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: a.color,
        opacity: 0.6,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-muted)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          {label}
        </div>
        {icon && (
          <span style={{ fontSize: 18, opacity: 0.7 }}>{icon}</span>
        )}
      </div>

      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 28,
        color: a.color,
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {value}
      </div>

      {sub && (
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {trend === 'up' && <span style={{ color: 'var(--red)' }}>↑</span>}
          {trend === 'down' && <span style={{ color: 'var(--green)' }}>↓</span>}
          {trend === 'neutral' && <span style={{ color: 'var(--amber)' }}>→</span>}
          {sub}
        </div>
      )}
    </div>
  )
}