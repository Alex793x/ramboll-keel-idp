/**
 * Diagram engine tests — geometry invariants of the 1:1 port of
 * `diagram-engine.js`, using a real spec from `docs-data` as fixture.
 */
import { describe, expect, it } from 'vitest';
import {
  KINDS,
  layoutFlow,
  layoutSequence,
  type FlowSpec,
  type SequenceSpec,
} from './diagram-engine';
import { DOCS } from './docs-data';

/** Real fixture: the "Scaffold pipeline" flow from the create-api doc. */
function scaffoldSpec(): FlowSpec {
  const doc = DOCS.find((d) => d.id === 'create-api');
  if (!doc) throw new Error('fixture doc create-api missing');
  for (const b of doc.blocks) {
    if (b.t === 'diagram' && b.spec.kind === 'flow') return b.spec;
  }
  throw new Error('fixture flow spec missing');
}

/** Real fixture: the "One order, end to end" sequence from the event-driven doc. */
function orderSequenceSpec(): SequenceSpec {
  const doc = DOCS.find((d) => d.id === 'event-driven');
  if (!doc) throw new Error('fixture doc event-driven missing');
  for (const b of doc.blocks) {
    if (b.t === 'diagram' && b.spec.kind === 'sequence') return b.spec;
  }
  throw new Error('fixture sequence spec missing');
}

describe('KINDS', () => {
  it('has exactly the ten semantic kinds', () => {
    expect(Object.keys(KINDS).sort()).toEqual(
      ['ai', 'decision', 'end', 'inactive', 'neutral', 'primary', 'secondary', 'start', 'tertiary', 'warning'].sort(),
    );
  });

  it('keeps the exact Ramboll palette values', () => {
    expect(KINDS.primary).toEqual({ fill: '#0098EB', stroke: '#05326E', text: '#FFFFFF', name: 'Service' });
    expect(KINDS.neutral).toEqual({ fill: '#FFFFFF', stroke: '#273943', text: '#273943', name: 'External' });
    expect(KINDS.inactive.dashed).toBe(true);
    expect(KINDS.start.fill).toBe('#FFE682');
    expect(KINDS.end.fill).toBe('#ADD095');
    expect(KINDS.warning.fill).toBe('#FF8855');
    expect(KINDS.ai.stroke).toBe('#62294B');
    expect(KINDS.decision.stroke).toBe('#0098EB');
  });
});

describe('layoutFlow', () => {
  it('is deterministic: same spec, same geometry', () => {
    const a = layoutFlow(scaffoldSpec());
    const b = layoutFlow(scaffoldSpec());
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('gives every node finite coordinates and default sizes', () => {
    const L = layoutFlow(scaffoldSpec());
    expect(L.nodes).toHaveLength(7);
    for (const n of L.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(28); // pad
      expect(n.y).toBeGreaterThanOrEqual(28);
    }
    const byId = new Map(L.nodes.map((n) => [n.id, n]));
    // decision node → diamond, 150×88
    const gate = byId.get('gate');
    expect(gate?.diamond).toBe(true);
    expect(gate?.w).toBe(150);
    expect(gate?.h).toBe(88);
    // node with sub → 172×58; the fixture has no sub-less plain box
    const repo = byId.get('repo');
    expect(repo?.w).toBe(172);
    expect(repo?.h).toBe(58);
    // plain box without sub → 48 high
    const plain = layoutFlow({
      kind: 'flow',
      nodes: [{ id: 'a', label: 'A' }],
      edges: [],
    });
    expect(plain.nodes[0]?.w).toBe(172);
    expect(plain.nodes[0]?.h).toBe(48);
  });

  it('ranks increase along forward edges (LR: target strictly right of source)', () => {
    const L = layoutFlow(scaffoldSpec());
    const byId = new Map(L.nodes.map((n) => [n.id, n]));
    for (const e of L.edges) {
      if (e.back) continue;
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) throw new Error('edge endpoint missing');
      expect(b.x).toBeGreaterThan(a.x + a.w);
      expect(e.arrow).toBe('right');
    }
  });

  it('routes back edges below the layout with an up arrow', () => {
    const L = layoutFlow(scaffoldSpec());
    const back = L.edges.find((e) => e.back);
    if (!back) throw new Error('fixture back edge missing');
    expect(back.arrow).toBe('up');
    expect(back.label).toBe('retry');
    const byId = new Map(L.nodes.map((n) => [n.id, n]));
    const from = byId.get(back.from);
    const to = byId.get(back.to);
    if (!from || !to) throw new Error('back edge endpoint missing');
    // arrowhead tip sits at the bottom edge of the target node
    expect(back.x2).toBe(to.x + to.w / 2);
    expect(back.y2).toBe(to.y + to.h);
    // the loop swings 48 below the lower endpoint and grows the canvas
    const yb = Math.max(from.y + from.h, to.y + to.h) + 48;
    expect(back.ly).toBe(yb - 10);
    expect(L.h).toBeGreaterThanOrEqual(yb + 8 + 28);
  });

  it('TB direction stacks layers downward', () => {
    const L = layoutFlow({
      kind: 'flow',
      dir: 'TB',
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });
    const [a, b] = L.nodes;
    if (!a || !b) throw new Error('nodes missing');
    expect(b.y).toBeGreaterThan(a.y + a.h);
    expect(L.edges[0]?.arrow).toBe('down');
  });

  it('group bounding boxes wrap members with the exact source offsets', () => {
    const doc = DOCS.find((d) => d.id === 'event-driven');
    if (!doc) throw new Error('fixture doc missing');
    const block = doc.blocks.find((b) => b.t === 'diagram' && b.spec.kind === 'flow');
    if (!block || block.t !== 'diagram' || block.spec.kind !== 'flow') throw new Error('fixture missing');
    const L = layoutFlow(block.spec);
    expect(L.groups).toHaveLength(1);
    const g = L.groups[0];
    if (!g) throw new Error('group missing');
    const members = L.nodes.filter((n) => ['bill', 'noti', 'agent'].includes(n.id));
    const minX = Math.min(...members.map((n) => n.x));
    const minY = Math.min(...members.map((n) => n.y));
    const maxX = Math.max(...members.map((n) => n.x + n.w));
    const maxY = Math.max(...members.map((n) => n.y + n.h));
    expect(g.label).toBe('ASYNC CONSUMERS');
    expect(g.x).toBe(minX - 16);
    expect(g.y).toBe(minY - 34);
    expect(g.x + g.w).toBe(maxX + 16);
    expect(g.y + g.h).toBe(maxY + 14);
  });

  it('drops edges whose endpoints are unknown (as the JS source does)', () => {
    const L = layoutFlow({
      kind: 'flow',
      nodes: [{ id: 'a', label: 'A' }],
      edges: [
        { from: 'a', to: 'ghost' },
        { from: 'ghost', to: 'a' },
      ],
    });
    expect(L.edges).toHaveLength(0);
  });
});

describe('layoutSequence', () => {
  it('is deterministic: same spec, same geometry', () => {
    const a = layoutSequence(orderSequenceSpec());
    const b = layoutSequence(orderSequenceSpec());
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('positions actors on a 176px grid with 132×42 boxes', () => {
    const L = layoutSequence(orderSequenceSpec());
    expect(L.actors).toHaveLength(5);
    L.actors.forEach((a, i) => {
      expect(a.x).toBe(24 + i * 176);
      expect(a.y).toBe(0);
      expect(a.w).toBe(132);
      expect(a.h).toBe(42);
      expect(a.cx).toBe(24 + i * 176 + 66);
    });
    expect(L.w).toBe(24 * 2 + (5 - 1) * 176 + 132);
  });

  it('drops one lifeline per actor from box bottom to canvas bottom', () => {
    const L = layoutSequence(orderSequenceSpec());
    expect(L.lifelines).toHaveLength(L.actors.length);
    L.lifelines.forEach((l, i) => {
      expect(l.x).toBe(L.actors[i]?.cx);
      expect(l.y1).toBe(42);
      expect(l.y2).toBe(L.h - 6);
    });
  });

  it('orders messages in 46px rows and flags self-messages', () => {
    const spec = orderSequenceSpec();
    const L = layoutSequence(spec);
    expect(L.messages).toHaveLength(6);
    expect(L.h).toBe(42 + 34 + 6 * 46 + 18);
    L.messages.forEach((m, i) => {
      const rowY = 42 + 34 + i * 46;
      if (m.self) {
        expect(m.y).toBe(rowY - 8);
      } else {
        expect(m.y).toBe(rowY);
      }
    });
    // 'validate + persist' is api → api
    const self = L.messages[2];
    if (!self || !self.self) throw new Error('expected self message at row 2');
    const api = L.actors.find((a) => a.id === 'api');
    expect(self.x).toBe(api?.cx);
    // '201 Created' goes right-to-left, dashed
    const reply = L.messages[4];
    if (!reply || reply.self) throw new Error('expected directed message at row 4');
    expect(reply.dirRight).toBe(false);
    expect(reply.dashed).toBe(true);
    // first message goes left-to-right
    const first = L.messages[0];
    if (!first || first.self) throw new Error('expected directed message at row 0');
    expect(first.dirRight).toBe(true);
    expect(first.dashed).toBe(false);
  });

  it('fails loudly on unknown actor ids', () => {
    expect(() =>
      layoutSequence({
        kind: 'sequence',
        actors: [{ id: 'a', label: 'A' }],
        messages: [{ from: 'a', to: 'ghost', label: 'x' }],
      }),
    ).toThrow(/unknown actor/);
  });
});
