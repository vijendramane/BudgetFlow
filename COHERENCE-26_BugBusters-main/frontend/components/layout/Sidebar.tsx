'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'

const NAV = [
  { href: '/dashboard',    icon: '⬡', label: 'Overview' },
  { href: '/flow',         icon: '⟿', label: 'Fund Flow' },
  { href: '/anomalies',    icon: '◈', label: 'Anomalies' },
  { href: '/forecast',     icon: '◉', label: 'Forecast' },
  { href: '/audit', icon: '⇄', label: 'Audit' },
  { href: '/actions',      icon: '✦', label: 'Action Queue', highlight: true },
]

export default function Sidebar() {
  const path = usePathname()
  const { pendingActionCount, toggleCopilot, copilotOpen } = useAppStore()

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '0 0 24px', zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--cyan)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          BudgetFlow
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', marginTop: 2 }}>
          INTELLIGENCE PLATFORM
        </div>
      </div>

      <nav style={{ flex: 1, padding: '8px 12px' }}>
        {NAV.map(({ href, icon, label, highlight }) => {
          const active = path === href
          const isActions = href === '/actions'
          const baseColor = active ? 'var(--cyan)' : highlight ? 'var(--amber)' : 'var(--text-secondary)'
          const baseBg = active ? 'var(--cyan-dim)' : highlight && !active ? 'rgba(245,158,11,0.06)' : 'transparent'
          const baseBorder = active ? 'var(--cyan-glow)' : highlight && !active ? 'rgba(245,158,11,0.2)' : 'transparent'

          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block', marginBottom: 2 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 'var(--radius)',
                background: baseBg, border: `1px solid ${baseBorder}`,
                color: baseColor, transition: 'all 0.15s', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 16, minWidth: 20, textAlign: 'center' }}>{icon}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: active ? 500 : 400, fontSize: 13, letterSpacing: '0.02em', flex: 1 }}>
                  {label}
                </span>
                {isActions && pendingActionCount > 0 && (
                  <span style={{
                    background: 'var(--red)', color: '#fff',
                    fontSize: 9, fontFamily: 'var(--font-mono)',
                    padding: '1px 5px', borderRadius: 10,
                    animation: 'pulse-cyan 2s infinite',
                  }}>
                    {pendingActionCount}
                  </span>
                )}
                {active && !isActions && (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--cyan)' }} />
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Copilot button */}
      <div style={{ padding: '0 12px', marginBottom: 12 }}>
        <button onClick={toggleCopilot} style={{
          width: '100%', padding: '10px 12px',
          background: copilotOpen ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
          border: `1px solid ${copilotOpen ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'all 0.15s',
        }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: copilotOpen ? '#3b82f6' : 'var(--text-secondary)', flex: 1, textAlign: 'left' }}>
            AI Copilot
          </span>
          {copilotOpen && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-cyan 2s infinite', display: 'inline-block' }} />
          )}
        </button>
      </div>

      {/* Footer */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>DATA SOURCE</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>FY 2024–25</div>
          <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            API Live
          </div>
        </div>
      </div>
    </aside>
  )
}