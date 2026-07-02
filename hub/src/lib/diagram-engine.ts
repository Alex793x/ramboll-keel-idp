/**
 * Diagram engine — faithful TypeScript port of the design source
 * `Ramble IDP Hub MVP Design/diagram-engine.js` (RDH_ENGINE).
 *
 * Declarative specs in, laid-out geometry out. No libraries.
 * Colors follow the Ramboll semantic-shape system.
 *
 * The geometry math (longest-path ranks, barycenter sweeps, edge routing,
 * label positions, sequence rows) is ported 1:1 — do not "improve" it.
 */

/** The ten semantic node kinds of the Ramboll shape system. */
export type NodeKind =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'decision'
  | 'start'
  | 'end'
  | 'warning'
  | 'ai'
  | 'inactive'
  | 'neutral';

export interface KindStyle {
  fill: string;
  stroke: string;
  text: string;
  name: string;
  dashed?: boolean;
}

/** Exact palette from diagram-engine.js — verbatim values, do not edit. */
export const KINDS: Record<NodeKind, KindStyle> = {
  primary: { fill: '#0098EB', stroke: '#05326E', text: '#FFFFFF', name: 'Service' },
  secondary: { fill: '#33ADEF', stroke: '#05326E', text: '#FFFFFF', name: 'Supporting' },
  tertiary: { fill: '#99D6F7', stroke: '#05326E', text: '#05326E', name: 'Infrastructure' },
  decision: { fill: '#CCEAFB', stroke: '#0098EB', text: '#05326E', name: 'Decision' },
  start: { fill: '#FFE682', stroke: '#C27A00', text: '#4A3400', name: 'Trigger' },
  end: { fill: '#ADD095', stroke: '#125A40', text: '#12402E', name: 'Success' },
  warning: { fill: '#FF8855', stroke: '#B34400', text: '#431600', name: 'Remediation' },
  ai: { fill: '#E0D4DB', stroke: '#62294B', text: '#62294B', name: 'Agent / AI' },
  inactive: { fill: '#E3E1D8', stroke: '#273943', text: '#273943', name: 'Deprecated', dashed: true },
  neutral: { fill: '#FFFFFF', stroke: '#273943', text: '#273943', name: 'External' },
};

/* ---------- flow specs ---------- */

export interface FlowNode {
  id: string;
  label: string;
  kind?: NodeKind;
  /** Small mono sub-caption under the label. */
  sub?: string;
  /** 'diamond' forces the decision shape; 'pill' rounds the box fully. */
  shape?: 'diamond' | 'pill';
  w?: number;
  h?: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  /** Advisory flow — rendered dashed. */
  dashed?: boolean;
  /** Loop edge routed below the layout; ignored for ranking. */
  back?: boolean;
}

export interface FlowGroup {
  label: string;
  nodes: string[];
}

export interface FlowSpec {
  kind: 'flow';
  dir?: 'LR' | 'TB';
  gapX?: number;
  gapY?: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups?: FlowGroup[];
}

/* ---------- flow layout output ---------- */

export interface LaidFlowNode extends FlowNode {
  diamond: boolean;
  w: number;
  h: number;
  x: number;
  y: number;
}

export type ArrowDir = 'up' | 'right' | 'down';

export interface LaidFlowEdge extends FlowEdge {
  /** SVG path data (cubic Bézier). */
  d: string;
  /** Label pill center. */
  lx: number;
  ly: number;
  /** Arrowhead tip. */
  x2: number;
  y2: number;
  arrow: ArrowDir;
}

export interface LaidFlowGroup {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowLayout {
  w: number;
  h: number;
  nodes: LaidFlowNode[];
  edges: LaidFlowEdge[];
  groups: LaidFlowGroup[];
}

/* ---------- flow layout: layered DAG, longest-path ranks ---------- */

export function layoutFlow(spec: FlowSpec): FlowLayout {
  const dir = spec.dir ?? 'LR';
  const gapX = spec.gapX ?? 74;
  const gapY = spec.gapY ?? 30;
  const pad = 28;
  const edgesIn = spec.edges;

  const nodes: LaidFlowNode[] = spec.nodes.map((n) => {
    const diamond = n.shape === 'diamond' || n.kind === 'decision';
    return {
      ...n,
      diamond,
      w: n.w ?? (diamond ? 150 : 172),
      h: n.h ?? (diamond ? 88 : n.sub ? 58 : 48),
      x: 0,
      y: 0,
    };
  });
  const byId: Record<string, LaidFlowNode> = {};
  for (const n of nodes) byId[n.id] = n;

  // ranks: longest path over forward edges (edges marked back:true ignored)
  const rank: Record<string, number> = {};
  for (const n of nodes) rank[n.id] = 0;
  const fwd = edgesIn.filter((e) => !e.back);
  for (let iter = 0; iter < nodes.length + 1; iter++) {
    let changed = false;
    for (const e of fwd) {
      if (byId[e.from] == null || byId[e.to] == null) continue;
      const rFrom = rank[e.from] ?? 0;
      if ((rank[e.to] ?? 0) < rFrom + 1) {
        rank[e.to] = rFrom + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  let maxRank = 0;
  for (const n of nodes) {
    const r = rank[n.id] ?? 0;
    if (r > maxRank) maxRank = r;
  }

  const layers: LaidFlowNode[][] = [];
  for (let r = 0; r <= maxRank; r++) layers.push(nodes.filter((n) => rank[n.id] === r));

  // ordering: barycenter sweeps
  const pos: Record<string, number> = {};
  layers.forEach((l) => {
    l.forEach((n, i) => {
      pos[n.id] = i;
    });
  });
  for (let sweep = 0; sweep < 3; sweep++) {
    layers.forEach((layer, r2) => {
      if (r2 === 0) return;
      const bary = (n: LaidFlowNode): number => {
        const ins = fwd.filter((e) => e.to === n.id).map((e) => pos[e.from] ?? 0);
        if (!ins.length) return pos[n.id] ?? 0;
        return ins.reduce((s, x) => s + x, 0) / ins.length;
      };
      layer.sort((a, b) => bary(a) - bary(b));
      layer.forEach((n, i) => {
        pos[n.id] = i;
      });
    });
  }

  // coordinates
  const layerMain = layers.map((l) => Math.max(...l.map((n) => (dir === 'LR' ? n.w : n.h))));
  const layerOff: number[] = [];
  let acc = pad;
  layerMain.forEach((m, i) => {
    layerOff[i] = acc;
    acc += m + gapX;
  });

  const layerCross = layers.map((l) => {
    let s = 0;
    for (const n of l) s += dir === 'LR' ? n.h : n.w;
    return s + (l.length - 1) * gapY;
  });
  const maxCross = Math.max(...layerCross);

  layers.forEach((l, r3) => {
    let c = pad + (maxCross - (layerCross[r3] ?? 0)) / 2;
    for (const n of l) {
      if (dir === 'LR') {
        n.x = (layerOff[r3] ?? 0) + ((layerMain[r3] ?? 0) - n.w) / 2;
        n.y = c;
        c += n.h + gapY;
      } else {
        n.y = (layerOff[r3] ?? 0) + ((layerMain[r3] ?? 0) - n.h) / 2;
        n.x = c;
        c += n.w + gapY;
      }
    }
  });

  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }

  // groups (bounding boxes behind member nodes)
  const groups: LaidFlowGroup[] = (spec.groups ?? []).map((g) => {
    const ms = g.nodes
      .map((id) => byId[id])
      .filter((n): n is LaidFlowNode => n != null);
    const x1 = Math.min(...ms.map((n) => n.x)) - 16;
    const y1 = Math.min(...ms.map((n) => n.y)) - 34;
    const x2 = Math.max(...ms.map((n) => n.x + n.w)) + 16;
    const y2 = Math.max(...ms.map((n) => n.y + n.h)) + 14;
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
    return { label: g.label, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  });

  // edge geometry
  const edges: LaidFlowEdge[] = [];
  for (const e of edgesIn) {
    const a = byId[e.from];
    const b = byId[e.to];
    if (!a || !b) continue;
    let d: string;
    let lx: number;
    let ly: number;
    let x2: number;
    let y2: number;
    let arrow: ArrowDir;
    if (e.back) {
      const sx = a.x + a.w / 2;
      const sy = a.y + a.h;
      x2 = b.x + b.w / 2;
      y2 = b.y + b.h;
      const yb = Math.max(sy, y2) + 48;
      d = 'M ' + sx + ' ' + sy + ' C ' + sx + ' ' + yb + ', ' + x2 + ' ' + yb + ', ' + x2 + ' ' + (y2 + 7);
      lx = (sx + x2) / 2;
      ly = yb - 10;
      arrow = 'up';
      maxY = Math.max(maxY, yb + 8);
    } else if (dir === 'LR') {
      const ax = a.x + a.w;
      const ay = a.y + a.h / 2;
      x2 = b.x;
      y2 = b.y + b.h / 2;
      const cx = Math.max(30, (x2 - ax) / 2);
      d = 'M ' + ax + ' ' + ay + ' C ' + (ax + cx) + ' ' + ay + ', ' + (x2 - cx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
      lx = (ax + x2) / 2;
      ly = (ay + y2) / 2 - 2;
      arrow = 'right';
    } else {
      const bx = a.x + a.w / 2;
      const by = a.y + a.h;
      x2 = b.x + b.w / 2;
      y2 = b.y;
      const cy = Math.max(24, (y2 - by) / 2);
      d = 'M ' + bx + ' ' + by + ' C ' + bx + ' ' + (by + cy) + ', ' + x2 + ' ' + (y2 - cy) + ', ' + x2 + ' ' + y2;
      lx = (bx + x2) / 2;
      ly = (by + y2) / 2;
      arrow = 'down';
    }
    if (e.label) maxX = Math.max(maxX, lx + e.label.length * 3.2 + 10);
    edges.push({ ...e, d, lx, ly, x2, y2, arrow });
  }

  return { w: maxX + pad, h: maxY + pad, nodes, edges, groups };
}

/* ---------- sequence specs ---------- */

export interface SequenceActor {
  id: string;
  label: string;
  kind?: NodeKind;
  sub?: string;
}

export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  /** Returns/advisories — rendered dashed. */
  dashed?: boolean;
}

export interface SequenceSpec {
  kind: 'sequence';
  actors: SequenceActor[];
  messages: SequenceMessage[];
}

export type DiagramSpec = FlowSpec | SequenceSpec;

/* ---------- sequence layout output ---------- */

export interface LaidActor extends SequenceActor {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lifeline center x. */
  cx: number;
}

export type LaidMessage =
  | { self: true; x: number; y: number; label: string; dashed: boolean }
  | {
      self: false;
      x1: number;
      x2: number;
      y: number;
      dirRight: boolean;
      label: string;
      dashed: boolean;
    };

export interface Lifeline {
  x: number;
  y1: number;
  y2: number;
}

export interface SequenceLayout {
  w: number;
  h: number;
  actors: LaidActor[];
  lifelines: Lifeline[];
  messages: LaidMessage[];
}

/* ---------- sequence layout: actors, lifelines, ordered messages ---------- */

export function layoutSequence(spec: SequenceSpec): SequenceLayout {
  const pad = 24;
  const boxW = 132;
  const boxH = 42;
  const colW = 176;
  const rowH = 46;
  const topGap = 34;

  const actors: LaidActor[] = spec.actors.map((a, i) => ({
    ...a,
    x: pad + i * colW,
    y: 0,
    w: boxW,
    h: boxH,
    cx: pad + i * colW + boxW / 2,
  }));
  const byId: Record<string, LaidActor> = {};
  for (const a of actors) byId[a.id] = a;

  const msgs = spec.messages;
  const H = boxH + topGap + msgs.length * rowH + 18;
  const messages: LaidMessage[] = msgs.map((m, i) => {
    const a = byId[m.from];
    const b = byId[m.to];
    // The JS source crashes (TypeError) on an unknown actor id; fail loudly
    // with a descriptive error instead of unwrapping.
    if (!a || !b) {
      throw new Error(`layoutSequence: message references unknown actor ("${m.from}" -> "${m.to}")`);
    }
    const y = boxH + topGap + i * rowH;
    if (m.from === m.to) {
      return { self: true, x: a.cx, y: y - 8, label: m.label, dashed: !!m.dashed };
    }
    return {
      self: false,
      x1: a.cx,
      x2: b.cx,
      y,
      dirRight: b.cx > a.cx,
      label: m.label,
      dashed: !!m.dashed,
    };
  });
  const lifelines: Lifeline[] = actors.map((a) => ({ x: a.cx, y1: boxH, y2: H - 6 }));
  return {
    w: pad * 2 + (actors.length - 1) * colW + boxW,
    h: H,
    actors,
    lifelines,
    messages,
  };
}
