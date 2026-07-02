/* ============================================================
   Ramboll Developer Hub — Diagram Engine (built from scratch)
   Declarative specs in, laid-out geometry out. No libraries.
   Colors follow the Ramboll semantic-shape system.
   ============================================================ */
(function () {
  'use strict';

  var KINDS = {
    primary:   { fill: '#0098EB', stroke: '#05326E', text: '#FFFFFF', name: 'Service' },
    secondary: { fill: '#33ADEF', stroke: '#05326E', text: '#FFFFFF', name: 'Supporting' },
    tertiary:  { fill: '#99D6F7', stroke: '#05326E', text: '#05326E', name: 'Infrastructure' },
    decision:  { fill: '#CCEAFB', stroke: '#0098EB', text: '#05326E', name: 'Decision' },
    start:     { fill: '#FFE682', stroke: '#C27A00', text: '#4A3400', name: 'Trigger' },
    end:       { fill: '#ADD095', stroke: '#125A40', text: '#12402E', name: 'Success' },
    warning:   { fill: '#FF8855', stroke: '#B34400', text: '#431600', name: 'Remediation' },
    ai:        { fill: '#E0D4DB', stroke: '#62294B', text: '#62294B', name: 'Agent / AI' },
    inactive:  { fill: '#E3E1D8', stroke: '#273943', text: '#273943', name: 'Deprecated', dashed: true },
    neutral:   { fill: '#FFFFFF', stroke: '#273943', text: '#273943', name: 'External' }
  };

  /* ---------- flow layout: layered DAG, longest-path ranks ---------- */
  function layoutFlow(spec) {
    var dir = spec.dir || 'LR';
    var gapX = spec.gapX != null ? spec.gapX : 74;
    var gapY = spec.gapY != null ? spec.gapY : 30;
    var pad = 28;
    var edgesIn = spec.edges || [];

    var nodes = (spec.nodes || []).map(function (n) {
      var diamond = n.shape === 'diamond' || n.kind === 'decision';
      return Object.assign({}, n, {
        diamond: diamond,
        w: n.w != null ? n.w : (diamond ? 150 : 172),
        h: n.h != null ? n.h : (diamond ? 88 : (n.sub ? 58 : 48))
      });
    });
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    // ranks: longest path over forward edges (edges marked back:true ignored)
    var rank = {};
    nodes.forEach(function (n) { rank[n.id] = 0; });
    var fwd = edgesIn.filter(function (e) { return !e.back; });
    for (var iter = 0; iter < nodes.length + 1; iter++) {
      var changed = false;
      fwd.forEach(function (e) {
        if (byId[e.from] == null || byId[e.to] == null) return;
        if (rank[e.to] < rank[e.from] + 1) { rank[e.to] = rank[e.from] + 1; changed = true; }
      });
      if (!changed) break;
    }
    var maxRank = 0;
    nodes.forEach(function (n) { if (rank[n.id] > maxRank) maxRank = rank[n.id]; });

    var layers = [];
    for (var r = 0; r <= maxRank; r++) layers.push(nodes.filter(function (n) { return rank[n.id] === r; }));

    // ordering: barycenter sweeps
    var pos = {};
    layers.forEach(function (l) { l.forEach(function (n, i) { pos[n.id] = i; }); });
    for (var sweep = 0; sweep < 3; sweep++) {
      layers.forEach(function (layer, r2) {
        if (r2 === 0) return;
        layer.sort(function (a, b) { return bary(a) - bary(b); });
        layer.forEach(function (n, i) { pos[n.id] = i; });
        function bary(n) {
          var ins = fwd.filter(function (e) { return e.to === n.id; }).map(function (e) { return pos[e.from]; });
          if (!ins.length) return pos[n.id];
          return ins.reduce(function (s, x) { return s + x; }, 0) / ins.length;
        }
      });
    }

    // coordinates
    var layerMain = layers.map(function (l) {
      return Math.max.apply(null, l.map(function (n) { return dir === 'LR' ? n.w : n.h; }));
    });
    var layerOff = [];
    var acc = pad;
    layerMain.forEach(function (m, i) { layerOff[i] = acc; acc += m + gapX; });

    var layerCross = layers.map(function (l) {
      var s = 0;
      l.forEach(function (n) { s += (dir === 'LR' ? n.h : n.w); });
      return s + (l.length - 1) * gapY;
    });
    var maxCross = Math.max.apply(null, layerCross);

    layers.forEach(function (l, r3) {
      var c = pad + (maxCross - layerCross[r3]) / 2;
      l.forEach(function (n) {
        if (dir === 'LR') { n.x = layerOff[r3] + (layerMain[r3] - n.w) / 2; n.y = c; c += n.h + gapY; }
        else { n.y = layerOff[r3] + (layerMain[r3] - n.h) / 2; n.x = c; c += n.w + gapY; }
      });
    });

    var maxX = 0, maxY = 0;
    nodes.forEach(function (n) { maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); });

    // groups (bounding boxes behind member nodes)
    var groups = (spec.groups || []).map(function (g) {
      var ms = g.nodes.map(function (id) { return byId[id]; }).filter(Boolean);
      var x1 = Math.min.apply(null, ms.map(function (n) { return n.x; })) - 16;
      var y1 = Math.min.apply(null, ms.map(function (n) { return n.y; })) - 34;
      var x2 = Math.max.apply(null, ms.map(function (n) { return n.x + n.w; })) + 16;
      var y2 = Math.max.apply(null, ms.map(function (n) { return n.y + n.h; })) + 14;
      maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
      return { label: g.label, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    });

    // edge geometry
    var edges = edgesIn.map(function (e) {
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) return null;
      var d, lx, ly, x2, y2, arrow;
      if (e.back) {
        var sx = a.x + a.w / 2, sy = a.y + a.h;
        x2 = b.x + b.w / 2; y2 = b.y + b.h;
        var yb = Math.max(sy, y2) + 48;
        d = 'M ' + sx + ' ' + sy + ' C ' + sx + ' ' + yb + ', ' + x2 + ' ' + yb + ', ' + x2 + ' ' + (y2 + 7);
        lx = (sx + x2) / 2; ly = yb - 10; arrow = 'up';
        maxY = Math.max(maxY, yb + 8);
      } else if (dir === 'LR') {
        var ax = a.x + a.w, ay = a.y + a.h / 2;
        x2 = b.x; y2 = b.y + b.h / 2;
        var cx = Math.max(30, (x2 - ax) / 2);
        d = 'M ' + ax + ' ' + ay + ' C ' + (ax + cx) + ' ' + ay + ', ' + (x2 - cx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
        lx = (ax + x2) / 2; ly = (ay + y2) / 2 - 2; arrow = 'right';
      } else {
        var bx = a.x + a.w / 2, by = a.y + a.h;
        x2 = b.x + b.w / 2; y2 = b.y;
        var cy = Math.max(24, (y2 - by) / 2);
        d = 'M ' + bx + ' ' + by + ' C ' + bx + ' ' + (by + cy) + ', ' + x2 + ' ' + (y2 - cy) + ', ' + x2 + ' ' + y2;
        lx = (bx + x2) / 2; ly = (by + y2) / 2; arrow = 'down';
      }
      if (e.label) maxX = Math.max(maxX, lx + e.label.length * 3.2 + 10);
      return Object.assign({}, e, { d: d, lx: lx, ly: ly, x2: x2, y2: y2, arrow: arrow });
    }).filter(Boolean);

    return { w: maxX + pad, h: maxY + pad, nodes: nodes, edges: edges, groups: groups };
  }

  /* ---------- sequence layout: actors, lifelines, ordered messages ---------- */
  function layoutSequence(spec) {
    var pad = 24, boxW = 132, boxH = 42, colW = 176, rowH = 46, topGap = 34;
    var actors = (spec.actors || []).map(function (a, i) {
      return Object.assign({}, a, {
        x: pad + i * colW, y: 0, w: boxW, h: boxH,
        cx: pad + i * colW + boxW / 2
      });
    });
    var byId = {};
    actors.forEach(function (a) { byId[a.id] = a; });

    var msgs = spec.messages || [];
    var H = boxH + topGap + msgs.length * rowH + 18;
    var messages = msgs.map(function (m, i) {
      var a = byId[m.from], b = byId[m.to];
      var y = boxH + topGap + i * rowH;
      if (m.from === m.to) {
        return { self: true, x: a.cx, y: y - 8, label: m.label, dashed: !!m.dashed };
      }
      return {
        self: false,
        x1: a.cx, x2: b.cx, y: y,
        dirRight: b.cx > a.cx,
        label: m.label, dashed: !!m.dashed
      };
    });
    var lifelines = actors.map(function (a) { return { x: a.cx, y1: boxH, y2: H - 6 }; });
    return { w: pad * 2 + (actors.length - 1) * colW + boxW, h: H, actors: actors, lifelines: lifelines, messages: messages };
  }

  window.RDH_ENGINE = { KINDS: KINDS, layoutFlow: layoutFlow, layoutSequence: layoutSequence };
})();
