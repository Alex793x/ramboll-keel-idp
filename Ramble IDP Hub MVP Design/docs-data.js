/* ============================================================
   Ramboll Developer Hub — Knowledge Base content
   Docs are component-based: a list of typed blocks.
   Block types: p · h2 · h3 · callout · code · steps · table ·
   diagram (flow | sequence) · divider
   ============================================================ */
(function () {
  'use strict';

  var DOCS = [

    /* ================= DOC 1 — Golden path ================= */
    {
      id: 'create-api',
      category: 'Golden paths',
      badge: { label: 'GOLDEN PATH', tone: 'cyan' },
      title: 'Create a new API service',
      desc: 'From an empty folder to a deployed, standards-compliant API — repo, pipelines, infrastructure and docs included.',
      owner: 'Developer Platform Engineering',
      updated: '28 Jun 2026',
      read: '6 min',
      version: 'v2.3',
      blocks: [
        { t: 'p', md: 'The **Create a new API** golden path is the default way to start backend work at Ramboll. One action provisions everything: repository, CI, cloud landing zone and a catalog entry with clear ownership.' },
        { t: 'callout', tone: 'info', title: 'Before you start', md: 'You need a project in the hub (see [Initialize a project](#)), the **Contributor** role in Entra ID, and `gh` CLI ≥ 2.40 signed in to the `ramboll` org.' },
        { t: 'h2', text: 'What gets provisioned' },
        { t: 'p', md: 'One click on **Initialize** runs the scaffold below. Every box is a building block you get for free — nothing is configured by hand, and the validation gate blocks anything non-compliant from reaching the catalog.' },
        { t: 'diagram', title: 'Scaffold pipeline', spec: {
          kind: 'flow', dir: 'LR',
          nodes: [
            { id: 'init',    label: 'Initialize project',  kind: 'start',     sub: 'HUB ACTION' },
            { id: 'repo',    label: 'Service repository',  kind: 'primary',   sub: 'RAMBOLL/…-API' },
            { id: 'ci',      label: 'CI pipeline',         kind: 'secondary', sub: 'GITHUB ACTIONS' },
            { id: 'infra',   label: 'Azure landing zone',  kind: 'secondary', sub: 'BICEP' },
            { id: 'gate',    label: 'Validation gate',     kind: 'decision' },
            { id: 'catalog', label: 'Catalog entry',       kind: 'end',       sub: 'OWNERSHIP + DOCS' },
            { id: 'fix',     label: 'Fix & re-run',        kind: 'warning',   sub: 'AUTO-OPENED ISSUE' }
          ],
          edges: [
            { from: 'init', to: 'repo' },
            { from: 'repo', to: 'ci' },
            { from: 'repo', to: 'infra' },
            { from: 'ci',   to: 'gate' },
            { from: 'infra', to: 'gate' },
            { from: 'gate', to: 'catalog', label: 'pass' },
            { from: 'gate', to: 'fix', label: 'fail' },
            { from: 'fix',  to: 'ci', back: true, label: 'retry' }
          ]
        } },
        { t: 'h2', text: 'The path, step by step' },
        { t: 'steps', items: [
          { title: 'Clone & run locally', md: '`make dev` boots the service with hot reload on `localhost:8080`. Secrets come from your Entra identity — no `.env` files.' },
          { title: 'Define your contract', md: 'Edit `openapi.yaml` first. Routes, request models and validation are generated from it, so the contract is never out of date.' },
          { title: 'Ship a slice', md: 'Push a branch and open a PR. CI runs build, tests, lint, security scanning and Ramboll standards checks — results land in the PR.' },
          { title: 'Merge to deploy', md: 'Merging to `main` deploys to **dev** automatically. **prod** needs one approval from a CODEOWNER.' }
        ] },
        { t: 'code', lang: 'bash', file: 'terminal', code: 'gh repo clone ramboll/district-heating-optimizer-api\ncd district-heating-optimizer-api\nmake dev   # service + hot reload on :8080' },
        { t: 'h2', text: 'Standards applied' },
        { t: 'table',
          head: ['Standard', 'Version', 'What it enforces'],
          rows: [
            ['API Golden Path', 'v2.3', 'REST conventions, error model, versioning'],
            ['TypeScript Service Standard', 'v1.8', 'Repo layout, lint rules, coverage ≥ 80%'],
            ['Azure Deployment Pattern', 'v3.0', 'Landing zone, secrets, observability'],
            ['Incident Runbook Template', 'v1.2', 'On-call, escalation, rollback steps']
          ]
        },
        { t: 'callout', tone: 'success', title: 'Green from commit zero', md: 'Your first commit already passes every pipeline. If a check fails later, the PR links the exact standard it violates — with a fix suggestion.' }
      ]
    },

    /* ================= DOC 2 — Reference architecture ================= */
    {
      id: 'event-driven',
      category: 'Architecture',
      badge: { label: 'REFERENCE', tone: 'heath' },
      title: 'Event-driven service architecture',
      desc: 'Our reference topology for services that stay responsive while work happens in the background.',
      owner: 'Product Architecture',
      updated: '19 Jun 2026',
      read: '8 min',
      version: 'v1.4',
      blocks: [
        { t: 'p', md: 'Use this reference when one request triggers **more than one** downstream effect — billing, notifications, analytics. The caller gets an instant answer; everything else happens asynchronously, in parallel, with independent scaling and failure isolation.' },
        { t: 'h2', text: 'Reference topology' },
        { t: 'diagram', title: 'Event-driven reference', spec: {
          kind: 'flow', dir: 'LR',
          nodes: [
            { id: 'web',   label: 'Web client',           kind: 'neutral',   sub: 'REACT' },
            { id: 'gw',    label: 'API Gateway',          kind: 'primary',   sub: 'AUTH + RATE LIMITS' },
            { id: 'api',   label: 'Orders API',           kind: 'primary',   sub: '.NET 8' },
            { id: 'db',    label: 'PostgreSQL',           kind: 'neutral',   sub: 'ORDERS DB' },
            { id: 'bus',   label: 'Event bus',            kind: 'tertiary',  sub: 'AZURE SERVICE BUS', shape: 'pill' },
            { id: 'bill',  label: 'Billing worker',       kind: 'secondary', sub: '.NET 8' },
            { id: 'noti',  label: 'Notifications worker', kind: 'secondary', sub: 'PYTHON' },
            { id: 'agent', label: 'Insights agent',       kind: 'ai',        sub: 'ANOMALY WATCH' }
          ],
          edges: [
            { from: 'web', to: 'gw', label: 'HTTPS' },
            { from: 'gw',  to: 'api' },
            { from: 'api', to: 'db', label: 'writes' },
            { from: 'api', to: 'bus', label: 'OrderPlaced' },
            { from: 'bus', to: 'bill' },
            { from: 'bus', to: 'noti' },
            { from: 'bus', to: 'agent', dashed: true, label: 'observes' }
          ],
          groups: [ { label: 'ASYNC CONSUMERS', nodes: ['bill', 'noti', 'agent'] } ]
        } },
        { t: 'p', md: 'Every arrow is a **contract**. The API owns its write model; consumers own their side effects. Nothing downstream can slow down or break the request path — a dead billing worker means delayed invoices, never failed orders.' },
        { t: 'h2', text: 'When not to use this' },
        { t: 'callout', tone: 'warning', title: 'Stay synchronous when…', md: '…the caller needs the result **in the same request** (validation, pricing lookups), or the workflow has strict ordering guarantees. A queue you don\u2019t need is pure operational cost.' },
        { t: 'h2', text: 'Request lifecycle' },
        { t: 'diagram', title: 'One order, end to end', spec: {
          kind: 'sequence',
          actors: [
            { id: 'client', label: 'Client',    kind: 'neutral' },
            { id: 'gw',     label: 'Gateway',   kind: 'primary' },
            { id: 'api',    label: 'Orders API', kind: 'primary' },
            { id: 'bus',    label: 'Event bus', kind: 'tertiary' },
            { id: 'bill',   label: 'Billing',   kind: 'secondary' }
          ],
          messages: [
            { from: 'client', to: 'gw',   label: 'POST /orders' },
            { from: 'gw',     to: 'api',  label: 'authenticated request' },
            { from: 'api',    to: 'api',  label: 'validate + persist' },
            { from: 'api',    to: 'bus',  label: 'publish OrderPlaced' },
            { from: 'api',    to: 'client', label: '201 Created', dashed: true },
            { from: 'bus',    to: 'bill', label: 'deliver (at-least-once)' }
          ]
        } },
        { t: 'p', md: 'Consumers must be **idempotent** — the bus guarantees at-least-once delivery. Key every handler on `messageId` and make replays safe before you ship.' },
        { t: 'callout', tone: 'ai', title: 'Ask the architecture agent', md: 'Open any service in the catalog and ask *does this follow the event-driven reference?* — the agent diffs your live dependency graph against this page.' }
      ]
    },

    /* ================= DOC 3 — Authoring guide ================= */
    {
      id: 'authoring',
      category: 'Authoring',
      badge: { label: 'AUTHORING', tone: 'grass' },
      title: 'Authoring docs & diagrams',
      desc: 'How to build new documentation: typed blocks, inline formatting, and declarative diagrams the hub lays out for you.',
      owner: 'Developer Platform Engineering',
      updated: '30 Jun 2026',
      read: '7 min',
      version: 'v1.0',
      blocks: [
        { t: 'p', md: 'Documentation in the hub is **component-based**: a doc is a list of typed blocks stored as data next to your code, rendered by the hub. No wiki markup, no drifting screenshots — and diagrams are *declared*, not drawn.' },
        { t: 'callout', tone: 'info', title: 'Why blocks?', md: 'Blocks keep every doc consistent, searchable and linkable. The hub can render, index and even **diff** them — and agents can generate or update them safely.' },
        { t: 'h2', text: 'Anatomy of a doc' },
        { t: 'p', md: 'A doc is one JSON file in your repo under `docs/`. Metadata on top, blocks below. The table of contents, read time and search index are derived automatically.' },
        { t: 'code', lang: 'json', file: 'docs/my-guide.doc.json', code: '{\n  "title": "Deploy to Azure",\n  "category": "Golden paths",\n  "badge": "GOLDEN PATH",\n  "blocks": [\n    { "t": "p",  "md": "Ship an approved landing zone in **one command**." },\n    { "t": "h2", "text": "Prerequisites" },\n    { "t": "callout", "tone": "info", "title": "Access",\n      "md": "Contributor role via `Entra ID`." },\n    { "t": "diagram", "title": "Pipeline",\n      "spec": { "kind": "flow", "nodes": [], "edges": [] } }\n  ]\n}' },
        { t: 'h2', text: 'The block library' },
        { t: 'table',
          head: ['Block', 'Purpose', 'Key fields'],
          rows: [
            ['`p`', 'Body text with inline formatting', '`md`'],
            ['`h2` · `h3`', 'Section headings — build the TOC', '`text`'],
            ['`callout`', 'Highlight box in four tones', '`tone` `title` `md`'],
            ['`code`', 'Copyable code with filename', '`lang` `file` `code`'],
            ['`steps`', 'Numbered procedure', '`items[]`'],
            ['`table`', 'Compact reference data', '`head` `rows`'],
            ['`diagram`', 'Flow & sequence diagrams', '`spec`']
          ]
        },
        { t: 'h2', text: 'Inline formatting' },
        { t: 'p', md: 'Use backticks for `code`, double asterisks for **emphasis**, and [text](url) for links. That is the whole grammar — anything richer belongs in a dedicated block.' },
        { t: 'h2', text: 'Declaring a diagram' },
        { t: 'p', md: 'A diagram is **nodes + edges**. Layout, routing, spacing, arrowheads and theming are automatic — you declare meaning, the hub makes it beautiful. This spec:' },
        { t: 'code', lang: 'json', file: 'spec', code: '{\n  "kind": "flow", "dir": "LR",\n  "nodes": [\n    { "id": "pr",   "label": "Pull request", "kind": "start" },\n    { "id": "ci",   "label": "CI checks",    "kind": "primary",\n      "sub": "GITHUB ACTIONS" },\n    { "id": "ship", "label": "Deployed",     "kind": "end" }\n  ],\n  "edges": [\n    { "from": "pr", "to": "ci" },\n    { "from": "ci", "to": "ship", "label": "on merge" }\n  ]\n}' },
        { t: 'p', md: '…renders as:' },
        { t: 'diagram', title: 'Rendered from the spec above', spec: {
          kind: 'flow', dir: 'LR',
          nodes: [
            { id: 'pr',   label: 'Pull request', kind: 'start' },
            { id: 'ci',   label: 'CI checks',    kind: 'primary', sub: 'GITHUB ACTIONS' },
            { id: 'ship', label: 'Deployed',     kind: 'end' }
          ],
          edges: [
            { from: 'pr', to: 'ci' },
            { from: 'ci', to: 'ship', label: 'on merge' }
          ]
        } },
        { t: 'h2', text: 'Node kinds' },
        { t: 'p', md: 'Kinds carry meaning, and the palette is fixed — so every diagram in the hub reads the same way. Hover any node in a rendered diagram to trace its connections.' },
        { t: 'table',
          head: ['Kind', 'Color', 'Use for'],
          rows: [
            ['`start`', 'Sand', 'Triggers and entry points'],
            ['`primary`', 'Cyan', 'Your services — the subject of the diagram'],
            ['`secondary`', 'Light cyan', 'Supporting services and pipelines'],
            ['`tertiary`', 'Pale cyan', 'Infrastructure: buses, gateways, queues'],
            ['`decision`', 'Ice', 'Branch points (rendered as a diamond)'],
            ['`end`', 'Grass', 'Success and terminal states'],
            ['`warning`', 'Field', 'Failure paths and remediation'],
            ['`ai`', 'Heath', 'Agents and ML components'],
            ['`neutral` · `inactive`', 'White · Pebble', 'External systems · deprecated (dashed)']
          ]
        },
        { t: 'h2', text: 'Branches, loops & groups' },
        { t: 'p', md: 'Label edges with `label`, dash advisory flows with `dashed: true`, mark loops with `back: true` so the layout stays clean, and wrap related nodes in `groups`.' },
        { t: 'diagram', title: 'All of it at once', spec: {
          kind: 'flow', dir: 'LR',
          nodes: [
            { id: 'night', label: 'Nightly build',    kind: 'start',   sub: '02:00 UTC' },
            { id: 'suite', label: 'Test suite',       kind: 'primary', sub: '1 842 TESTS' },
            { id: 'green', label: 'All green?',       kind: 'decision' },
            { id: 'pass',  label: 'Report published', kind: 'end' },
            { id: 'quar',  label: 'Quarantine flaky', kind: 'warning', sub: 'AUTO-TICKET' },
            { id: 'flake', label: 'Flake agent',      kind: 'ai',      sub: 'PATTERN WATCH' }
          ],
          edges: [
            { from: 'night', to: 'suite' },
            { from: 'suite', to: 'green' },
            { from: 'green', to: 'pass', label: 'yes' },
            { from: 'green', to: 'quar', label: 'no' },
            { from: 'quar',  to: 'flake', dashed: true },
            { from: 'quar',  to: 'suite', back: true, label: 'retry' }
          ],
          groups: [ { label: 'AUTO-REMEDIATION', nodes: ['quar', 'flake'] } ]
        } },
        { t: 'h2', text: 'Sequence diagrams' },
        { t: 'p', md: 'For interactions over time, set `"kind": "sequence"`. Actors become lifelines; messages render in order. Dash the returns.' },
        { t: 'code', lang: 'json', file: 'spec', code: '{\n  "kind": "sequence",\n  "actors": [\n    { "id": "dev", "label": "Developer", "kind": "neutral" },\n    { "id": "hub", "label": "Hub",       "kind": "primary" },\n    { "id": "gh",  "label": "GitHub",    "kind": "secondary" }\n  ],\n  "messages": [\n    { "from": "dev", "to": "hub", "label": "Initialize project" },\n    { "from": "hub", "to": "gh",  "label": "create repos + pipelines" },\n    { "from": "gh",  "to": "hub", "label": "webhooks: status", "dashed": true },\n    { "from": "hub", "to": "dev", "label": "project URL",      "dashed": true }\n  ]\n}' },
        { t: 'diagram', title: 'Rendered', spec: {
          kind: 'sequence',
          actors: [
            { id: 'dev', label: 'Developer', kind: 'neutral' },
            { id: 'hub', label: 'Hub',       kind: 'primary' },
            { id: 'gh',  label: 'GitHub',    kind: 'secondary' }
          ],
          messages: [
            { from: 'dev', to: 'hub', label: 'Initialize project' },
            { from: 'hub', to: 'gh',  label: 'create repos + pipelines' },
            { from: 'gh',  to: 'hub', label: 'webhooks: status', dashed: true },
            { from: 'hub', to: 'dev', label: 'project URL', dashed: true }
          ]
        } },
        { t: 'h2', text: 'House rules' },
        { t: 'callout', tone: 'warning', title: 'Keep it scannable', md: 'Under **12 nodes** and **one idea** per diagram. If it needs more, split it — docs are cheap, confusion is not.' },
        { t: 'callout', tone: 'success', title: 'Docs live with code', md: 'Doc files are versioned in your repo under `docs/`. Change the system, change the doc, same PR — reviewers see both.' }
      ]
    }
  ];

  var STUBS = [
    { title: 'Deploy to Azure',            cat: 'Golden paths' },
    { title: 'Add observability',          cat: 'Golden paths' },
    { title: 'Secrets & access model',     cat: 'Security' },
    { title: 'Branching & reviews',        cat: 'Standards' },
    { title: 'Kubernetes landing zone',    cat: 'Cloud' },
    { title: 'Incident response runbook',  cat: 'Operations' }
  ];

  var CATS = ['All', 'Golden paths', 'Architecture', 'Authoring'];

  window.RDH_DOCS = { DOCS: DOCS, STUBS: STUBS, CATS: CATS };
})();
