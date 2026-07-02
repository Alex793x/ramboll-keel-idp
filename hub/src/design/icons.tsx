/**
 * Icon primitives — single-path stroke icons ported EXACTLY from the design
 * source (`Ramboll Developer Hub.dc.html`, ICONS map at lines 940–947 plus the
 * search/check paths used inline). Path strings are verbatim; do not edit.
 */
import type * as React from 'react';

/**
 * Renders one 24×24 stroke path. Defaults mirror the design's nav icon usage:
 * `currentColor`, strokeWidth 1.8, 17px box.
 */
export function PathIcon(props: {
  d: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.stroke ?? 'currentColor'}
      strokeWidth={props.strokeWidth ?? 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: props.size ?? 17, height: props.size ?? 17, flex: 'none', ...props.style }}
    >
      <path d={props.d} />
    </svg>
  );
}

/**
 * Exact path strings from the design source.
 * home/folder/book/grid/branch/zap/bot/help: nav ICONS map (source lines 940–947).
 * search: the `<path>` half of the design's circle+path search glyph — prefer
 *   `SearchIcon` for the full glyph.
 * check: the checkmark used in provisioning/created states (source `M20 6 9 17l-5-5`).
 */
export const ICONS = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  folder:
    'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  book: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  branch: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  bot: 'M12 8V5M8 8h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4ZM9 13.5h.01M15 13.5h.01',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3M12 17h.01',
  search: 'm21 21-4.3-4.3',
  check: 'M20 6 9 17l-5-5',
} as const;

/**
 * The design's search glyph is a circle+path combo (not a single path), so it
 * gets its own component: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`.
 */
export function SearchIcon(props: {
  size?: number;
  stroke?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.stroke ?? 'currentColor'}
      strokeWidth={props.strokeWidth ?? 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: props.size ?? 17, height: props.size ?? 17, flex: 'none', ...props.style }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
