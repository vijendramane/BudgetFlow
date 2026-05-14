'use client'

interface Props { pattern?: 'flatline' | 'march_rush' | 'normal' | string }

const CONFIG = {
  flatline:   { emoji: '🔴', label: 'Flatline',   color: 'var(--red)',   bg: 'var(--red-dim)' },
  march_rush: { emoji: '🟡', label: 'March Rush', color: 'var(--amber)', bg: 'var(--amber-dim)' },
  normal:     { emoji: '🟢', label: 'Normal',     color: 'var(--green)', bg: 'var(--green-dim)' },
}

export default function PatternBadge({ pattern }: Props) {
  if (!pattern) return null
  const cfg = CONFIG[pattern as keyof typeof CONFIG] || CONFIG.normal
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: cfg.bg, border: `1px solid ${cfg.color}`,
      fontSize: 10, fontFamily: 'var(--font-mono)', color: cfg.color,
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  )
}