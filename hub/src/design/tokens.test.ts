import { describe, expect, it } from 'vitest';
import { color, font } from './tokens';

/**
 * Contract test: these names and hex values are the FROZEN design-token
 * contract other hub modules compile against. Any diff here is a breaking
 * change — the values come verbatim from the design source of truth.
 */
describe('design tokens', () => {
  it('color matches the design source exactly', () => {
    expect(color).toEqual({
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
    });
  });

  it('font stacks match the design source exactly', () => {
    expect(font).toEqual({
      sans: "'Nunito', system-ui, sans-serif",
      mono: "'JetBrains Mono', monospace",
    });
  });
});
