/**
 * Knowledge Base home screen — faithful port of the design source
 * (`Ramboll Developer Hub.dc.html` lines 221–267, logic at 994–1028).
 *
 * Search + category filtering over `DOCS` (category AND query match on
 * title + desc + category), guide card grid, empty state, and the
 * "landing soon" stub rows. Card click opens `/knowledge/{id}` via the
 * `onOpenDoc` callback (wired by the route).
 */
import { useState } from 'react';
import { color, font } from '../../design/tokens';
import { SearchIcon } from '../../design/icons';
import { CATS, DOCS, STUBS, type Doc } from '../../lib/docs-data';
import { badgeStyle } from './blocks';
import './kb.css';

export function KbHomeScreen({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const [kbQuery, setKbQuery] = useState('');
  const [kbCat, setKbCat] = useState('All');

  const q = kbQuery.trim().toLowerCase();
  const match = (d: Doc) =>
    (kbCat === 'All' || d.category === kbCat) &&
    (!q || (d.title + ' ' + d.desc + ' ' + d.category).toLowerCase().includes(q));
  const cards = DOCS.filter(match);
  const stubs = STUBS.filter((s) => !q || s.title.toLowerCase().includes(q));
  const noResults = cards.length === 0 && !!q;

  return (
    <div
      style={{
        padding: '36px 40px 60px',
        maxWidth: 1240,
        margin: '0 auto',
        animation: 'fadeUp 0.5s cubic-bezier(0.2,0.7,0.2,1) both',
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: '0.2em', color: color.cyan300, marginBottom: 10 }}>
        KNOWLEDGE BASE
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px', color: color.white }}>
        Understand everything.
      </h1>
      <p style={{ fontSize: 15, color: color.muted, margin: '0 0 26px', maxWidth: '62ch' }}>
        Standards, golden paths and reference architectures — living, component-based docs with declarative diagrams,
        linkable from every repo, PR and catalog page.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 26 }}>
        <div
          className="kb-search"
          style={{
            flex: 1,
            minWidth: 280,
            maxWidth: 460,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: color.card,
            borderRadius: 9999,
            padding: '10px 18px',
          }}
        >
          <SearchIcon size={15} stroke={color.dim} strokeWidth={2} />
          <input
            value={kbQuery}
            onChange={(e) => setKbQuery(e.target.value)}
            placeholder="Filter guides… try “diagram”"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: color.body,
              fontFamily: font.sans,
              fontSize: 13.5,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATS.map((c) => {
            const sel = kbCat === c;
            return (
              <span
                key={c}
                onClick={() => setKbCat(c)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '7px 15px',
                  borderRadius: 9999,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: sel ? color.cyan500 : 'rgba(204,234,251,0.06)',
                  color: sel ? color.white : color.muted,
                  border: sel ? '1px solid ' + color.cyan500 : '1px solid rgba(155,173,197,0.22)',
                  transition: 'all 140ms',
                }}
              >
                {c}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 12 }}>
        {cards.map((d) => (
          <div
            key={d.id}
            className="kb-card"
            onClick={() => onOpenDoc(d.id)}
            style={{
              background: color.card,
              borderRadius: 12,
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={badgeStyle(d.badge.tone)}>{d.badge.label}</span>
              <span style={{ color: color.cyan300, fontWeight: 800, fontSize: 14 }}>→</span>
            </div>
            <div style={{ fontSize: 17.5, fontWeight: 800, color: color.white, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
              {d.title}
            </div>
            <div style={{ fontSize: 13, color: color.muted, lineHeight: 1.5, flex: 1 }}>{d.desc}</div>
            <div style={{ fontFamily: font.mono, fontSize: 9.5, color: color.dim, letterSpacing: '0.08em' }}>
              {(
                d.read +
                ' · ' +
                d.blocks.filter((x) => x.t === 'diagram').length +
                ' diagrams · upd ' +
                d.updated
              ).toUpperCase()}
            </div>
          </div>
        ))}
      </div>
      {noResults ? (
        <div
          style={{
            padding: 26,
            border: '1px dashed rgba(155,173,197,0.25)',
            borderRadius: 12,
            textAlign: 'center',
            fontSize: 13.5,
            color: color.dim,
            marginBottom: 12,
          }}
        >
          No guides match — try “API”, “event” or “diagram”.
        </div>
      ) : null}
      <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: '0.18em', color: color.faint, margin: '22px 0 12px' }}>
        IN PROGRESS — LANDING SOON
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {stubs.map((s) => (
          <div
            key={s.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '13px 18px',
              border: '1px dashed rgba(155,173,197,0.2)',
              borderRadius: 10,
              background: 'rgba(10,27,51,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: color.muted }}>{s.title}</span>
              <span style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: '0.1em', color: color.faint }}>
                {s.cat.toUpperCase()}
              </span>
            </div>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 9,
                letterSpacing: '0.1em',
                color: color.dim,
                border: '1px solid rgba(105,132,168,0.4)',
                borderRadius: 4,
                padding: '2px 5px',
              }}
            >
              SOON
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
