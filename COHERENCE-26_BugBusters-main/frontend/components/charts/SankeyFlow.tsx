'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { sankey as d3Sankey, sankeyLeft } from 'd3-sankey'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SankeyNode {
  id:          string
  name:        string
  level:       string
  level_order: number
}

interface SankeyLink {
  source:           number
  target:           number
  source_name:      string
  target_name:      string
  value:            number
  absorption_ratio: number
  leakage_score:    number
  is_leakage:       boolean
  is_severe:        boolean
  severity:         'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL'
  color:            string
  stroke_width:     number
  gap_lakh:         number
  tooltip: {
    from:           string
    to:             string
    released_lakh:  number
    received_lakh:  number
    gap_lakh:       number
    absorption_pct: number
    severity:       string
    state:          string
    department:     string
  }
}

interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

// ── Colors ────────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  Centre:     '#3b6fba',   // muted blue
  State:      '#7c5cbf',   // muted purple
  District:   '#2d8f6a',   // muted teal-green
  Department: '#b88a2a',   // muted amber
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  NORMAL:   '#22c55e',
}

// State filter handled by parent page via data prop

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean
  x: number
  y: number
  data: (SankeyLink['tooltip'] & {
    severity:      string
    leakage_score: number
    is_leakage:    boolean
    value:         number
  }) | null
}

function FlowTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip.visible || !tooltip.data) return null
  const d  = tooltip.data
  const sc = SEVERITY_COLORS[d.severity] || '#64748b'

  const fmt = (n: number | undefined | null) =>
    typeof n === 'number' && isFinite(n) ? n.toFixed(1) : '—'

  return (
    <div style={{ position: 'fixed', left: tooltip.x + 16, top: tooltip.y - 10, zIndex: 1000, pointerEvents: 'none' }}>
      <div style={{
        background:   '#0f172a',
        border:       `1px solid ${sc}40`,
        borderLeft:   `3px solid ${sc}`,
        borderRadius: '8px',
        padding:      '12px 14px',
        minWidth:     '220px',
        fontFamily:   '"JetBrains Mono", "Fira Code", monospace',
        fontSize:     '11px',
        boxShadow:    `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${sc}20`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: '#94a3b8', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Fund Flow
          </span>
          <span style={{
            color: sc, fontSize: '14px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            background: `${sc}18`, padding: '1px 6px', borderRadius: '3px',
          }}>
            {d.severity ?? 'NORMAL'}
          </span>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '16px' }}>
            {(d.from ?? '').length > 24 ? (d.from ?? '').slice(0, 22) + '…' : (d.from || '—')}
          </div>
          <div style={{ color: '#475569', fontSize: '14px', margin: '2px 0' }}>↓</div>
          <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '16px' }}>
            {(d.to ?? '').length > 24 ? (d.to ?? '').slice(0, 22) + '…' : (d.to || '—')}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: '13px', textTransform: 'uppercase' }}>Released</div>
            <div style={{ color: '#60a5fa', fontWeight: 700 }}>₹{fmt(d.released_lakh)}L</div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '13px', textTransform: 'uppercase' }}>Received</div>
            <div style={{ color: '#34d399', fontWeight: 700 }}>₹{fmt(d.received_lakh)}L</div>
          </div>
        </div>
        <div style={{ marginBottom: d.is_leakage ? '8px' : '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: '#64748b', fontSize: '13px', textTransform: 'uppercase' }}>Absorption</span>
            <span style={{ color: sc, fontWeight: 700 }}>{fmt(d.absorption_pct)}%</span>
          </div>
          <div style={{ height: '4px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(Math.max(d.absorption_pct ?? 0, 0), 100)}%`,
              background: `linear-gradient(90deg, ${sc}, ${sc}88)`,
              borderRadius: '2px',
            }} />
          </div>
        </div>
        {d.is_leakage && (
          <div style={{
            marginTop: '8px', padding: '6px 8px',
            background: '#ef444412', border: '1px solid #ef444430', borderRadius: '4px',
          }}>
            <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: 700 }}>
              ⚠ ₹{fmt(d.gap_lakh)}L gap ({fmt(d.leakage_score)}% leakage)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data?:    { nodes: SankeyNode[]; links: SankeyLink[] } | null
  height?:  number
  loading?: boolean
}

export default function SankeyFlow({ data = null, height = 480, loading = false }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null })
  const [dims,    setDims]    = useState({ width: 900, height })

  // ── Resize observer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      setDims({ width: Math.max(width, 500), height })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [height])

  // ── D3 render ─────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    if (!svgRef.current || !data?.nodes?.length) return

    // ── Adaptive height: more nodes → taller chart ────────────────────────
    const nodeCount    = data.nodes.length
    const adaptHeight  = Math.max(height, nodeCount * 38)
    const margin       = { top: 48, right: 210, bottom: 24, left: 24 }
    const W = dims.width  - margin.left - margin.right
    const H = adaptHeight - margin.top  - margin.bottom

    // Resize SVG to adaptive height
    if (svgRef.current.parentElement)
      (svgRef.current.parentElement as HTMLElement).style.minHeight = `${adaptHeight}px`

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width',  dims.width)
      .attr('height', adaptHeight)

    // ── DEFS ──────────────────────────────────────────────────────────────

    const defs = svg.append('defs')

    // Background radial gradient
    const bgGrad = defs.append('radialGradient')
      .attr('id', 'sf-bg').attr('cx', '40%').attr('cy', '35%').attr('r', '70%')
    bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#0c1a2e').attr('stop-opacity', 1)
    bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#050c18').attr('stop-opacity', 1)

    // Leakage glow — blur + merge
    const leakF = defs.append('filter').attr('id', 'sf-leak-glow')
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    leakF.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '5').attr('result', 'b')
    const lm2 = leakF.append('feMerge')
    lm2.append('feMergeNode').attr('in', 'b')
    lm2.append('feMergeNode').attr('in', 'SourceGraphic')

    // Node glow — very subtle, just a soft 1px edge
    const nodeF = defs.append('filter').attr('id', 'sf-node-glow')
      .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%')
    nodeF.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1.5').attr('result', 'b')
    const nm = nodeF.append('feMerge')
    nm.append('feMergeNode').attr('in', 'b')
    nm.append('feMergeNode').attr('in', 'SourceGraphic')

    // ── Background ────────────────────────────────────────────────────────

    svg.append('rect').attr('width', dims.width).attr('height', adaptHeight).attr('fill', 'url(#sf-bg)')

    // Column divider lines (very subtle)
    const gridG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const cols = 4
    for (let i = 1; i < cols; i++) {
      gridG.append('line')
        .attr('x1', W * i / cols).attr('y1', -24)
        .attr('x2', W * i / cols).attr('y2', H + 8)
        .attr('stroke', '#1e3a5f').attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '3 6').attr('opacity', 0.4)
    }

    // Column header labels
    const COL_LABELS = ['CENTRE', 'STATE', 'DISTRICT', 'DEPARTMENT']
    const COL_COLS   = ['#3b6fba', '#7c5cbf', '#2d8f6a', '#b88a2a']
    COL_LABELS.forEach((lbl, i) => {
      const cx = margin.left + W * i / cols + W / cols / 2
      // pill background
      svg.append('rect')
        .attr('x', cx - 36).attr('y', 10).attr('width', 72).attr('height', 18)
        .attr('rx', 9).attr('fill', COL_COLS[i]).attr('opacity', 0.08)
      svg.append('text')
        .attr('x', cx).attr('y', 22)
        .attr('text-anchor', 'middle')
        .attr('fill', COL_COLS[i]).attr('font-size', '12px')
        .attr('font-family', '"JetBrains Mono","Fira Code",monospace')
        .attr('letter-spacing', '0.16em').attr('opacity', 0.75)
        .text(lbl)
    })

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // ── Sankey layout ─────────────────────────────────────────────────────
    // nodePadding scales with node count to prevent congestion
    const nodePad = Math.max(12, Math.min(32, Math.floor(H / nodeCount) - 4))

    const sankeyLayout = d3Sankey<any, any>()
      .nodeId((d: any) => d.id)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(nodePad)
      .extent([[0, 0], [W, H]])

    const sankeyNodes = data.nodes.map(n => ({ ...n }))
    const sankeyLinks = data.links.map(l => ({
      ...l,
      source: data.nodes[l.source]?.id ?? l.source,
      target: data.nodes[l.target]?.id ?? l.target,
    }))

    let graph: any
    try {
      graph = sankeyLayout({ nodes: sankeyNodes, links: sankeyLinks })
    } catch (e) {
      console.error('Sankey layout error:', e)
      return
    }

    // ── Precompute: gather all links with layout positions ────────────────

    const allLinks = graph.links as any[]
    const normalLinks  = allLinks.filter(l => !l.is_leakage)
    const leakageLinks = allLinks.filter(l =>  l.is_leakage)

    // ── Custom bezier path: single thin line per link ─────────────────────
    // Instead of d3-sankey's ribbon (full node height), each link is a
    // thin bezier line that exits from its specific Y position on the node.
    // This gives the clean "fan of lines" look from the screenshot.
    //
    // d3-sankey post-layout sets on each link:
    //   l.source / l.target  → node objects with x0,x1,y0,y1
    //   l.y0   → Y exit point on source node right edge
    //   l.y1   → Y entry point on target node left edge
    //
    // We draw: M(x0,y0) C(cx,y0) (cx,y1) (x1,y1)
    // where cx = midpoint X — gives the smooth S-curve fan.

    const fanPath = (l: any): string => {
      const src  = l.source as any
      const tgt  = l.target as any
      const sx   = src.x1                        // source right edge X
      const sy   = l.y0                          // source exit Y (centre of link on node)
      const tx   = tgt.x0                        // target left edge X
      const ty   = l.y1                          // target entry Y
      const cx   = sx + (tx - sx) * 0.5          // horizontal control point at midpoint
      return `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`
    }

    // ── Link stroke width ─────────────────────────────────────────────────
    // Thin lines like in the screenshot: 1px normal, severity-scaled leakage

    const linkStrokeW = (l: any, isLeakage: boolean): number => {
      if (!isLeakage) return 1.2
      const boost: Record<string, number> = { CRITICAL: 2.8, HIGH: 2.0, MEDIUM: 1.5, NORMAL: 1.0 }
      return Math.min(1.5 * (boost[l.severity] ?? 1.5), 5)
    }

    // ── Per-link directional gradients (userSpaceOnUse so they track path) ─

    const addGrad = (id: string, sx: number, tx: number, c1: string, c2: string, op1: number, op2: number) => {
      const gr = defs.append('linearGradient').attr('id', id)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', sx).attr('y1', 0).attr('x2', tx).attr('y2', 0)
      gr.append('stop').attr('offset', '0%').attr('stop-color', c1).attr('stop-opacity', op1)
      gr.append('stop').attr('offset', '100%').attr('stop-color', c2).attr('stop-opacity', op2)
    }

    normalLinks.forEach((l: any, i: number) => {
      const sx = (l.source as any).x1 ?? 0
      const tx = (l.target as any).x0 ?? W
      addGrad(`sf-n-${i}`, sx, tx, '#2563eb', '#3b82f6', 0.20, 0.45)
    })

    leakageLinks.forEach((l: any, i: number) => {
      const sx    = (l.source as any).x1 ?? 0
      const tx    = (l.target as any).x0 ?? W
      const col   = SEVERITY_COLORS[l.severity as keyof typeof SEVERITY_COLORS] || '#ef4444'
      const srcC  = LEVEL_COLORS[(l.source as any).level as keyof typeof LEVEL_COLORS] || '#60a5fa'
      addGrad(`sf-l-${i}`, sx, tx, srcC, col, 0.5, 0.9)
    })

    // ── Draw layer 1: normal links ────────────────────────────────────────

    g.append('g').attr('class', 'normal-links')
      .selectAll('path')
      .data(normalLinks)
      .join('path')
      .attr('d', (d: any) => fanPath(d))
      .attr('fill', 'none')
      .attr('stroke', (_d: any, i: number) => `url(#sf-n-${i})`)
      .attr('stroke-width', (d: any) => linkStrokeW(d, false))
      .attr('stroke-opacity', 0.85)
      .attr('stroke-linecap', 'round')
      .style('cursor', 'pointer')
      .on('mouseenter', function(event: MouseEvent, d: any) {
        d3.select(this).attr('stroke', '#60a5fa').attr('stroke-opacity', 1).attr('stroke-width', 2.5)
        _showTooltip(event, d)
      })
      .on('mousemove', function(event: MouseEvent, d: any) {
        setTooltip(t => ({ ...t, x: event.clientX, y: event.clientY }))
      })
      .on('mouseleave', function(_: MouseEvent, d: any) {
        const idx = normalLinks.indexOf(d)
        d3.select(this).attr('stroke', `url(#sf-n-${idx})`).attr('stroke-opacity', 0.85).attr('stroke-width', linkStrokeW(d, false))
        setTooltip(t => ({ ...t, visible: false }))
      })

    // ── Draw layer 2: leakage glow halos ─────────────────────────────────

    g.append('g').attr('class', 'leakage-halos')
      .selectAll('path')
      .data(leakageLinks)
      .join('path')
      .attr('d', (d: any) => fanPath(d))
      .attr('fill', 'none')
      .attr('stroke', (d: any) => SEVERITY_COLORS[d.severity as keyof typeof SEVERITY_COLORS] || '#ef4444')
      .attr('stroke-width', (d: any) => linkStrokeW(d, true) + 8)
      .attr('stroke-opacity', 0.08)
      .attr('stroke-linecap', 'round')
      .attr('filter', 'url(#sf-leak-glow)')
      .style('pointer-events', 'none')

    // ── Draw layer 3: leakage main lines ─────────────────────────────────

    g.append('g').attr('class', 'leakage-main')
      .selectAll('path')
      .data(leakageLinks)
      .join('path')
      .attr('d', (d: any) => fanPath(d))
      .attr('fill', 'none')
      .attr('stroke', (_d: any, i: number) => `url(#sf-l-${i})`)
      .attr('stroke-width', (d: any) => linkStrokeW(d, true))
      .attr('stroke-opacity', 0.95)
      .attr('stroke-linecap', 'round')
      .style('cursor', 'pointer')
      .on('mouseenter', function(event: MouseEvent, d: any) {
        const col = SEVERITY_COLORS[d.severity as keyof typeof SEVERITY_COLORS] || '#ef4444'
        d3.select(this).attr('stroke', col).attr('stroke-opacity', 1).attr('stroke-width', linkStrokeW(d, true) + 2)
        _showTooltip(event, d)
      })
      .on('mousemove', function(event: MouseEvent) {
        setTooltip(t => ({ ...t, x: event.clientX, y: event.clientY }))
      })
      .on('mouseleave', function(_: MouseEvent, d: any) {
        const idx = leakageLinks.indexOf(d)
        d3.select(this).attr('stroke', `url(#sf-l-${idx})`).attr('stroke-opacity', 0.95).attr('stroke-width', linkStrokeW(d, true))
        setTooltip(t => ({ ...t, visible: false }))
      })

    // ── Draw layer 4: leakage animated dash pulse ─────────────────────────

    g.append('g').attr('class', 'leakage-pulse')
      .selectAll('path')
      .data(leakageLinks)
      .join('path')
      .attr('d', (d: any) => fanPath(d))
      .attr('fill', 'none')
      .attr('stroke', (d: any) => SEVERITY_COLORS[d.severity as keyof typeof SEVERITY_COLORS] || '#ef4444')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0)
      .attr('stroke-dasharray', '4 10')
      .attr('stroke-linecap', 'round')
      .attr('class', (d: any) => `pulse-${(d.severity || 'CRITICAL').toLowerCase()}`)
      .style('pointer-events', 'none')

    // ── Gap badge: pill label at bezier midpoint ──────────────────────────

    leakageLinks.forEach((l: any) => {
      const gap = l.gap_lakh ?? 0
      if (gap < 1) return
      // Bezier midpoint at t=0.5: point on C(sx,sy,cx,sy,cx,ty,tx,ty)
      const sx  = (l.source as any).x1 ?? 0
      const tx  = (l.target as any).x0 ?? W
      const sy  = l.y0 ?? 0
      const ty  = l.y1 ?? 0
      const cx  = sx + (tx - sx) * 0.5
      // Cubic bezier at t=0.5
      const mx  = 0.125*sx + 0.375*cx + 0.375*cx + 0.125*tx
      const my  = 0.125*sy + 0.375*sy  + 0.375*ty  + 0.125*ty
      const col = SEVERITY_COLORS[l.severity as keyof typeof SEVERITY_COLORS] || '#ef4444'
      const lbl = gap >= 100 ? `₹${(gap/100).toFixed(1)}Cr` : `₹${gap.toFixed(0)}L`
      const pw  = lbl.length * 5.5 + 10

      g.append('rect')
        .attr('x', mx - pw/2).attr('y', my - 7)
        .attr('width', pw).attr('height', 13)
        .attr('rx', 6).attr('fill', '#050c18')
        .attr('stroke', col).attr('stroke-width', 0.8).attr('opacity', 0.92)

      g.append('text')
        .attr('x', mx).attr('y', my + 0.5)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', col).attr('font-size', '12px').attr('font-weight', '700')
        .attr('font-family', '"JetBrains Mono","Fira Code",monospace')
        .text(lbl)
    })

    // ── Draw: nodes ───────────────────────────────────────────────────────

    const nodeG = g.append('g').attr('class', 'nodes')
      .selectAll('g').data(graph.nodes).join('g')

    // Node body — clean flat bar, no flashy effects
    nodeG.append('rect')
      .attr('x',      (d: any) => d.x0)
      .attr('y',      (d: any) => d.y0)
      .attr('width',  (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => Math.max(d.y1 - d.y0, 4))
      .attr('rx', 2)
      .attr('fill', (d: any) => LEVEL_COLORS[d.level as keyof typeof LEVEL_COLORS] || '#3b6fba')
      .attr('opacity', 0.85)

    // Node label — clean white text
    nodeG.append('text')
      .attr('x', (d: any) => d.x0 < W * 0.55 ? d.x1 + 9 : d.x0 - 9)
      .attr('y', (d: any) => (d.y0 + d.y1) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < W * 0.55 ? 'start' : 'end')
      .attr('fill', '#c8d6e8')
      .attr('font-size', '13px')
      .attr('font-family', '"JetBrains Mono","Fira Code",monospace')
      .attr('font-weight', '500')
      .text((d: any) => {
        const name: string = d.name || d.id || ''
        return name.length > 20 ? name.slice(0, 18) + '…' : name
      })

    // Node value sub-label (volume in Lakhs)
    nodeG.filter((d: any) => (d.value ?? 0) > 0)
      .append('text')
      .attr('x', (d: any) => d.x0 < W * 0.55 ? d.x1 + 9 : d.x0 - 9)
      .attr('y', (d: any) => (d.y0 + d.y1) / 2 + 12)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < W * 0.55 ? 'start' : 'end')
      .attr('fill', '#475569')
      .attr('font-size', '10px')
      .attr('font-family', '"JetBrains Mono","Fira Code",monospace')
      .text((d: any) => {
        const v = d.value ?? 0
        return v >= 100 ? `₹${(v / 100).toFixed(1)}Cr` : `₹${v.toFixed(0)}L`
      })

    // ── Node leakage indicator dot (red ring if node has leakage inflows) ─

    const leakageNodeIds = new Set<string>()
    leakageLinks.forEach((l: any) => {
      const tgt = typeof l.target === 'object' ? l.target.id : String(l.target)
      leakageNodeIds.add(tgt)
    })

    graph.nodes.forEach((n: any) => {
      if (!leakageNodeIds.has(n.id)) return
      const cx = n.x0 + (n.x1 - n.x0) / 2
      const cy = n.y0 - 5
      // Pulsing dot above node
      g.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 3)
        .attr('fill', '#ef4444').attr('opacity', 0.9)
        .attr('class', 'pulse-critical')
    })

  }, [data, dims, height])

  // ── Shared tooltip builder (extracted from render to avoid duplication) ──

  const _showTooltip = useCallback((event: MouseEvent, d: any) => {
    const srcName = typeof d.source === 'object' ? (d.source?.id ?? d.source?.name ?? '') : String(d.source ?? '')
    const tgtName = typeof d.target === 'object' ? (d.target?.id ?? d.target?.name ?? '') : String(d.target ?? '')
    const tt = d.tooltip ?? {}
    const releasedLakh  = tt.released_lakh  ?? (d.value ?? 0)
    const absorptionPct = tt.absorption_pct ?? ((d.absorption_ratio ?? 1) * 100)
    const receivedLakh  = (tt.received_lakh && tt.received_lakh > 0)
      ? tt.received_lakh
      : parseFloat(((releasedLakh * absorptionPct) / 100).toFixed(2))
    const gapLakh = parseFloat((releasedLakh - receivedLakh).toFixed(2))
    setTooltip({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      data: {
        from:           tt.from           || d.source_name || srcName || '—',
        to:             tt.to             || d.target_name || tgtName || '—',
        released_lakh:  releasedLakh,
        received_lakh:  receivedLakh,
        gap_lakh:       gapLakh > 0 ? gapLakh : (tt.gap_lakh ?? d.gap_lakh ?? 0),
        absorption_pct: absorptionPct,
        severity:       d.severity        || tt.severity   || 'NORMAL',
        state:          tt.state          || '',
        department:     tt.department     || '',
        leakage_score:  d.leakage_score   ?? (100 - absorptionPct),
        is_leakage:     d.is_leakage      ?? false,
        value:          d.value           ?? 0,
      },
    })
  }, [])

  useEffect(() => { render() }, [render])

  // ── Derived stats (unchanged) ─────────────────────────────────────────────

  const leakageCount = data?.links.filter(l => l.is_leakage).length ?? 0
  const severeCount  = data?.links.filter(l => l.is_severe).length  ?? 0
  const totalGapLakh = data?.links.reduce((s, l) => s + (l.gap_lakh || 0), 0) ?? 0

  const legendItems = [
    { label: 'Centre',      color: LEVEL_COLORS.Centre,     type: 'node' },
    { label: 'State',       color: LEVEL_COLORS.State,      type: 'node' },
    { label: 'District',    color: LEVEL_COLORS.District,   type: 'node' },
    { label: 'Department',  color: LEVEL_COLORS.Department, type: 'node' },
    { label: 'Normal Flow', color: '#3b82f6', type: 'edge', opacity: 0.6  },
    { label: 'Leakage',     color: '#ef4444', type: 'edge', opacity: 0.85 },
    { label: 'Severe',      color: '#ef4444', type: 'edge', opacity: 1.0, bold: true },
  ]

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <style>{`
        @keyframes leakagePulse {
          0%   { stroke-opacity: 0;    stroke-dashoffset: 0;   }
          40%  { stroke-opacity: 0.6;                          }
          100% { stroke-opacity: 0;    stroke-dashoffset: -30; }
        }
        .pulse-critical { animation: leakagePulse 1.8s ease-in-out infinite; }
        .pulse-high     { animation: leakagePulse 2.2s ease-in-out infinite; }
        .pulse-medium   { animation: leakagePulse 2.8s ease-in-out infinite; }
      `}</style>

      {/* Stats bar — unchanged */}
      <div style={{
        display: 'flex', gap: '24px', flexWrap: 'wrap',
        marginBottom: '12px', padding: '10px 14px',
        background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b',
      }}>
        <StatPill label="Nodes"          value={data?.nodes.length ?? 0}          color="#60a5fa" />
        <StatPill label="Flow Edges"     value={data?.links.length ?? 0}          color="#34d399" />
        <StatPill label="Leakage Edges"  value={leakageCount}                     color="#f97316" />
        <StatPill label="Severe"         value={severeCount}                      color="#ef4444" />
        <StatPill label="Total Gap"      value={`₹${totalGapLakh.toFixed(0)}L`}  color="#ef4444" />
      </div>

      {/* SVG chart */}
      <div
        ref={wrapRef}
        style={{
          width: '100%',
          background: 'linear-gradient(160deg, #080f1e 0%, #0c1829 60%, #060d18 100%)',
          borderRadius: '12px',
          border: '1px solid #1a2d47',
          overflow: 'hidden',
          position: 'relative',
          minHeight: `${height}px`,
          boxShadow: 'inset 0 1px 0 rgba(96,165,250,0.06), 0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        <svg ref={svgRef} style={{ display: 'block', width: '100%' }} />

        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#060d1acc',
          }}>
            <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '17px' }}>
              Loading flow data…
            </span>
          </div>
        )}

        {!loading && !data?.nodes?.length && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#334155', fontFamily: 'monospace', fontSize: '17px',
          }}>
            No flow data for selected filter
          </div>
        )}
      </div>

      {/* Legend — unchanged */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '12px',
        marginTop: '12px', padding: '10px 14px',
        background: '#0a0f1e', borderRadius: '8px', border: '1px solid #1e293b',
      }}>
        {legendItems.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.type === 'node' ? (
              <div style={{ width: '10px', height: '16px', background: item.color, borderRadius: '2px', opacity: 0.9 }} />
            ) : (
              <div style={{
                width: '24px', height: '3px', background: item.color,
                opacity: (item as any).opacity, borderRadius: '2px',
                boxShadow: item.label !== 'Normal Flow' ? `0 0 6px ${item.color}` : 'none',
              }} />
            )}
            <span style={{
              color: '#64748b', fontSize: '14px', fontFamily: 'monospace',
              fontWeight: (item as any).bold ? 700 : 400,
            }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <FlowTooltip tooltip={tooltip} />
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ color: '#475569', fontSize: '14px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <span style={{ color, fontWeight: 700, fontSize: '18px', fontFamily: 'monospace' }}>
        {value}
      </span>
    </div>
  )
}