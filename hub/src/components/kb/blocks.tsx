/**
 * Doc block renderers — faithful port of the design's `buildBlocks()` +
 * TONES + badge styling (`Ramboll Developer Hub.dc.html` lines 653–658,
 * 729–734, 890–928 and the doc-reader markup at lines 283–368).
 *
 * The diagram block renderer lives in `DocDiagram.tsx`.
 */
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { color, font } from '../../design/tokens';
import { PathIcon } from '../../design/icons';
import type { BadgeTone, CalloutTone } from '../../lib/docs-data';
import { RichText } from './RichText';

/* ---------- callout tones (source lines 653–658, verbatim) ---------- */

export const TONES: Record<CalloutTone, { bg: string; bd: string; color: string; icon: string }> = {
  info:    { bg: 'rgba(0,152,235,0.08)',   bd: 'rgba(0,152,235,0.35)',   color: '#66C1F3', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8h.01M12 12v4' },
  warning: { bg: 'rgba(255,230,130,0.07)', bd: 'rgba(255,230,130,0.3)',  color: '#FFE682', icon: 'M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01' },
  success: { bg: 'rgba(173,208,149,0.08)', bd: 'rgba(173,208,149,0.32)', color: '#ADD095', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8.5 12.5l2.5 2.5 4.5-5.5' },
  ai:      { bg: 'rgba(224,212,219,0.07)', bd: 'rgba(192,169,183,0.32)', color: '#C0A9B7', icon: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z' },
};

/* ---------- doc badges (source lines 1013–1021, verbatim) ---------- */

const badgeTone: Record<BadgeTone, [string, string, string]> = {
  cyan: ['rgba(0,152,235,0.14)', '#66C1F3', 'rgba(0,152,235,0.4)'],
  heath: ['rgba(224,212,219,0.12)', '#C0A9B7', 'rgba(192,169,183,0.4)'],
  grass: ['rgba(173,208,149,0.12)', '#ADD095', 'rgba(173,208,149,0.4)'],
};

export function badgeStyle(t: BadgeTone): React.CSSProperties {
  const c = badgeTone[t] ?? badgeTone.cyan;
  return {
    display: 'inline-flex',
    fontFamily: font.mono,
    fontSize: 9.5,
    letterSpacing: '0.14em',
    color: c[1],
    background: c[0],
    border: '1px solid ' + c[2],
    borderRadius: 5,
    padding: '3px 8px',
    fontWeight: 600,
  };
}

/* ---------- p ---------- */

export function PBlock({ md }: { md: string }) {
  return (
    <p
      style={{
        fontSize: 15,
        lineHeight: 1.75,
        color: color.article,
        margin: '0 0 18px',
        textWrap: 'pretty',
      }}
    >
      <RichText md={md} />
    </p>
  );
}

/* ---------- h2 / h3 (registered for the TOC by the reader) ---------- */

export function HeadingBlock({
  level,
  text,
  headingRef,
}: {
  level: 'h2' | 'h3';
  text: string;
  headingRef: (el: HTMLHeadingElement | null) => void;
}) {
  if (level === 'h2') {
    return (
      <h2
        ref={headingRef}
        style={{ fontSize: 22, fontWeight: 800, color: color.white, letterSpacing: '-0.01em', margin: '36px 0 14px' }}
      >
        {text}
      </h2>
    );
  }
  return (
    <h3 ref={headingRef} style={{ fontSize: 17, fontWeight: 800, color: color.cyan100, margin: '26px 0 10px' }}>
      {text}
    </h3>
  );
}

/* ---------- callout ---------- */

export function CalloutBlock({ tone, title, md }: { tone: CalloutTone; title: string; md: string }) {
  const T = TONES[tone] ?? TONES.info;
  return (
    <div
      style={{
        display: 'flex',
        gap: 13,
        alignItems: 'flex-start',
        background: T.bg,
        border: '1px solid ' + T.bd,
        borderRadius: 12,
        padding: '15px 17px',
        margin: '4px 0 20px',
      }}
    >
      <PathIcon d={T.icon} size={18} stroke={T.color} strokeWidth={1.8} style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: color.white, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: color.article, lineHeight: 1.6 }}>
          <RichText md={md} />
        </div>
      </div>
    </div>
  );
}

/* ---------- code (with COPY → COPIED ✓ for 1400ms) ---------- */

export function CodeBlock({ file, lang, code }: { file?: string; lang?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = () => {
    try {
      if (navigator.clipboard) void navigator.clipboard.writeText(code);
    } catch {
      /* clipboard unavailable — label feedback still applies (as in source) */
    }
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div style={{ border: '1px solid rgba(155,173,197,0.16)', borderRadius: 12, overflow: 'hidden', margin: '4px 0 22px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: color.codeHead,
          padding: '8px 14px',
        }}
      >
        <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: '0.08em', color: color.dim }}>
          {file || lang}
        </span>
        <span
          className="kb-copy"
          onClick={copy}
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: '0.1em',
            color: color.cyan300,
            border: '1px solid rgba(102,193,243,0.35)',
            borderRadius: 6,
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'COPIED ✓' : 'COPY'}
        </span>
      </div>
      <pre style={{ margin: 0, padding: '16px 18px', background: color.codeBg, overflowX: 'auto' }}>
        <code style={{ fontFamily: font.mono, fontSize: 12.5, lineHeight: 1.7, color: '#C9E0F2', whiteSpace: 'pre' }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

/* ---------- steps ---------- */

export function StepsBlock({ items }: { items: { title: string; md: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: '4px 0 22px' }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span
            style={{
              flex: 'none',
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1px solid rgba(102,193,243,0.5)',
              color: color.cyan300,
              fontFamily: font.mono,
              fontSize: 10.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 1,
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: color.white, marginBottom: 3 }}>{it.title}</div>
            <div style={{ fontSize: 13.5, color: color.article, lineHeight: 1.6 }}>
              <RichText md={it.md} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- table ---------- */

export function TableBlock({ head, rows }: { head: string[]; rows: string[][] }) {
  const cols = head.length;
  const grid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1.25fr ' + '1fr '.repeat(cols - 1).trim(),
    gap: 14,
    padding: '11px 18px',
    alignItems: 'baseline',
  };
  return (
    <div style={{ border: '1px solid rgba(155,173,197,0.16)', borderRadius: 12, overflow: 'hidden', margin: '4px 0 22px' }}>
      <div
        style={{
          ...grid,
          background: color.card,
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          color: color.dim,
          textTransform: 'uppercase',
        }}
      >
        {head.map((hc, i) => (
          <span key={i}>{hc}</span>
        ))}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={{ ...grid, borderTop: '1px solid rgba(155,173,197,0.08)' }}>
          {r.map((c, ci) => (
            <div
              key={ci}
              style={
                ci === 0
                  ? { fontSize: 13, fontWeight: 800, color: color.white }
                  : { fontSize: 12.5, color: color.muted, lineHeight: 1.5 }
              }
            >
              <RichText md={c} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- divider ---------- */

export function DividerBlock() {
  return <div style={{ height: 1, background: 'rgba(155,173,197,0.15)', margin: '28px 0' }} />;
}
