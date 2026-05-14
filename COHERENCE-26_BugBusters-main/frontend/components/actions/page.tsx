'use client'
import { useEffect, useState } from 'react'
import { api, Action, DigestItem } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import ActionCard from '@/components/actions/ActionCard'

const DIGEST_ICON: Record<string, string> = {
  NEW:          '🔴',
  WORSENING:    '🟡',
  RESOLVED:     '🟢',
  LAPSE_WINDOW: '⏱',
}

export default function ActionsPage() {
  const { selectedYear, selectedMonth, setPendingCount } = useAppStore()
  const [actions, setActions]   = useState<Action[]>([])
  const [digest, setDigest]     = useState<DigestItem[]>([])
  const [filter, setFilter]     = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'DISMISSED'>('ALL')
  const [priority, setPriority] = useState<string>('ALL')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.actions(selectedYear, selectedMonth),
      api.actionDigest(selectedYear, selectedMonth).catch(() => []),
    ])
      .then(([acts, dig]) => {
        const list = Array.isArray(acts) ? acts : []
        setActions(list)
        setDigest(Array.isArray(dig) ? dig : [])
        setPendingCount(list.filter((a: Action) => a.status === 'DRAFT').length)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [selectedYear, selectedMonth])

  const filtered = actions.filter(a => {
    if (filter !== 'ALL' && a.status !== filter) return false
    if (priority !== 'ALL' && a.priority !== priority) return false
    return true
  })

  const counts = {
    draft:    actions.filter(a => a.status === 'DRAFT').length,
    approved: actions.filter(a => a.status === 'APPROVED').length,
    dismissed:actions.filter(a => a.status === 'DISMISSED').length,
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, gap: 12 }}>
      <div className="spinner" />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
        Loading action queue...
      </span>
    </div>
  )

  if (error) return (
    <div style={{
      padding: 24, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444',
    }}>
      ⚠ {error}
      <button onClick={load} style={{ marginLeft: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        Retry
      </button>
    </div>
  )

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
          ACTION QUEUE · FY {selectedYear} · MONTH {selectedMonth}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', margin: 0 }}>
            Fund Transfer Orders
          </h2>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            Pre-justified · Click APPROVE to execute
          </div>
        </div>
      </div>

      {/* Daily digest strip */}
      {digest.length > 0 && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          display: 'flex', gap: 16, overflowX: 'auto',
        }}>
          {digest.slice(0, 6).map((item, i) => (
            <div key={i} style={{
              flexShrink: 0, padding: '6px 12px',
              background: 'var(--bg-elevated)', borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>
                {DIGEST_ICON[item.type]} {item.department} · {item.district}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                {item.message.slice(0, 50)}{item.message.length > 50 ? '...' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Awaiting Decision', count: counts.draft,    color: '#ef4444', status: 'DRAFT'     },
          { label: 'Approved',          count: counts.approved, color: '#22c55e', status: 'APPROVED'  },
          { label: 'Dismissed',         count: counts.dismissed,color: '#64748b', status: 'DISMISSED' },
        ].map(({ label, count, color, status: s }) => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? 'ALL' : s as any)}
            style={{
              padding: '12px 16px',
              background: filter === s ? `${color}15` : 'var(--bg-surface)',
              border: `1px solid ${filter === s ? color + '50' : 'var(--border)'}`,
              borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24, color, lineHeight: 1 }}>{count}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </button>
        ))}
      </div>

      {/* Priority filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['ALL', 'IMMEDIATE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            style={{
              padding: '4px 12px',
              background: priority === p ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
              border: `1px solid ${priority === p ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
              borderRadius: 20, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: priority === p ? '#3b82f6' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Action grid */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 48, textAlign: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)',
        }}>
          {actions.length === 0
            ? '✓ No actions generated yet. Check back after engine runs.'
            : 'No actions match current filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 16 }}>
          {filtered.map((action, i) => (
            <ActionCard key={action.action_id} action={action} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  )
}