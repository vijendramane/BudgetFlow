'use client'

interface Cell {
  department: string
  state: string
  value: number // 0–1
  severity?: 'CRITICAL' | 'WARNING' | 'OK'
}

interface Props {
  cells: Cell[]
  departments: string[]
  states: string[]
}

function getCellColor(value: number, severity?: string) {
  if (severity === 'CRITICAL') return { bg: 'rgba(239,68,68,0.55)', text: '#fca5a5' }
  if (severity === 'WARNING')  return { bg: 'rgba(245,158,11,0.45)', text: '#fcd34d' }
  if (value >= 0.8)            return { bg: 'rgba(16,185,129,0.35)', text: '#6ee7b7' }
  if (value >= 0.5)            return { bg: 'rgba(0,212,255,0.2)',   text: '#67e8f9' }
  return { bg: 'rgba(59,130,246,0.1)', text: '#93c5fd' }
}

export default function HeatmapGrid({ cells, departments, states }: Props) {
  const lookup: Record<string, Cell> = {}
  cells.forEach(c => { lookup[`${c.department}::${c.state}`] = c })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-muted)', padding: '0 8px 8px 0',
              textAlign: 'left', fontWeight: 400,
            }}>
              DEPT / STATE
            </th>
            {states.map(s => (
              <th key={s} style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-muted)', padding: '0 2px 8px',
                fontWeight: 400, whiteSpace: 'nowrap',
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                height: 60,
              }}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departments.map(dept => (
            <tr key={dept}>
              <td style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--text-secondary)', paddingRight: 10,
                paddingBottom: 3, whiteSpace: 'nowrap',
              }}>
                {dept}
              </td>
              {states.map(state => {
                const cell = lookup[`${dept}::${state}`]
                if (!cell) {
                  return (
                    <td key={state} style={{ width: 28, height: 28 }}>
                      <div style={{
                        width: 28, height: 28,
                        background: 'var(--bg-secondary)',
                        borderRadius: 3,
                        border: '1px solid var(--border)',
                      }} />
                    </td>
                  )
                }
                const { bg, text } = getCellColor(cell.value, cell.severity)
                return (
                  <td key={state} style={{ width: 28, height: 28 }} title={`${dept} / ${state}: ${(cell.value * 100).toFixed(1)}%`}>
                    <div style={{
                      width: 28, height: 28,
                      background: bg,
                      borderRadius: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8,
                      fontFamily: 'var(--font-mono)',
                      color: text,
                      cursor: 'default',
                      transition: 'transform 0.1s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                    >
                      {(cell.value * 100).toFixed(0)}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        {[
          { color: 'rgba(239,68,68,0.55)', label: 'Critical anomaly' },
          { color: 'rgba(245,158,11,0.45)', label: 'Warning' },
          { color: 'rgba(16,185,129,0.35)', label: '≥ 80% utilized' },
          { color: 'rgba(0,212,255,0.2)', label: '50–80%' },
          { color: 'rgba(59,130,246,0.1)', label: '< 50%' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}