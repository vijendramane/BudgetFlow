'use client'
import { useState } from 'react'
import { Action, api } from '@/lib/api'
import ConfidenceRing from '@/components/shared/ConfidenceRing'
import PatternBadge from '@/components/shared/PatternBadge'
import ConfidenceInterval from '@/components/shared/ConfidenceInterval'

interface Props { action: Action; onUpdate: (a: Action) => void }

const PRIORITY_STYLE: Record<string, { color: string; bg: string; border: string; pulse: boolean }> = {
  IMMEDIATE: { color: 'var(--red)',   bg: 'var(--red-dim)',   border: 'rgba(239,68,68,0.45)',  pulse: true  },
  CRITICAL:  { color: 'var(--red)',   bg: 'var(--red-dim)',   border: 'rgba(239,68,68,0.35)',  pulse: false },
  HIGH:      { color: 'var(--amber)', bg: 'var(--amber-dim)', border: 'rgba(245,158,11,0.35)', pulse: false },
  MEDIUM:    { color: '#eab308',      bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.3)', pulse: false },
  LOW:       { color: 'var(--cyan)',  bg: 'var(--cyan-dim)',  border: 'rgba(0,212,255,0.25)',  pulse: false },
}

function ImpactBar({ label, before, after, color }: { label: string; before: number; after: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{before.toFixed(1)}%</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>→</span>
          <span style={{ color }}>{after.toFixed(1)}%</span>
          <span style={{ color: after >= before ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>
            ({after >= before ? '+' : ''}{(after - before).toFixed(1)}pp)
          </span>
        </span>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', height: '100%', width: `${Math.min(before, 100)}%`, background: 'var(--text-muted)', opacity: 0.3, borderRadius: 2 }} />
        <div style={{ position: 'absolute', height: '100%', width: `${Math.min(after, 100)}%`, background: color, opacity: 0.9, borderRadius: 2, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

export default function ActionCard({ action, onUpdate }: Props) {
  const [loading, setLoading] = useState<'approve' | 'dismiss' | null>(null)
  const [showTrace, setShowTrace] = useState(false)
  const [showMemo, setShowMemo] = useState(false)
  const [memo, setMemo] = useState('')
  const [officerNote, setOfficerNote] = useState('')

  const ps = PRIORITY_STYLE[action.priority] || PRIORITY_STYLE.MEDIUM
  const isDone = action.status !== 'DRAFT'
  const { detection: d, recommendation: r, projected_impact: imp, intervention_window: win, confidence: conf } = action

  const handleApprove = async () => {
    setLoading('approve')
    try { onUpdate(await api.approveAction(action.action_id, officerNote)) }
    catch (e) { console.error(e) } finally { setLoading(null) }
  }
  const handleDismiss = async () => {
    setLoading('dismiss')
    try { onUpdate(await api.dismissAction(action.action_id, officerNote)) }
    catch (e) { console.error(e) } finally { setLoading(null) }
  }
  const handleMemo = async () => {
    if (memo) { setShowMemo(true); return }
    try { const res = await api.actionMemo(action.action_id); setMemo(res.memo || 'No memo available.') }
    catch { setMemo('Could not load memo.') }
    setShowMemo(true)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isDone ? 'var(--border)' : ps.border}`,
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      opacity: isDone ? 0.6 : 1,
      transition: 'all 0.35s ease',
      animation: 'fadeUp 0.4s ease both',
    }}>
      {/* Priority bar */}
      <div style={{
        height: 3, background: isDone ? (action.status === 'APPROVED' ? 'var(--green)' : 'var(--text-muted)') : ps.color,
        ...(ps.pulse && !isDone ? { animation: 'pulse-cyan 2s infinite' } : {}),
      }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <ConfidenceRing score={conf.confidence_score} size={58} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 5 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 4, background: ps.bg,
                border: `1px solid ${ps.color}`, fontSize: 9,
                fontFamily: 'var(--font-mono)', color: ps.color,
              }}>
                {action.priority}
              </span>
              <PatternBadge pattern={d.pattern} />
              {isDone && (
                <span style={{
                  padding: '2px 8px', borderRadius: 4,
                  background: action.status === 'APPROVED' ? 'var(--green-dim)' : 'rgba(71,85,105,0.15)',
                  border: `1px solid ${action.status === 'APPROVED' ? 'var(--green)' : 'var(--text-muted)'}`,
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  color: action.status === 'APPROVED' ? 'var(--green)' : 'var(--text-muted)',
                }}>
                  {action.status === 'APPROVED' ? '✓ APPROVED' : '✗ DISMISSED'}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {d.department} · {d.district}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
              {d.state} · z={d.z_score?.toFixed(2)}σ · peer avg {d.peer_mean?.toFixed(1)}%
            </div>
          </div>

          {/* Days countdown */}
          <div style={{
            padding: '8px 12px', borderRadius: 8, textAlign: 'center', flexShrink: 0,
            background: win?.days_remaining < 30 ? 'var(--red-dim)' : 'var(--amber-dim)',
            border: `1px solid ${win?.days_remaining < 30 ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`,
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24,
              color: win?.days_remaining < 30 ? 'var(--red)' : 'var(--amber)', lineHeight: 1,
            }}>
              {win?.days_remaining ?? '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>DAYS LEFT</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 3 }}>UTILIZATION</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--red)' }}>
              {d.utilization_pct?.toFixed(1)}%
            </div>
            {d.confidence_interval && (
              <div style={{ marginTop: 6 }}>
                <ConfidenceInterval low={d.confidence_interval[0]} high={d.confidence_interval[1]} />
              </div>
            )}
          </div>
          <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 3 }}>TRANSFER</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--cyan)' }}>
              ₹{r?.transfer_lakh?.toFixed(1)}L
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>
              → {r?.to_district}, {r?.to_department}
            </div>
          </div>
        </div>

        {/* Impact */}
        <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 8 }}>PROJECTED IMPACT</div>
          <ImpactBar label={`${r?.from_department} util`} before={imp?.from_util_before ?? 0} after={imp?.from_util_after ?? 0} color="var(--green)" />
          <ImpactBar label={`${r?.to_department} util`}   before={imp?.to_util_before   ?? 0} after={imp?.to_util_after   ?? 0} color="var(--cyan)" />
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', marginTop: 4 }}>
            Net avg gain: +{imp?.net_gain?.toFixed(1)}pp
          </div>
        </div>

        {/* Scoring trace */}
        <button onClick={() => setShowTrace(!showTrace)} style={{
          width: '100%', padding: '6px 10px', marginBottom: showTrace ? 0 : 10,
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
          fontSize: 10, textAlign: 'left', display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Scoring Trace — {conf.confidence_label} ({conf.confidence_score}/100)</span>
          <span>{showTrace ? '▲' : '▼'}</span>
        </button>

        {showTrace && (
          <div style={{
            padding: '8px 10px', background: 'var(--bg-secondary)',
            borderRadius: '0 0 6px 6px', border: '1px solid var(--border)',
            borderTop: 'none', marginBottom: 10, animation: 'fadeUp 0.2s ease both',
          }}>
            {conf.scoring_trace?.map((f, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '5px 0', borderBottom: i < conf.scoring_trace.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)' }}>{f.factor}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{f.detail}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: f.points.startsWith('+') ? 'var(--green)' : 'var(--red)', flexShrink: 0, marginLeft: 8 }}>
                  {f.points}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* GFR note */}
        {r?.gfr_note && (
          <div style={{
            fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            padding: '5px 8px', background: 'var(--bg-secondary)',
            borderRadius: 4, marginBottom: 10, borderLeft: '2px solid var(--border)',
          }}>
            {r.gfr_note}
          </div>
        )}

        {/* Officer note */}
        {!isDone && (
          <input value={officerNote} onChange={e => setOfficerNote(e.target.value)}
            placeholder="Officer note (optional)..."
            style={{
              width: '100%', padding: '7px 10px', marginBottom: 10,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none', boxSizing: 'border-box',
            }}
          />
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isDone ? (
            <>
              <button onClick={handleApprove} disabled={!!loading} style={{
                flex: 1, padding: '9px', borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading === 'approve' ? 'var(--bg-secondary)' : 'var(--green-dim)',
                border: `1px solid ${loading === 'approve' ? 'var(--border)' : 'var(--green)'}`,
                color: loading === 'approve' ? 'var(--text-muted)' : 'var(--green)',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s',
              }}>
                {loading === 'approve' ? <><div className="spinner" style={{ width: 12, height: 12 }} />APPROVING…</> : '✓ APPROVE'}
              </button>
              <button onClick={handleDismiss} disabled={!!loading} style={{
                flex: 1, padding: '9px', borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s',
              }}>
                {loading === 'dismiss' ? <><div className="spinner" style={{ width: 12, height: 12 }} />DISMISSING…</> : '✗ DISMISS'}
              </button>
              <button onClick={handleMemo} style={{
                padding: '9px 14px', borderRadius: 6, cursor: 'pointer',
                background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.3)',
                color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 13, transition: 'all 0.15s',
              }}>
                📄
              </button>
            </>
          ) : (
            <div style={{ flex: 1, padding: '9px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {action.status === 'APPROVED' ? '✓ Approved and logged' : '✗ Dismissed'}
            </div>
          )}
        </div>
      </div>

      {/* Memo modal */}
      {showMemo && (
        <div onClick={() => setShowMemo(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(7,12,24,0.88)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 24,
            maxWidth: 600, width: '100%', maxHeight: '80vh', overflowY: 'auto',
            animation: 'fadeUp 0.25s ease both',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', letterSpacing: '0.1em' }}>POLICY MEMO</div>
              <button onClick={() => setShowMemo(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>
              {memo}
            </pre>
            <button onClick={() => navigator.clipboard.writeText(memo)} style={{
              marginTop: 16, padding: '8px 16px',
              background: 'var(--cyan-dim)', border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 6, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
            }}>
              Copy Memo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}