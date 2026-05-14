'use client'
import { useEffect, useState } from 'react'
import { api, DigestResponse } from '@/lib/api'

const TONE_STYLE = {
  URGENT:   { color: 'var(--red)',   border: 'rgba(239,68,68,0.4)',   bg: 'rgba(239,68,68,0.06)',   icon: '🚨' },
  WATCHFUL: { color: 'var(--amber)', border: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.06)',  icon: '⚠️' },
  STABLE:   { color: 'var(--green)', border: 'rgba(16,185,129,0.4)',  bg: 'rgba(16,185,129,0.06)', icon: '✅' },
}

export default function MorningBriefing() {
  const [digest, setDigest] = useState<DigestResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.digestCached()
      .then(setDigest)
      .catch(() => api.digest().then(setDigest).catch(() => null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
    }}>
      <div className="spinner" />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Loading morning briefing...</span>
    </div>
  )

  if (!digest) return null

  const style = TONE_STYLE[digest.tone] || TONE_STYLE.STABLE

  return (
    <div style={{
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderLeft: `4px solid ${style.color}`,
      borderRadius: 'var(--radius-lg)', padding: '18px 22px',
      marginBottom: 20, animation: 'fadeUp 0.4s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{style.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: style.color, letterSpacing: '0.1em', marginBottom: 2 }}>
              MORNING BRIEFING · {digest.tone}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              {digest.headline}
            </div>
          </div>
        </div>
        <div style={{
          padding: '2px 8px', borderRadius: 4,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
          flexShrink: 0,
        }}>
          {digest.source === 'groq' ? '🤖 AI' : '⚙️ Engine'}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
        {digest.body}
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: 'var(--bg-card)',
        borderRadius: 6, border: `1px solid ${style.border}`,
      }}>
        <span style={{ color: style.color, fontSize: 14 }}>→</span>
        <span style={{ fontSize: 12, color: style.color, fontWeight: 500 }}>{digest.action_today}</span>
      </div>
    </div>
  )
}