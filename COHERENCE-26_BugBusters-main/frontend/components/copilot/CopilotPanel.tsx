'use client'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { api } from '@/lib/api'

const SUGGESTED = [
  'What should I do today?',
  'Which district has highest lapse risk?',
  'Where is money leaking?',
  'Show me critical anomalies',
  'Which departments show flatline pattern?',
]

const INTENT_ICONS: Record<string, string> = {
  anomaly: '◈ Analyzing: anomalies',
  lapse:   '◉ Analyzing: lapse risks',
  leakage: '⟿ Analyzing: fund flow',
  action:  '✦ Analyzing: action queue',
  general: '⬡ Analyzing: overview',
}

interface Bubble { role: 'user' | 'assistant'; content: string; intent?: string; source?: string; ts?: string }

export default function CopilotPanel() {
  const { copilotOpen, toggleCopilot, chatHistory, addMessage, clearChat, selectedYear, selectedMonth } = useAppStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (copilotOpen) { setTimeout(() => inputRef.current?.focus(), 300) }
  }, [copilotOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, loading])

  const ask = async (question: string) => {
    if (!question.trim()) return
    setInput('')
    addMessage({ role: 'user', content: question })
    setLoading(true)

    try {
      const history = chatHistory.map(m => ({ role: m.role, content: m.content }))
      const res = await api.copilotAsk(question, selectedYear, selectedMonth, history)
      addMessage({
        role: 'assistant',
        content: res.answer,
        intent: res.intent,
        source: res.source,
      })
    } catch {
      addMessage({ role: 'assistant', content: 'Unable to reach analysis engine. Please check the backend connection.', source: 'rule' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {copilotOpen && (
        <div onClick={toggleCopilot} style={{
          position: 'fixed', inset: 0, zIndex: 49,
          background: 'rgba(7,12,24,0.4)',
          backdropFilter: 'blur(2px)',
          transition: 'opacity 0.2s',
        }} />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400, zIndex: 50,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transform: copilotOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: copilotOpen ? '-20px 0 60px rgba(0,0,0,0.5)' : 'none',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 20 }}>🤖</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
              AI Copilot
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              BUDGET INTELLIGENCE ASSISTANT
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={clearChat} title="Clear chat" style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10,
            }}>
              Clear
            </button>
            <button onClick={toggleCopilot} style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: '0 4px',
            }}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chatHistory.length === 0 && !loading ? (
            <div>
              {/* Welcome */}
              <div style={{
                padding: '14px 16px', background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
                marginBottom: 16,
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 6 }}>
                  How can I help you today?
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  I have access to live anomaly data, lapse risk projections, fund flow patterns, and the action queue.
                </div>
              </div>

              {/* Suggested questions */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 10 }}>
                SUGGESTED QUESTIONS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => ask(q)} style={{
                    padding: '9px 12px', textAlign: 'left',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)',
                    fontSize: 12, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget).style.borderColor = 'rgba(0,212,255,0.4)'; (e.currentTarget).style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { (e.currentTarget).style.borderColor = 'var(--border)'; (e.currentTarget).style.color = 'var(--text-secondary)' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {(chatHistory as Bubble[]).map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation: 'fadeUp 0.2s ease both',
                }}>
                  {/* Intent badge */}
                  {msg.role === 'assistant' && msg.intent && (
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
                      letterSpacing: '0.06em', marginBottom: 4, paddingLeft: 2,
                    }}>
                      {INTENT_ICONS[msg.intent] || '⬡ Analyzing'}
                    </div>
                  )}

                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 13px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                    background: msg.role === 'user' ? 'var(--cyan-dim)' : 'var(--bg-card)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(0,212,255,0.35)' : 'var(--border)'}`,
                    color: 'var(--text-primary)',
                    fontSize: 12, lineHeight: 1.6,
                  }}>
                    {msg.content}
                  </div>

                  {/* Source badge */}
                  {msg.role === 'assistant' && (
                    <div style={{
                      marginTop: 4, paddingLeft: 2,
                      fontFamily: 'var(--font-mono)', fontSize: 8,
                      color: msg.source === 'groq' ? 'var(--green)' : 'var(--text-muted)',
                    }}>
                      {msg.source === 'groq' ? '🤖 AI · Groq' : '⚙️ Analysis Engine'}
                    </div>
                  )}
                </div>
              ))}

              {/* Loading dots */}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'flex-start', animation: 'fadeUp 0.2s ease both' }}>
                  <div style={{
                    padding: '10px 14px', background: 'var(--bg-card)',
                    borderRadius: '4px 14px 14px 14px', border: '1px solid var(--border)',
                    display: 'flex', gap: 5, alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(j => (
                      <div key={j} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--cyan)',
                        animation: `pulse-cyan 1.2s ease ${j * 0.2}s infinite`,
                        opacity: 0.6,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !loading) ask(input) }}
              placeholder="Ask about budgets, anomalies, lapse risks..."
              disabled={loading}
              style={{
                flex: 1, padding: '10px 12px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(0,212,255,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
            />
            <button onClick={() => ask(input)} disabled={loading || !input.trim()} style={{
              padding: '10px 14px', borderRadius: 8, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              background: input.trim() && !loading ? 'var(--cyan-dim)' : 'var(--bg-card)',
              border: `1px solid ${input.trim() && !loading ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
              color: input.trim() && !loading ? 'var(--cyan)' : 'var(--text-muted)',
              fontSize: 16, transition: 'all 0.15s',
            }}>
              {loading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '↑'}
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center', letterSpacing: '0.06em' }}>
            POWERED BY GROQ · LIVE BUDGET DATA · FY {selectedYear} M{selectedMonth}
          </div>
        </div>
      </div>
    </>
  )
}