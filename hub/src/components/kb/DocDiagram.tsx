/**
 * Doc diagram renderer — faithful port of the design's `prepFlow` / `prepSeq` /
 * `prepDiagram` / `flowNode` (`Ramboll Developer Hub.dc.html` lines 748–888)
 * over the layout engine (`~/lib/diagram-engine`).
 *
 * Light canvas card: title + FLOW/SEQUENCE tag, dotted stage scaled
 * `min(1, 706/w)` clamped ≥ 0.68, SVG edges (edgeDraw animation, dashed
 * variants, arrowheads, white label pills), absolutely-positioned nodes
 * (popIn staggered), hover highlights connected nodes and dims the rest,
 * legend chips from the kinds actually used.
 */
import { Fragment, useMemo, useState } from 'react';
import type * as React from 'react';
import { font } from '../../design/tokens';
import {
  KINDS,
  layoutFlow,
  layoutSequence,
  type DiagramSpec,
  type FlowSpec,
  type NodeKind,
  type SequenceSpec,
} from '../../lib/diagram-engine';

/* ---------- shared stage math (prepDiagram, lines 874–882) ---------- */

function diagramScale(w: number): number {
  let scale = Math.min(1, 706 / w);
  if (scale < 0.68) scale = 0.68;
  return scale;
}

function wrapStyle(w: number, h: number, scale: number): React.CSSProperties {
  return { width: w * scale, height: h * scale, position: 'relative', margin: '0 auto' };
}

function stageStyle(w: number, h: number, scale: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: w,
    height: h,
    transform: 'scale(' + scale + ')',
    transformOrigin: '0 0',
    backgroundImage: 'radial-gradient(rgba(39,57,67,0.13) 1px, transparent 1.4px)',
    backgroundSize: '20px 20px',
    borderRadius: 8,
  };
}

const svgOverlayStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, overflow: 'visible' };

/* ---------- flow stage (prepFlow + flowNode, lines 749–820) ---------- */

function FlowStage({ spec }: { spec: FlowSpec }) {
  const L = useMemo(() => layoutFlow(spec), [spec]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const conn = new Set<string>();
  if (hoverKey) {
    conn.add(hoverKey);
    for (const e of L.edges) {
      if (e.from === hoverKey) conn.add(e.to);
      if (e.to === hoverKey) conn.add(e.from);
    }
  }
  const scale = diagramScale(L.w);

  return (
    <div style={wrapStyle(L.w, L.h, scale)}>
      <div style={stageStyle(L.w, L.h, scale)}>
        <svg width={L.w} height={L.h} viewBox={'0 0 ' + L.w + ' ' + L.h} style={svgOverlayStyle}>
          {L.groups.map((g, i) => (
            <Fragment key={'g' + i}>
              <rect
                x={g.x}
                y={g.y}
                width={g.w}
                height={g.h}
                rx={14}
                fill="rgba(39,57,67,0.035)"
                stroke="rgba(39,57,67,0.3)"
                strokeDasharray="5 5"
                strokeWidth={1}
              />
              <text
                x={g.x + 14}
                y={g.y + 20}
                fontFamily={font.mono}
                fontSize={9.5}
                letterSpacing="0.14em"
                fill="#526169"
                fontWeight={600}
              >
                {g.label}
              </text>
            </Fragment>
          ))}
          {L.edges.map((e, i) => {
            const hl = hoverKey != null && (e.from === hoverKey || e.to === hoverKey);
            const dim = hoverKey != null && !hl;
            const stroke = hl ? '#0098EB' : dim ? '#D9DCDE' : '#8A959B';
            const base = {
              fill: 'none',
              stroke,
              strokeWidth: hl ? 2.2 : 1.6,
              strokeLinecap: 'round' as const,
            };
            const p =
              e.arrow === 'right'
                ? e.x2 + ',' + e.y2 + ' ' + (e.x2 - 9) + ',' + (e.y2 - 5) + ' ' + (e.x2 - 9) + ',' + (e.y2 + 5)
                : e.arrow === 'down'
                  ? e.x2 + ',' + e.y2 + ' ' + (e.x2 - 5) + ',' + (e.y2 - 9) + ' ' + (e.x2 + 5) + ',' + (e.y2 - 9)
                  : e.x2 + ',' + e.y2 + ' ' + (e.x2 - 5) + ',' + (e.y2 + 9) + ' ' + (e.x2 + 5) + ',' + (e.y2 + 9);
            const labelW = e.label ? e.label.length * 6.4 + 14 : 0;
            return (
              <Fragment key={'e' + i}>
                {e.dashed ? (
                  <path
                    d={e.d}
                    strokeDasharray="5 5"
                    style={{ animation: 'fadeIn 0.4s ease ' + (250 + i * 70) + 'ms both' }}
                    {...base}
                  />
                ) : (
                  <path
                    d={e.d}
                    pathLength={1}
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: 1,
                      animation: 'edgeDraw 0.55s ease-out ' + (180 + i * 70) + 'ms both',
                    }}
                    {...base}
                  />
                )}
                <polygon points={p} fill={stroke} style={{ animation: 'fadeIn 0.3s ease ' + (450 + i * 70) + 'ms both' }} />
                {e.label ? (
                  <>
                    <rect
                      x={e.lx - labelW / 2}
                      y={e.ly - 10}
                      width={labelW}
                      height={20}
                      rx={8}
                      fill="#FFFFFF"
                      stroke={dim ? '#EFF0F0' : '#E3E1D8'}
                      style={{ animation: 'fadeIn 0.3s ease ' + (400 + i * 70) + 'ms both' }}
                    />
                    <text
                      x={e.lx}
                      y={e.ly + 3.5}
                      textAnchor="middle"
                      fontFamily={font.sans}
                      fontSize={10.5}
                      fontWeight={700}
                      fill={dim ? '#A9B0B4' : '#273943'}
                      style={{ animation: 'fadeIn 0.3s ease ' + (400 + i * 70) + 'ms both' }}
                    >
                      {e.label}
                    </text>
                  </>
                ) : null}
              </Fragment>
            );
          })}
        </svg>
        {L.nodes.map((n, i) => {
          const K = KINDS[n.kind ?? 'primary'] ?? KINDS.primary;
          const hovered = hoverKey === n.id;
          const dimmed = hoverKey != null && !conn.has(n.id);
          return (
            <div
              key={n.id}
              onMouseEnter={() => setHoverKey(n.id)}
              onMouseLeave={() => setHoverKey(null)}
              style={{
                position: 'absolute',
                left: n.x,
                top: n.y,
                width: n.w,
                height: n.h,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                textAlign: 'center',
                padding: n.diamond ? '4px 24px' : '4px 12px',
                borderRadius: n.shape === 'pill' ? 9999 : 10,
                background: n.diamond ? 'transparent' : K.fill,
                border: n.diamond ? 'none' : '1.5px ' + (K.dashed ? 'dashed' : 'solid') + ' ' + K.stroke,
                color: K.text,
                boxShadow:
                  hovered && !n.diamond
                    ? '0 10px 26px rgba(5,50,110,0.22)'
                    : n.diamond
                      ? 'none'
                      : '0 1px 2px rgba(5,50,110,0.08)',
                filter: dimmed
                  ? 'grayscale(0.4) opacity(0.3)'
                  : hovered && n.diamond
                    ? 'drop-shadow(0 8px 14px rgba(5,50,110,0.25))'
                    : 'none',
                transition: 'box-shadow 0.18s, filter 0.18s',
                animation: 'popIn 0.4s cubic-bezier(0.2,0.7,0.2,1) ' + i * 70 + 'ms both',
                cursor: 'default',
                zIndex: hovered ? 3 : 2,
              }}
            >
              {n.diamond ? (
                <svg
                  viewBox={'0 0 ' + n.w + ' ' + n.h}
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
                >
                  <polygon
                    points={
                      n.w / 2 + ',1 ' + (n.w - 1) + ',' + n.h / 2 + ' ' + n.w / 2 + ',' + (n.h - 1) + ' 1,' + n.h / 2
                    }
                    fill={K.fill}
                    stroke={K.stroke}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
              <span style={{ position: 'relative', zIndex: 1, fontSize: 12.5, fontWeight: 800, lineHeight: 1.15, color: K.text }}>
                {n.label}
              </span>
              {n.sub ? (
                <span
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    fontFamily: font.mono,
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    opacity: 0.75,
                    color: K.text,
                  }}
                >
                  {n.sub}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- sequence stage (prepSeq, lines 822–866) ---------- */

function SequenceStage({ spec }: { spec: SequenceSpec }) {
  const L = useMemo(() => layoutSequence(spec), [spec]);
  const scale = diagramScale(L.w);

  return (
    <div style={wrapStyle(L.w, L.h, scale)}>
      <div style={stageStyle(L.w, L.h, scale)}>
        <svg width={L.w} height={L.h} viewBox={'0 0 ' + L.w + ' ' + L.h} style={svgOverlayStyle}>
          {L.lifelines.map((l, i) => (
            <line key={'ll' + i} x1={l.x} y1={l.y1 + 6} x2={l.x} y2={l.y2} stroke="#C6CBCE" strokeWidth={1.5} strokeDasharray="4 5" />
          ))}
          {L.messages.map((m, i) => {
            const stroke = m.dashed ? '#8A959B' : '#526169';
            const anim: React.CSSProperties = { animation: 'fadeIn 0.35s ease ' + (200 + i * 100) + 'ms both' };
            if (m.self) {
              return (
                <Fragment key={'m' + i}>
                  <path
                    d={'M ' + m.x + ' ' + m.y + ' c 58 0 58 30 0 30'}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.6}
                    strokeDasharray={m.dashed ? '5 5' : 'none'}
                    style={anim}
                  />
                  <polygon
                    points={m.x + 2 + ',' + (m.y + 30) + ' ' + (m.x + 11) + ',' + (m.y + 25) + ' ' + (m.x + 11) + ',' + (m.y + 35)}
                    fill={stroke}
                    style={anim}
                  />
                  <text x={m.x + 62} y={m.y + 19} fontFamily={font.sans} fontSize={10.5} fontWeight={700} fill="#273943" style={anim}>
                    {m.label}
                  </text>
                </Fragment>
              );
            }
            const tip = m.dirRight
              ? m.x2 + ',' + m.y + ' ' + (m.x2 - 9) + ',' + (m.y - 5) + ' ' + (m.x2 - 9) + ',' + (m.y + 5)
              : m.x2 + ',' + m.y + ' ' + (m.x2 + 9) + ',' + (m.y - 5) + ' ' + (m.x2 + 9) + ',' + (m.y + 5);
            const mid = (m.x1 + m.x2) / 2;
            const w = m.label.length * 6.2 + 14;
            return (
              <Fragment key={'m' + i}>
                <line
                  x1={m.x1}
                  y1={m.y}
                  x2={m.x2}
                  y2={m.y}
                  stroke={stroke}
                  strokeWidth={1.6}
                  strokeDasharray={m.dashed ? '5 5' : 'none'}
                  style={anim}
                />
                <polygon points={tip} fill={stroke} style={anim} />
                <rect x={mid - w / 2} y={m.y - 24} width={w} height={18} rx={7} fill="#FFFFFF" stroke="#E3E1D8" style={anim} />
                <text x={mid} y={m.y - 11} textAnchor="middle" fontFamily={font.sans} fontSize={10.5} fontWeight={700} fill="#273943" style={anim}>
                  {m.label}
                </text>
              </Fragment>
            );
          })}
        </svg>
        {L.actors.map((a, i) => {
          const K = KINDS[a.kind ?? 'primary'] ?? KINDS.primary;
          return (
            <div
              key={a.id}
              style={{
                position: 'absolute',
                left: a.x,
                top: a.y,
                width: a.w,
                height: a.h,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                background: K.fill,
                border: '1.5px ' + (K.dashed ? 'dashed' : 'solid') + ' ' + K.stroke,
                color: K.text,
                boxShadow: '0 1px 2px rgba(5,50,110,0.08)',
                animation: 'popIn 0.4s cubic-bezier(0.2,0.7,0.2,1) ' + i * 80 + 'ms both',
                zIndex: 2,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 800, color: K.text }}>{a.label}</span>
              {a.sub ? <span style={{ fontFamily: font.mono, fontSize: 9, opacity: 0.75, color: K.text }}>{a.sub}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- card frame + legend (prepDiagram + reader markup 338–364) ---------- */

export function DocDiagram({ title, spec }: { title?: string; spec: DiagramSpec }) {
  const isSeq = spec.kind === 'sequence';
  const uniq: NodeKind[] = [
    ...new Set((isSeq ? (spec as SequenceSpec).actors : (spec as FlowSpec).nodes).map((n) => n.kind ?? 'primary')),
  ];
  return (
    <div style={{ background: '#F9F9F7', border: '1px solid rgba(155,173,197,0.25)', borderRadius: 12, margin: '6px 0 22px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px 10px' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#273943' }}>{title || 'Diagram'}</span>
        <span style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: '0.16em', color: '#7D888E' }}>
          {isSeq ? 'SEQUENCE' : 'FLOW'}
        </span>
      </div>
      <div style={{ overflowX: 'auto', padding: '4px 18px 6px' }}>
        {isSeq ? <SequenceStage spec={spec as SequenceSpec} /> : <FlowStage spec={spec as FlowSpec} />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '10px 18px 13px', borderTop: '1px solid rgba(39,57,67,0.08)' }}>
        {uniq.map((kk) => {
          const K = KINDS[kk];
          return (
            <span
              key={kk}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: '0.08em',
                color: '#526169',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: K.fill,
                  border: '1px ' + (K.dashed ? 'dashed' : 'solid') + ' ' + K.stroke,
                  display: 'inline-block',
                }}
              />
              {K.name.toUpperCase()}
            </span>
          );
        })}
      </div>
    </div>
  );
}
