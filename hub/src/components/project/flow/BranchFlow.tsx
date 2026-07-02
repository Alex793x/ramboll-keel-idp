/**
 * BranchFlow — "the Flow" (SPEC §18.3): the novel branch-exploration
 * centerpiece of the project dashboard. Three permanent rails (main brightest
 * + shield, staging, dev) and working branches as tributaries forking off dev
 * with curved SVG connectors (dashed return curve when a PR is open).
 *
 * Purely presentational: no fetching, no router. Internal state is hover +
 * focus only; `onSelect` fires on focus-mode enter/leave.
 *
 * Motion & idiom sources: DocDiagram (hover connect/dim + svg overlay),
 * LiveBlueprint (glass nodes), global.css keyframes (fadeUp, popIn, pulseDot,
 * ringPulse, edgeDraw) — reused, never redefined. Layout math lives in the
 * pure `flow-model.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { color, font } from '../../../design/tokens';
import type { CiState, OverviewBranch } from '../../../lib/types';
import {
  KIND_COLOR,
  LABEL_W,
  LANE_GAP,
  LANE_H,
  MAX_TICKS,
  RAIL_GAP,
  RAIL_H,
  RAIL_ORDER,
  RETURN_INSET,
  SECTION_GAP,
  ariaLabelFor,
  avatarGradient,
  ciGlyph,
  commitTickPositions,
  initials,
  laneGeometry,
  middleTruncate,
  relAge,
  splitBranches,
  type RailKind,
  type TributaryKind,
} from './flow-model';
import './flow.css';

export interface BranchFlowProps {
  branches: OverviewBranch[];
  /** Fires on focus-mode enter (`name`) and leave (`null`). */
  onSelect?: (name: string | null) => void;
}

/* ── rail cosmetics ─────────────────────────────────────────────────────── */

const RAIL_LINE: Record<RailKind, string> = {
  main: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(255,255,255,0.06))',
  staging: 'linear-gradient(90deg, rgba(102,193,243,0.6), rgba(102,193,243,0.07))',
  dev: 'linear-gradient(90deg, #0098EB, rgba(0,152,235,0.10))',
};

const RAIL_LABEL: Record<RailKind, string> = {
  main: color.white,
  staging: color.muted,
  dev: color.cyan300,
};

/* ── tiny inline glyphs ─────────────────────────────────────────────────── */

function ShieldGlyph() {
  return (
    <svg width={12} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2 L20 6 V11 C20 16.5 16.6 20.6 12 22 C7.4 20.6 4 16.5 4 11 V6 Z"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M8.5 11.5 L11 14 L15.5 9"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckGlyph({ stroke, size }: { stroke: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12.5 L9.5 18 L20 6.5"
        stroke={stroke}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossGlyph({ stroke, size }: { stroke: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6 L18 18 M18 6 L6 18" stroke={stroke} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** CI state at a lane tip / rail edge: pulse, ✓, ✗ or a faint hollow dot. */
function CiTip({ state, size = 12 }: { state: CiState; size?: number }) {
  const g = ciGlyph(state);
  if (state === 'running') {
    return (
      <span
        className="rdh-flow-ci rdh-flow-ci--running"
        title={g.label}
        style={{
          width: size - 3,
          height: size - 3,
          borderRadius: '50%',
          background: g.color,
          flex: 'none',
          animation: 'ringPulse 1.6s ease-out infinite, pulseDot 1.6s ease-in-out infinite',
        }}
      />
    );
  }
  if (state === 'passed') {
    return (
      <span className="rdh-flow-ci" title={g.label} style={{ display: 'inline-flex', flex: 'none' }}>
        <CheckGlyph stroke={g.color} size={size} />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="rdh-flow-ci" title={g.label} style={{ display: 'inline-flex', flex: 'none' }}>
        <CrossGlyph stroke={g.color} size={size} />
      </span>
    );
  }
  return (
    <span
      className="rdh-flow-ci rdh-flow-ci--none"
      title={g.label}
      style={{
        width: size - 4,
        height: size - 4,
        borderRadius: '50%',
        border: '1.5px solid rgba(105,132,168,0.5)',
        flex: 'none',
      }}
    />
  );
}

/* ── the component ──────────────────────────────────────────────────────── */

export function BranchFlow({ branches, onSelect }: BranchFlowProps) {
  const { rails, tributaries } = useMemo(() => splitBranches(branches), [branches]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [kbIndex, setKbIndex] = useState(-1);
  const laneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);

  const setFocus = (name: string | null) => {
    setFocused(name);
    onSelect?.(name);
  };
  const toggleFocus = (name: string) => setFocus(focused === name ? null : name);

  // Click-away exits focus mode. Clicks landing on another lane are left to
  // that lane's own click handler (which switches focus directly).
  useEffect(() => {
    if (focused == null) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.('[data-rdh-lane]')) {
        setFocused(null);
        onSelect?.(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [focused, onSelect]);

  // Roving keyboard focus through the tributaries; Enter toggles focus mode.
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (tributaries.length === 0) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next =
        kbIndex < 0
          ? delta === 1
            ? 0
            : tributaries.length - 1
          : Math.min(tributaries.length - 1, Math.max(0, kbIndex + delta));
      setKbIndex(next);
      laneRefs.current[next]?.focus();
    } else if (e.key === 'Enter') {
      const branch = kbIndex >= 0 ? tributaries[kbIndex] : undefined;
      if (branch) {
        e.preventDefault();
        toggleFocus(branch.name);
      }
    } else if (e.key === 'Escape') {
      if (focused != null) setFocus(null);
    }
  };

  // The branch driving the connect/dim emphasis (hover wins over focus).
  const active = hovered ?? focused;

  return (
    <div className="rdh-flow" style={{ position: 'relative', width: '100%' }}>
      {/* ── rails ─────────────────────────────────────────────────────── */}
      <div
        className="rdh-flow-rails"
        style={{ display: 'flex', flexDirection: 'column', gap: RAIL_GAP }}
      >
        {RAIL_ORDER.map((railKind, railIdx) => {
          const rail = rails[railIdx] ?? null;
          if (!rail) return null;
          return (
            <div
              key={railKind}
              className={'rdh-flow-rail' + (active != null ? ' rdh-flow-dim' : '')}
              aria-label={`${rail.name} rail, ${ciGlyph(rail.ci).label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                height: RAIL_H,
                borderRadius: 10,
                padding: '0 12px',
                animation: `fadeUp 0.4s ease ${railIdx * 80}ms both`,
              }}
            >
              <span
                style={{
                  width: LABEL_W - 12,
                  flex: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: font.mono,
                  fontSize: 12.5,
                  fontWeight: railKind === 'main' ? 600 : 500,
                  letterSpacing: '0.02em',
                  color: RAIL_LABEL[railKind],
                }}
              >
                {railKind === 'main' ? <ShieldGlyph /> : null}
                {rail.name}
              </span>
              <span
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 2,
                  background: RAIL_LINE[railKind],
                  transformOrigin: 'left center',
                  animation: `rdhFlowRailIn 0.55s ease-out ${railIdx * 90}ms both`,
                }}
              />
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 'none',
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.dim,
                }}
              >
                {rail.ci !== 'none' ? <CiTip state={rail.ci} size={11} /> : null}
                <span style={{ color: color.muted }}>{rail.tip.sha.slice(0, 7)}</span>
                <span>{relAge(rail.tip.at, now)}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* ── tributaries ───────────────────────────────────────────────── */}
      {tributaries.length === 0 ? (
        <div
          className="rdh-flow-empty"
          style={{
            marginTop: SECTION_GAP,
            border: '1px dashed rgba(155,173,197,0.28)',
            borderRadius: 12,
            padding: '26px 16px',
            textAlign: 'center',
            fontFamily: font.mono,
            fontSize: 12,
            color: color.dim,
            animation: 'fadeUp 0.4s ease 240ms both',
          }}
        >
          No working branches — start one:{' '}
          <span style={{ color: color.cyan300 }}>git switch -c feature/&lt;ticket&gt;-&lt;slug&gt;</span>
        </div>
      ) : (
        <div
          className="rdh-flow-tribs"
          role="list"
          aria-label="Working branches"
          tabIndex={0}
          onKeyDown={onListKeyDown}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: LANE_GAP,
            marginTop: SECTION_GAP,
            borderRadius: 12,
          }}
        >
          {/* fork connectors: dev rail → each lane (left-anchored overlay) */}
          <svg
            className="rdh-flow-connectors"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {tributaries.map((b, i) => {
              const g = laneGeometry(i, tributaries.length);
              const kindColor = KIND_COLOR[b.kind as TributaryKind] ?? color.cyan300;
              const isActive = active === b.name;
              const ghost = focused != null && b.name !== focused;
              const dim = !ghost && hovered != null && b.name !== hovered;
              return (
                <g
                  key={b.name}
                  className={
                    'rdh-flow-connector' +
                    (ghost ? ' rdh-flow-ghost' : '') +
                    (dim ? ' rdh-flow-dim' : '')
                  }
                >
                  <circle cx={g.forkX} cy={g.devY} r={2.5} fill={kindColor} fillOpacity={isActive ? 1 : 0.7} />
                  <path
                    d={g.connectorD}
                    fill="none"
                    stroke={kindColor}
                    strokeOpacity={isActive ? 1 : 0.6}
                    strokeWidth={isActive ? 2.4 : 1.8}
                    strokeLinecap="round"
                    pathLength={1}
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: 1,
                      animation: `edgeDraw 0.55s ease-out ${180 + i * 70}ms both`,
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* dashed PR "merge intent" returns (right-anchored overlay) */}
          <svg
            className="rdh-flow-returns"
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: RETURN_INSET,
              top: 0,
              width: 0,
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {tributaries.map((b, i) => {
              if (!b.pr) return null;
              const g = laneGeometry(i, tributaries.length);
              const kindColor = KIND_COLOR[b.kind as TributaryKind] ?? color.cyan300;
              const ghost = focused != null && b.name !== focused;
              const dim = !ghost && hovered != null && b.name !== hovered;
              const pillText = `PR #${b.pr.number}`;
              const pillW = pillText.length * 6.4 + 16;
              return (
                <g
                  key={b.name}
                  className={
                    'rdh-flow-return' +
                    (ghost ? ' rdh-flow-ghost' : '') +
                    (dim ? ' rdh-flow-dim' : '')
                  }
                  style={{ animation: `fadeIn 0.4s ease ${320 + i * 70}ms both` }}
                >
                  <path
                    d={g.returnD}
                    fill="none"
                    stroke={kindColor}
                    strokeOpacity={active === b.name ? 0.95 : 0.55}
                    strokeWidth={1.6}
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                  />
                  <g transform={`translate(${g.returnMid.x}, ${g.returnMid.y})`}>
                    <rect
                      x={-pillW / 2}
                      y={-9.5}
                      width={pillW}
                      height={19}
                      rx={9.5}
                      fill="#0A1B33"
                      stroke="rgba(102,193,243,0.4)"
                    />
                    <text
                      textAnchor="middle"
                      y={3.5}
                      fontFamily={font.mono}
                      fontSize={9.5}
                      fill={color.cyan200}
                    >
                      {pillText}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {tributaries.map((b, i) => {
            const isOpen = focused === b.name;
            const isHovered = hovered === b.name;
            const dimmed = active != null && b.name !== active;
            const kindColor = KIND_COLOR[b.kind as TributaryKind] ?? color.cyan300;
            const commits = b.commits.slice(0, MAX_TICKS);
            const ticks = commitTickPositions(commits, 100);
            return (
              <div
                key={b.name}
                role="listitem"
                ref={(el) => {
                  laneRefs.current[i] = el;
                }}
                tabIndex={kbIndex === i ? 0 : -1}
                aria-expanded={isOpen}
                aria-label={ariaLabelFor(b)}
                data-rdh-lane={b.name}
                onFocus={() => setKbIndex(i)}
                onMouseEnter={() => setHovered(b.name)}
                onMouseLeave={() => setHovered(null)}
                className={
                  'rdh-flow-lane' +
                  (isOpen ? ' rdh-flow-lane--open' : '') +
                  (isHovered ? ' rdh-flow-lane--lift' : '') +
                  (dimmed ? ' rdh-flow-dim' : '')
                }
                style={{
                  position: 'relative',
                  zIndex: 1,
                  borderRadius: 12,
                  border: '1px solid rgba(102,193,243,0.16)',
                  background: 'linear-gradient(180deg, rgba(10,27,51,0.92), rgba(8,21,39,0.92))',
                  animation: `popIn 0.4s cubic-bezier(0.2,0.7,0.2,1) ${i * 70}ms both`,
                }}
              >
                {/* lane header */}
                <div
                  className="rdh-flow-lanehead"
                  onClick={() => toggleFocus(b.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    height: LANE_H,
                    padding: '0 14px',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flex: 'none',
                      background: kindColor,
                      boxShadow: `0 0 8px ${kindColor}55`,
                    }}
                  />
                  <span
                    title={b.name}
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12.5,
                      color: color.body,
                      whiteSpace: 'nowrap',
                      flex: 'none',
                    }}
                  >
                    {middleTruncate(b.name, 34)}
                  </span>
                  {b.author ? (
                    <>
                      <span
                        title={b.author.name}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          flex: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 8.5,
                          fontWeight: 800,
                          color: color.white,
                          background: avatarGradient(b.author.github_login),
                        }}
                      >
                        {initials(b.author.name)}
                      </span>
                      <span style={{ fontSize: 11, color: color.dim, whiteSpace: 'nowrap' }}>
                        {b.author.github_login}
                      </span>
                    </>
                  ) : null}

                  {/* commit ticks on a hairline, recency-spaced */}
                  <span
                    className="rdh-flow-ticks"
                    style={{
                      flex: 1,
                      position: 'relative',
                      height: 16,
                      margin: '0 14px',
                      minWidth: 48,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        height: 1,
                        background: 'rgba(155,173,197,0.22)',
                      }}
                    />
                    {commits.map((c, ti) => (
                      <span
                        key={c.sha}
                        className="rdh-flow-tick"
                        style={{
                          position: 'absolute',
                          left: `${ticks[ti] ?? 0}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 14,
                          height: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span
                          className="rdh-flow-tickdot"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: kindColor,
                            opacity: 0.9,
                          }}
                        />
                        <span className="rdh-flow-tip">
                          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.cyan200 }}>
                            {c.sha.slice(0, 7)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: color.body,
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.message}
                          </span>
                          <span style={{ fontSize: 10, color: color.dim }}>{relAge(c.at, now)}</span>
                        </span>
                      </span>
                    ))}
                  </span>

                  {/* ahead/behind + CI at the tip */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flex: 'none',
                      fontFamily: font.mono,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: color.cyan300 }}>+{b.ahead}</span>
                    <span style={{ color: '#6984A8' }}>−{b.behind}</span>
                  </span>
                  <CiTip state={b.ci} />
                </div>

                {/* focus-mode detail strip (0fr → 1fr expansion) */}
                <div className="rdh-flow-detail" aria-hidden={!isOpen}>
                  <div className="rdh-flow-detail-inner">
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                        padding: '2px 16px 14px 32px',
                        borderTop: '1px solid rgba(102,193,243,0.1)',
                        marginTop: -1,
                        paddingTop: 12,
                      }}
                    >
                      {commits.map((c) => (
                        <div
                          key={c.sha}
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 10,
                            fontSize: 11.5,
                          }}
                        >
                          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.cyan200, flex: 'none' }}>
                            {c.sha.slice(0, 7)}
                          </span>
                          <span
                            style={{
                              color: color.article,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {c.message}
                          </span>
                          <span style={{ color: color.dim, flex: 'none' }}>{c.author_login}</span>
                          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, flex: 'none' }}>
                            {relAge(c.at, now)}
                          </span>
                        </div>
                      ))}
                      {b.pr ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 4,
                            fontSize: 11.5,
                            color: color.muted,
                          }}
                        >
                          <span style={{ fontFamily: font.mono, color: color.cyan300 }}>
                            PR #{b.pr.number}
                          </span>
                          <span>→ {b.pr.target}</span>
                          <span>
                            · {b.pr.reviews_done}/{b.pr.reviews_required} reviews
                          </span>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 120,
                              height: 3,
                              borderRadius: 2,
                              background: 'rgba(155,173,197,0.18)',
                              overflow: 'hidden',
                              display: 'inline-block',
                            }}
                          >
                            <span
                              style={{
                                display: 'block',
                                height: '100%',
                                borderRadius: 2,
                                background: color.cyan500,
                                width: `${
                                  b.pr.reviews_required > 0
                                    ? Math.min(100, (b.pr.reviews_done / b.pr.reviews_required) * 100)
                                    : 100
                                }%`,
                              }}
                            />
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
