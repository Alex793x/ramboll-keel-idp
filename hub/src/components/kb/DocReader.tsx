/**
 * Doc reader — faithful port of the design source
 * (`Ramboll Developer Hub.dc.html` lines 269–394, block assembly at 890–928,
 * scroll helpers at 729–746).
 *
 * Two-column layout: article (typed blocks) + sticky aside with the
 * "ON THIS PAGE" TOC (h2/h3, click scrolls to the heading with a 20px
 * offset inside the nearest scrollable container) and the meta card.
 */
import { useEffect, useMemo, useRef } from 'react';
import { color, font } from '../../design/tokens';
import type { Doc } from '../../lib/docs-data';
import {
  badgeStyle,
  CalloutBlock,
  CodeBlock,
  DividerBlock,
  HeadingBlock,
  PBlock,
  StepsBlock,
  TableBlock,
} from './blocks';
import { DocDiagram } from './DocDiagram';
import './kb.css';

/** Nearest scrollable ancestor — the design scrolls its own main container. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let c: HTMLElement | null = el.parentElement;
  while (c) {
    const oy = typeof getComputedStyle === 'function' ? getComputedStyle(c).overflowY : '';
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && c.scrollHeight > c.clientHeight) return c;
    c = c.parentElement;
  }
  return null;
}

export function DocReader({ doc, onBack }: { doc: Doc; onBack: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headsRef = useRef<Record<string, HTMLElement | null>>({});

  // Design's openDoc(): scroll the container back to the top on open.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const root = rootRef.current;
      const c = root ? scrollParentOf(root) : null;
      if (c) c.scrollTo({ top: 0 });
      else if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(raf);
  }, [doc.id]);

  // Design's scrollToHead(): 20px offset above the heading, smooth.
  const scrollToHead = (hid: string) => {
    const el = headsRef.current[hid];
    if (!el) return;
    const c = scrollParentOf(el);
    if (c) {
      const top = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 20;
      c.scrollTo({ top, behavior: 'smooth' });
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
    }
  };

  const toc = useMemo(
    () =>
      doc.blocks.flatMap((b, bi) =>
        b.t === 'h2' || b.t === 'h3' ? [{ hid: doc.id + ':' + bi, label: b.text, level: b.t }] : [],
      ),
    [doc],
  );

  const metaRows = [
    { l: 'OWNER', v: doc.owner },
    { l: 'UPDATED', v: doc.updated },
    { l: 'VERSION', v: doc.version },
    { l: 'READ TIME', v: doc.read },
  ];

  return (
    <div
      ref={rootRef}
      style={{
        padding: '30px 40px 90px',
        maxWidth: 1180,
        margin: '0 auto',
        animation: 'fadeUp 0.5s cubic-bezier(0.2,0.7,0.2,1) both',
      }}
    >
      <div
        className="kb-back"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: 24,
        }}
      >
        ← Knowledge Base
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', gap: 46, alignItems: 'start' }}>
        <article style={{ maxWidth: 780, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={badgeStyle(doc.badge.tone)}>{doc.badge.label}</span>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: '0.14em',
                color: color.dim,
                textTransform: 'uppercase',
              }}
            >
              {doc.category}
            </span>
          </div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
              margin: '0 0 12px',
              color: color.white,
              textWrap: 'balance',
            }}
          >
            {doc.title}
          </h1>
          <p style={{ fontSize: 16, color: color.muted, lineHeight: 1.6, margin: '0 0 26px' }}>{doc.desc}</p>
          <div style={{ height: 1, background: 'rgba(155,173,197,0.15)', marginBottom: 28 }} />

          {doc.blocks.map((b, bi) => {
            const key = doc.id + ':' + bi;
            switch (b.t) {
              case 'p':
                return <PBlock key={key} md={b.md} />;
              case 'h2':
              case 'h3':
                return (
                  <HeadingBlock
                    key={key}
                    level={b.t}
                    text={b.text}
                    headingRef={(el) => {
                      headsRef.current[key] = el;
                    }}
                  />
                );
              case 'callout':
                return <CalloutBlock key={key} tone={b.tone} title={b.title} md={b.md} />;
              case 'code':
                return <CodeBlock key={key} file={b.file} lang={b.lang} code={b.code} />;
              case 'steps':
                return <StepsBlock key={key} items={b.items} />;
              case 'table':
                return <TableBlock key={key} head={b.head} rows={b.rows} />;
              case 'diagram':
                return <DocDiagram key={key} title={b.title} spec={b.spec} />;
              case 'divider':
                return <DividerBlock key={key} />;
              default:
                return null;
            }
          })}
        </article>

        <aside style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: '0.18em', color: color.faint, marginBottom: 10 }}>
              ON THIS PAGE
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(155,173,197,0.15)' }}>
              {toc.map((ti) => (
                <span
                  key={ti.hid}
                  className="kb-toc-item"
                  onClick={() => scrollToHead(ti.hid)}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    padding: '5px 0 5px ' + (ti.level === 'h3' ? 26 : 12) + 'px',
                    cursor: 'pointer',
                    lineHeight: 1.35,
                  }}
                >
                  {ti.label}
                </span>
              ))}
            </div>
          </div>
          <div
            style={{
              background: color.card,
              border: '1px solid rgba(155,173,197,0.14)',
              borderRadius: 12,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {metaRows.map((mr) => (
              <div key={mr.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: '0.12em', color: color.dim }}>{mr.l}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: color.body, textAlign: 'right' }}>{mr.v}</span>
              </div>
            ))}
            <button
              type="button"
              className="kb-ask"
              style={{
                marginTop: 4,
                padding: '9px 14px',
                borderRadius: 9999,
                border: '1px solid rgba(102,193,243,0.4)',
                color: color.cyan300,
                fontFamily: font.sans,
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Ask the agent about this page
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
