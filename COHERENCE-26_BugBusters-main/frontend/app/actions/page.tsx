'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, Action, DigestItem } from '@/lib/api'
import ActionCard from '@/components/actions/ActionCard'
import { useAppStore } from '@/store/useAppStore'

type Filter   = 'ALL' | 'DRAFT' | 'APPROVED' | 'DISMISSED'
type Priority = 'ALL' | 'IMMEDIATE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const DIGEST_ICONS: Record<string, string> = {
  NEW: '🔴', WORSENING: '🟡', RESOLVED: '🟢', LAPSE_WINDOW: '⏱',
}

function safeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    // backend may return { actions: [...] } or { items: [...] }
    const d = data as Record<string, unknown>
    for (const key of ['actions', 'items', 'results', 'data']) {
      if (Array.isArray(d[key])) return d[key] as T[]
    }
  }
  return []
}

export default function ActionsPage() {
  const { selectedYear, selectedMonth, setPendingCount } = useAppStore()
  const [actions, setActions]   = useState<Action[]>([])
  const [digest, setDigest]     = useState<DigestItem[]>([])
  const [filter, setFilter]     = useState<Filter>('ALL')
  const [priority, setPriority] = useState<Priority>('ALL')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.actions(selectedYear, selectedMonth,
        filter   === 'ALL' ? undefined : filter,
        priority === 'ALL' ? undefined : priority,
      ),
      api.actionDigest(selectedYear, selectedMonth).catch(() => []),
    ])
      .then(([actsRaw, digRaw]) => {
        const acts = safeArray<Action>(actsRaw)
        const dig  = safeArray<DigestItem>(digRaw)
        setActions(acts)
        setDigest(dig)
        setPendingCount(acts.filter(a => a.status === 'DRAFT').length)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedYear, selectedMonth, filter, priority, setPendingCount])

  useEffect(() => { load() }, [load])

  const handleUpdate = (updated: Action) => {
    setActions(prev => {
      const next = prev.map(a => a.action_id === updated.action_id ? updated : a)
      setPendingCount(next.filter(a => a.status === 'DRAFT').length)
      return next
    })
  }

  const draftCount    = actions.filter(a => a.status === 'DRAFT').length
  const approvedCount = actions.filter(a => a.status === 'APPROVED').length

  const PRIORITY_ORDER = ['IMMEDIATE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  const sorted = [...actions].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  )

  const PRIORITY_COLORS: Record<string, string> = {
    ALL: 'var(--cyan)', IMMEDIATE: 'var(--red)', CRITICAL: 'var(--red)',
    HIGH: 'var(--amber)', MEDIUM: '#eab308', LOW: 'var(--cyan)',
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
          PRE-JUSTIFIED TRANSFER ORDERS · ONE-CLICK APPROVAL
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>
            Action Queue
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            {draftCount > 0 && (
              <div style={{
                padding: '6px 14px', borderRadius: 20,
                background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.4)',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)',
                animation: 'pulse-cyan 2s infinite',
              }}>
                {draftCount} AWAITING APPROVAL
              </div>
            )}
            {approvedCount > 0 && (
              <div style={{
                padding: '6px 14px', borderRadius: 20,
                background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.4)',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)',
              }}>
                {approvedCount} APPROVED
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Digest */}
      {digest.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 10 }}>
            DAILY DIGEST · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {digest.slice(0, 6).map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '8px 10px', background: 'var(--bg-secondary)',
                borderRadius: 8, border: '1px solid var(--border)',
                animation: `fadeUp 0.3s ease ${i * 40}ms both`,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{DIGEST_ICONS[item.type] || '◈'}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
                    {item.type} · {item.severity}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.message}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                    {item.department}, {item.district}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['ALL', 'DRAFT', 'APPROVED', 'DISMISSED'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              background: filter === f ? 'var(--cyan-dim)' : 'var(--bg-card)',
              border: `1px solid ${filter === f ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
              color: filter === f ? 'var(--cyan)' : 'var(--text-secondary)',
            }}>
              {f}
            </button>
          ))}
        </div>
        {/* Priority filter */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['ALL', 'IMMEDIATE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(p => {
            const color = PRIORITY_COLORS[p]
            const active = priority === p
            return (
              <button key={p} onClick={() => setPriority(p)} style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                background: active ? `${color}15` : 'var(--bg-card)',
                border: `1px solid ${active ? color : 'var(--border)'}`,
                color: active ? color : 'var(--text-secondary)',
              }}>
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40 }}>
          <div className="spinner" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
            Generating action queue...
          </span>
        </div>
      ) : error ? (
        <div style={{
          padding: 24, background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius-lg)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>
          ⚠ {error}
          <button onClick={load} style={{ marginLeft: 16, padding: '4px 12px', background: 'transparent', border: '1px solid var(--red)', borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            Retry
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
          ✓ No pending actions for current filters
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {sorted.map((action, i) => (
            <div key={action.action_id} style={{ animationDelay: `${i * 50}ms` }}>
              <ActionCard action={action} onUpdate={handleUpdate} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}