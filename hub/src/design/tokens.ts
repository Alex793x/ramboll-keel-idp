/**
 * Design tokens — FROZEN contract for the Ramboll Developer Hub design system.
 *
 * Ported EXACTLY from `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html`
 * (source of truth). Do NOT round, substitute, or "normalize" any value here —
 * other modules compile against these exact names and hex values.
 *
 * Name → Ramboll scale mapping (verified against `uploads/preview/scale-*.html`):
 * - `cyan500…cyan100` — the Ramboll CYAN scale (500 is the brand primary #0098EB).
 * - `ocean`           — Ramboll OCEAN (deep brand blue, #05326E).
 * - `grass`           — Ramboll spot colour GRASS (#ADD095), used for success tones.
 * - `sun`             — Ramboll spot colour SUN (#FFE682), used for warning tones.
 * - `clay`            — Ramboll spot colour CLAY (#FF8855), used for accents/alerts.
 * - `heath`           — Ramboll spot colour HEATH (#C0A9B7), used for AI tones.
 * - `ink`             — Ramboll INK (#273943), dark neutral.
 * - `pageBg/sidebarBg/card/codeHead/codeBg` — hub navy surface ramp (darkest → panel).
 * - `white/body/muted/dim/faint/article` — hub text ramp (brightest → faintest).
 */
export const color = {
  pageBg: '#061021',
  sidebarBg: '#05132A',
  card: '#0A1B33',
  codeHead: '#081527',
  codeBg: '#04101F',
  white: '#FFFFFF',
  body: '#E6EAF0',
  muted: '#9BADC5',
  dim: '#6984A8',
  faint: '#375B8B',
  article: '#CDD6E2',
  cyan500: '#0098EB',
  cyan400: '#33ADEF',
  cyan300: '#66C1F3',
  cyan200: '#99D6F7',
  cyan100: '#CCEAFB',
  ocean: '#05326E',
  grass: '#ADD095',
  sun: '#FFE682',
  clay: '#FF8855',
  heath: '#C0A9B7',
  ink: '#273943',
} as const;

/**
 * Font stacks — exactly as loaded by the design's Google Fonts stylesheet
 * (Nunito 400/600/700/800, JetBrains Mono 400/500/600).
 */
export const font = {
  sans: "'Nunito', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;
