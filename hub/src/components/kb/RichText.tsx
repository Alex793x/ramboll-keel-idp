/**
 * Inline rich text — faithful port of the design's `rich()` helper
 * (`Ramboll Developer Hub.dc.html` lines 706–727).
 *
 * Grammar (the whole grammar): `**bold**`, `` `code` ``, `[text](url)`,
 * `*em*` — parsed with the source's exact regex and rendered to spans.
 */
import type * as React from 'react';
import { color, font } from '../../design/tokens';

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]*\))/g;

export function RichText({ md }: { md: string }) {
  const parts: React.ReactNode[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(md))) {
    if (m.index > last) parts.push(md.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(
        <strong key={i++} style={{ fontWeight: 800, color: color.white }}>
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith('`')) {
      parts.push(
        <code
          key={i++}
          style={{
            fontFamily: font.mono,
            fontSize: '0.88em',
            background: 'rgba(153,214,247,0.12)',
            color: color.cyan200,
            padding: '1.5px 6px',
            borderRadius: 5,
            whiteSpace: 'nowrap',
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('[')) {
      const t = tok.match(/\[([^\]]+)\]/)?.[1] ?? tok;
      parts.push(
        <span
          key={i++}
          style={{
            color: color.cyan300,
            fontWeight: 700,
            borderBottom: '1px solid rgba(102,193,243,0.45)',
            cursor: 'pointer',
          }}
        >
          {t}
        </span>,
      );
    } else {
      parts.push(
        <em key={i++} style={{ color: color.body }}>
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < md.length) parts.push(md.slice(last));
  return <span>{parts}</span>;
}
