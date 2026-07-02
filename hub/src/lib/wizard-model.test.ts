import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SERVICE_NAME_RE, WORKFLOW_STEPS } from './types';
import type {
  CatalogServiceType,
  Contributor,
  Department,
  ProgressEvent,
  RepoCoordinates,
} from './types';
import {
  DEFAULT_LAYOUT,
  EVENT_TICK_MS,
  GBAS,
  LANG_SLUGS,
  LAYOUT_HINTS,
  LAYOUT_OPTIONS,
  PEOPLE,
  PROV_META,
  PROV_STEPS,
  PROV_TICK_MS,
  SERVICE_NAME_DUPLICATE_ERROR,
  SERVICE_NAME_FORMAT_ERROR,
  TYPES,
  blueprintName,
  blueprintRepoLine,
  buildInitializePayload,
  canInit,
  catalogEntry,
  createdId,
  createdRepoChips,
  createdRepos,
  createdSummary,
  defaultLang,
  defaultServiceName,
  designCatalog,
  initErrorMessage,
  initHint,
  initials,
  isProvComplete,
  langSlug,
  missingParts,
  monolithRepo,
  provMeta,
  provRowState,
  provRowsFromEvents,
  repoName,
  resolvedServiceName,
  serviceDir,
  serviceNameError,
  slugOf,
  typeOf,
  type CreatedProject,
  type RepoLayout,
  type Service,
  type ServiceTypeId,
  type WizardDraft,
  type WizardState,
} from './wizard-model';

const svc = (type: ServiceTypeId, lang = 'x'): Service => ({ type, lang });

/** v5 helper: a service with (or without) a user-typed custom name. */
const namedSvc = (type: ServiceTypeId, name?: string, lang = 'x'): Service =>
  name === undefined ? { type, lang } : { type, lang, name };

describe('design data (verbatim from the source of truth)', () => {
  it('GBAS matches design line 612', () => {
    expect(GBAS).toEqual([
      'Energy',
      'Water',
      'Transport',
      'Buildings',
      'Environment & Health',
      'Management Consulting',
      'Architecture & Landscape',
    ]);
  });

  it('PEOPLE matches design lines 614–625', () => {
    expect(PEOPLE).toEqual([
      { name: 'Daniel Bruun', chapter: 'Digital Engineering & Delivery' },
      { name: 'Magdalena Keller', chapter: 'ML & Data Engineering' },
      { name: 'Jyotheena Jose', chapter: 'Digital Engineering & Delivery' },
      { name: 'Fabian Geier', chapter: 'Product Architecture' },
      { name: 'Piyush Lamba', chapter: 'Hyper Automation & Visualisation' },
      { name: 'Simon Scott Siedler', chapter: 'Developer Platform Engineering' },
      { name: 'Mansi Gautam', chapter: 'Developer Platform Engineering' },
      { name: 'Joe Evans', chapter: 'Developer Platform Engineering' },
      { name: 'Stephanie Bramlage', chapter: 'Developer Platform Engineering' },
      { name: 'Anshu Pathak', chapter: 'Developer Platform Engineering' },
    ]);
  });

  it('TYPES matches design lines 627–633', () => {
    expect(TYPES).toEqual([
      { id: 'fe', tag: 'FE', label: 'Frontend', langs: ['React', 'Vue', 'Blazor'] },
      { id: 'api', tag: 'API', label: 'Backend API', langs: ['.NET', 'Python', 'Node.js'] },
      { id: 'wk', tag: 'WK', label: 'Worker', langs: ['.NET', 'Python', 'Go'] },
      { id: 'dp', tag: 'DP', label: 'Data pipeline', langs: ['Python', 'dbt', 'Spark'] },
      { id: 'inf', tag: 'INF', label: 'Infrastructure', langs: ['Terraform', 'Bicep'] },
    ]);
  });

  it('PROV_STEPS matches design lines 644–651', () => {
    expect(PROV_STEPS).toEqual([
      { label: 'Reserving project ID', meta: 'CATALOG' },
      { label: 'Creating GitHub repositories', meta: 'GITHUB' },
      { label: 'Applying Ramboll standards & templates', meta: 'GOLDEN PATH' },
      { label: 'Wiring CI & validation pipelines', meta: 'ACTIONS' },
      { label: 'Setting branch protection & CODEOWNERS', meta: 'GOVERNANCE' },
      { label: 'Granting contributor access', meta: 'ENTRA ID' },
    ]);
  });

  it('typeOf resolves every id to its TYPES entry', () => {
    for (const t of TYPES) {
      expect(typeOf(t.id)).toBe(t);
    }
  });

  it('provisioning ticks every 750ms (design line 702)', () => {
    expect(PROV_TICK_MS).toBe(750);
  });
});

describe('slugOf', () => {
  it('slugifies the design example name', () => {
    expect(slugOf('District Heating Optimizer')).toBe('district-heating-optimizer');
  });

  it('collapses runs of non-alphanumerics and trims edge dashes', () => {
    expect(slugOf('  --Hello!!  World++  ')).toBe('hello-world');
    expect(slugOf('A/B testing (v2)')).toBe('a-b-testing-v2');
  });

  it('falls back to unnamed-project for empty/degenerate input', () => {
    expect(slugOf('')).toBe('unnamed-project');
    expect(slugOf('   ')).toBe('unnamed-project');
    expect(slugOf('!!!')).toBe('unnamed-project');
  });

  const slugArbs = [fc.string(), fc.string({ unit: 'binary' })];

  it.each(slugArbs.map((arb, i) => [i, arb] as const))(
    'property: output is /^[a-z0-9-]+$/ or the fallback (arb %i)',
    (_i, arb) => {
      fc.assert(
        fc.property(arb, (s) => {
          const out = slugOf(s);
          expect(out).toMatch(/^[a-z0-9-]+$/);
        }),
      );
    },
  );

  it('property: never has leading or trailing dashes', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const out = slugOf(s);
        expect(out.startsWith('-')).toBe(false);
        expect(out.endsWith('-')).toBe(false);
      }),
    );
  });

  it('property: idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const out = slugOf(s);
        expect(slugOf(out)).toBe(out);
      }),
    );
  });
});

describe('repoName', () => {
  it('leaves a unique type unsuffixed', () => {
    const services = [svc('fe'), svc('api')];
    expect(repoName('slug', services, 0)).toBe('slug-fe');
    expect(repoName('slug', services, 1)).toBe('slug-api');
  });

  it('numbers duplicate types by ordinal among the same type', () => {
    const services = [svc('api'), svc('api')];
    expect(repoName('slug', services, 0)).toBe('slug-api-1');
    expect(repoName('slug', services, 1)).toBe('slug-api-2');
  });

  it('mixes suffixed duplicates with unsuffixed singles', () => {
    const services = [svc('fe'), svc('api'), svc('wk'), svc('api'), svc('api')];
    expect(repoName('s', services, 0)).toBe('s-fe');
    expect(repoName('s', services, 1)).toBe('s-api-1');
    expect(repoName('s', services, 2)).toBe('s-wk');
    expect(repoName('s', services, 3)).toBe('s-api-2');
    expect(repoName('s', services, 4)).toBe('s-api-3');
  });

  it('throws on an out-of-range index', () => {
    expect(() => repoName('s', [svc('fe')], 5)).toThrow(/out of range/);
  });

  it('property: ordinal numbering matches position among same-type services', () => {
    const idArb = fc.constantFrom<ServiceTypeId>('fe', 'api', 'wk', 'dp', 'inf');
    fc.assert(
      fc.property(fc.array(idArb, { minLength: 1, maxLength: 12 }), (ids) => {
        const services = ids.map((t) => svc(t));
        ids.forEach((t, i) => {
          const total = ids.filter((x) => x === t).length;
          const ordinal = ids.slice(0, i + 1).filter((x) => x === t).length;
          expect(repoName('p', services, i)).toBe(
            total > 1 ? `p-${t}-${ordinal}` : `p-${t}`,
          );
        });
      }),
    );
  });
});

describe('canInit / missingParts / initHint', () => {
  const full: WizardDraft = { name: 'X', gba: 'Energy', services: [svc('fe')] };

  it('requires a trimmed name, a GBA, and at least one service', () => {
    expect(canInit(full)).toBe(true);
    expect(canInit({ ...full, name: '   ' })).toBe(false);
    expect(canInit({ ...full, gba: null })).toBe(false);
    expect(canInit({ ...full, services: [] })).toBe(false);
  });

  it('lists every missing part in design order', () => {
    expect(missingParts({ name: '', gba: null, services: [] })).toEqual([
      'a name',
      'a GBA',
      'at least one service',
    ]);
    expect(missingParts({ ...full, gba: null })).toEqual(['a GBA']);
    expect(missingParts(full)).toEqual([]);
  });

  it('renders the exact hint copy', () => {
    expect(initHint(full)).toBe('~40 seconds. Everything is reversible.');
    expect(initHint({ name: '', gba: null, services: [] })).toBe(
      'Needs a name, a GBA, at least one service.',
    );
    expect(initHint({ ...full, services: [] })).toBe('Needs at least one service.');
    expect(initHint({ ...full, name: ' ', services: [] })).toBe(
      'Needs a name, at least one service.',
    );
  });
});

describe('blueprintName', () => {
  it('falls back to Untitled project', () => {
    expect(blueprintName('')).toBe('Untitled project');
    expect(blueprintName('   ')).toBe('Untitled project');
    expect(blueprintName(' Grid Twin ')).toBe('Grid Twin');
  });
});

describe('createdRepos / createdSummary / createdId', () => {
  const base: CreatedProject = {
    name: 'District Heating Optimizer',
    gba: 'Energy',
    services: [svc('fe'), svc('api')],
    contributors: [],
  };

  it('builds ramboll/{slug}-{typeId} chips per service, without ordinals', () => {
    expect(createdRepos(base)).toEqual([
      'ramboll/district-heating-optimizer-fe',
      'ramboll/district-heating-optimizer-api',
    ]);
    // Design lines 1143–1146 intentionally skip the -1/-2 ordinal suffix.
    expect(createdRepos({ ...base, services: [svc('api'), svc('api')] })).toEqual([
      'ramboll/district-heating-optimizer-api',
      'ramboll/district-heating-optimizer-api',
    ]);
  });

  it('pluralizes repositories exactly', () => {
    expect(createdSummary({ ...base, services: [svc('fe')] })).toBe(
      '1 repository scaffolded under Energy.',
    );
    expect(createdSummary(base)).toBe('2 repositories scaffolded under Energy.');
  });

  it('pluralizes contributors exactly', () => {
    expect(createdSummary({ ...base, contributors: ['a'] })).toBe(
      '2 repositories scaffolded under Energy, 1 contributor granted access.',
    );
    expect(createdSummary({ ...base, contributors: ['a', 'b'] })).toBe(
      '2 repositories scaffolded under Energy, 2 contributors granted access.',
    );
  });

  it('derives the created id from the first two GBA letters', () => {
    expect(createdId('Energy')).toBe('RMB-EN-043');
    expect(createdId('Water')).toBe('RMB-WA-043');
    expect(createdId('Architecture & Landscape')).toBe('RMB-AR-043');
    expect(createdId('')).toBe('RMB-XX-043');
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Daniel Bruun')).toBe('DB');
    expect(initials('Simon Scott Siedler')).toBe('SS');
    expect(initials('Cher')).toBe('C');
  });

  it('covers every design PERSON with two letters', () => {
    for (const p of PEOPLE) {
      expect(initials(p.name)).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe('provisioning step progression', () => {
  it('classifies rows relative to the current step', () => {
    expect(provRowState(-1, 0)).toBe('pending');
    expect(provRowState(2, 0)).toBe('done');
    expect(provRowState(2, 1)).toBe('done');
    expect(provRowState(2, 2)).toBe('active');
    expect(provRowState(2, 3)).toBe('pending');
    expect(provRowState(6, 5)).toBe('done');
  });

  it('completes one tick after the last row turns done', () => {
    expect(isProvComplete(5)).toBe(false);
    expect(isProvComplete(6)).toBe(false); // all rows done, still showing
    expect(isProvComplete(7)).toBe(true); // design: step > PROV_STEPS.length
    expect(isProvComplete(3, 2)).toBe(true);
  });

  it('property: exactly one active row while a step is in range', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: PROV_STEPS.length - 1 }), (step) => {
        const states = PROV_STEPS.map((_, i) => provRowState(step, i));
        expect(states.filter((s) => s === 'active')).toHaveLength(1);
        expect(states.indexOf('active')).toBe(step);
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v3 — live wiring (SPEC §13/§16)
// ─────────────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEPARTMENTS: Department[] = [
  { id: 'energy', name: 'Energy', team_slug: 'energy' },
  { id: 'environment-health', name: 'Environment & Health', team_slug: 'environment-health' },
];

const USERS: Contributor[] = [
  {
    id: 'u-joe',
    name: 'Joe Evans',
    email: 'joe@ramboll.com',
    github_login: 'joe',
    chapter: 'Developer Platform Engineering',
  },
  {
    id: 'u-alex',
    name: 'Alex Holmberg',
    email: 'alex@ramboll.com',
    github_login: 'Alex793x',
    chapter: 'Developer Platform Engineering',
  },
];

/** A live catalog with SPEC §14 availability holes (wk .NET unavailable etc.). */
const LIVE_CATALOG: CatalogServiceType[] = [
  {
    id: 'fe',
    tag: 'FE',
    label: 'Frontend',
    langs: [
      { id: 'react', name: 'React', available: true },
      { id: 'vue', name: 'Vue', available: false },
      { id: 'blazor', name: 'Blazor', available: false },
    ],
  },
  {
    id: 'api',
    tag: 'API',
    label: 'Backend API',
    langs: [
      { id: 'dotnet', name: '.NET', available: true },
      { id: 'python', name: 'Python', available: true },
      { id: 'node', name: 'Node.js', available: true },
    ],
  },
  {
    id: 'wk',
    tag: 'WK',
    label: 'Worker',
    langs: [
      { id: 'dotnet', name: '.NET', available: false },
      { id: 'python', name: 'Python', available: true },
      { id: 'go', name: 'Go', available: true },
    ],
  },
];

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    name: 'District Heating Optimizer',
    description: 'Optimizes district heating grids',
    gba: 'Energy',
    contributors: ['Joe Evans'],
    services: [{ type: 'api', lang: 'Python' }],
    layout: 'multi-repo',
    departments: DEPARTMENTS,
    users: USERS,
    catalog: LIVE_CATALOG,
    author: 'Alex Holmberg',
    ...overrides,
  };
}

describe('v3 constants', () => {
  it('layout selector data: default, options order, exact captions', () => {
    expect(DEFAULT_LAYOUT).toBe('multi-repo');
    expect(LAYOUT_OPTIONS).toEqual([
      { id: 'multi-repo', label: 'Multi-repo' },
      { id: 'monolith', label: 'Monolith' },
    ]);
    expect(LAYOUT_HINTS['multi-repo']).toBe('One repository per service.');
    expect(LAYOUT_HINTS.monolith).toBe(
      'Single repository — smart CI rebuilds only changed services.',
    );
  });

  it('the overlay animates the real events at 450ms per row', () => {
    expect(EVENT_TICK_MS).toBe(450);
  });

  it('PROV_META maps all 8 workflow keys per SPEC §16', () => {
    expect(PROV_META).toEqual({
      signin: 'ENTRA ID',
      form: 'CATALOG',
      render: 'GOLDEN PATH',
      create_repo: 'GITHUB',
      commit: 'GITHUB',
      branches: 'GOVERNANCE',
      seed_ci: 'ACTIONS',
      register: 'CATALOG',
    });
    for (const s of WORKFLOW_STEPS) {
      expect(provMeta(s.key)).toBe(PROV_META[s.key]);
    }
  });

  it('provMeta degrades unknown keys to their uppercased form', () => {
    expect(provMeta('warm_cache')).toBe('WARM CACHE');
  });

  it('LANG_SLUGS covers every design language with a valid slug', () => {
    for (const t of TYPES) {
      for (const name of t.langs) {
        const slug = LANG_SLUGS[name];
        expect(slug, `missing slug for ${name}`).toBeDefined();
        expect(slug).toMatch(SLUG_RE);
      }
    }
    expect(LANG_SLUGS['.NET']).toBe('dotnet');
    expect(LANG_SLUGS['Node.js']).toBe('node');
  });
});

describe('designCatalog / catalogEntry / langSlug / defaultLang', () => {
  it('designCatalog mirrors TYPES with everything available', () => {
    const cat = designCatalog();
    expect(cat.map((t) => t.id)).toEqual(TYPES.map((t) => t.id));
    for (const [i, t] of cat.entries()) {
      expect(t.tag).toBe(TYPES[i]!.tag);
      expect(t.label).toBe(TYPES[i]!.label);
      expect(t.langs.map((l) => l.name)).toEqual([...TYPES[i]!.langs]);
      expect(t.langs.every((l) => l.available)).toBe(true);
      expect(t.langs.every((l) => SLUG_RE.test(l.id))).toBe(true);
    }
  });

  it('catalogEntry prefers the live entry and falls back to the design TYPES', () => {
    expect(catalogEntry(LIVE_CATALOG, 'wk')).toBe(LIVE_CATALOG[2]);
    // 'dp' is absent from LIVE_CATALOG → design fallback (all available).
    const dp = catalogEntry(LIVE_CATALOG, 'dp');
    expect(dp.label).toBe('Data pipeline');
    expect(dp.langs.map((l) => l.name)).toEqual(['Python', 'dbt', 'Spark']);
    expect(dp.langs.every((l) => l.available)).toBe(true);
  });

  it('langSlug prefers the catalog slug, then LANG_SLUGS, then slugOf', () => {
    const weird: CatalogServiceType[] = [
      {
        id: 'api',
        tag: 'API',
        label: 'Backend API',
        langs: [{ id: 'py3', name: 'Python', available: true }],
      },
    ];
    expect(langSlug(weird, 'api', 'Python')).toBe('py3'); // catalog wins
    expect(langSlug(weird, 'api', '.NET')).toBe('dotnet'); // fallback map
    expect(langSlug([], 'api', 'Python')).toBe('python'); // no catalog at all
    expect(langSlug([], 'api', 'Objective C++')).toBe('objective-c'); // slugOf fallback
  });

  it('defaultLang picks the first AVAILABLE language, else the first listed', () => {
    expect(defaultLang(LIVE_CATALOG[0]!)).toBe('React');
    expect(defaultLang(LIVE_CATALOG[2]!)).toBe('Python'); // wk: .NET is SOON
    expect(
      defaultLang({
        id: 'inf',
        tag: 'INF',
        label: 'Infrastructure',
        langs: [
          { id: 'terraform', name: 'Terraform', available: false },
          { id: 'bicep', name: 'Bicep', available: false },
        ],
      }),
    ).toBe('Terraform');
  });
});

describe('buildInitializePayload', () => {
  it('maps the full state onto the exact v2 wire body', () => {
    expect(buildInitializePayload(baseState({ layout: 'monolith' }))).toEqual({
      project_name: 'District Heating Optimizer',
      blueprint: 'api-python',
      department_id: 'energy',
      user_ids: ['u-joe'],
      service_kind: 'rest-api',
      description: 'Optimizes district heating grids',
      author: 'Alex Holmberg',
      layout: 'monolith',
      services: [{ type: 'api', lang: 'python' }],
    });
  });

  it('maps GBA names to fetched department ids (non-slug ids included)', () => {
    const payload = buildInitializePayload(baseState({ gba: 'Environment & Health' }));
    expect(payload.department_id).toBe('environment-health');
  });

  it('drops contributor names that are not in the fetched users', () => {
    const payload = buildInitializePayload(
      baseState({ contributors: ['Joe Evans', 'Nobody Known', 'Alex Holmberg'] }),
    );
    expect(payload.user_ids).toEqual(['u-joe', 'u-alex']);
  });

  // ── fast-check arbitraries ──────────────────────────────────────────────────
  const typeArb = fc.constantFrom<ServiceTypeId>('fe', 'api', 'wk', 'dp', 'inf');
  const langNameArb = fc.oneof(
    fc.constantFrom(...Object.keys(LANG_SLUGS)),
    fc.string({ minLength: 0, maxLength: 12 }),
  );
  const serviceArb: fc.Arbitrary<Service> = fc.record({ type: typeArb, lang: langNameArb });
  const layoutArb = fc.constantFrom<RepoLayout>('multi-repo', 'monolith');

  const stateArb = (services: fc.Arbitrary<readonly Service[]>) =>
    fc.record<WizardState>({
      name: fc.string({ maxLength: 30 }),
      description: fc.string({ maxLength: 30 }),
      gba: fc.option(fc.constantFrom(...GBAS), { nil: null }),
      contributors: fc.uniqueArray(fc.constantFrom(...USERS.map((u) => u.name))),
      services,
      layout: layoutArb,
      departments: fc.constant(DEPARTMENTS),
      users: fc.constant(USERS),
      catalog: fc.constant(LIVE_CATALOG),
      author: fc.string({ maxLength: 20 }),
    });

  const anyStateArb = stateArb(fc.array(serviceArb, { maxLength: 6 }));

  it('property: the payload has non-empty services ⟺ canInit (given name + GBA)', () => {
    const submittableFields = stateArb(fc.array(serviceArb, { maxLength: 6 })).filter(
      (s) => s.name.trim() !== '' && s.gba !== null,
    );
    fc.assert(
      fc.property(submittableFields, (state) => {
        const payload = buildInitializePayload(state);
        expect(payload.services.length > 0).toBe(canInit(state));
      }),
    );
  });

  it('property: canInit always implies non-empty payload services (any state)', () => {
    fc.assert(
      fc.property(anyStateArb, (state) => {
        const payload = buildInitializePayload(state);
        expect(payload.services).toHaveLength(state.services.length);
        if (canInit(state)) {
          expect(payload.services.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('property: the layout round-trips and is always a valid token', () => {
    fc.assert(
      fc.property(anyStateArb, (state) => {
        const payload = buildInitializePayload(state);
        expect(payload.layout).toBe(state.layout);
        expect(['multi-repo', 'monolith']).toContain(payload.layout);
      }),
    );
  });

  it('property: every emitted service lang is a valid lowercase slug', () => {
    fc.assert(
      fc.property(anyStateArb, (state) => {
        for (const sv of buildInitializePayload(state).services) {
          expect(sv.lang).toMatch(SLUG_RE);
        }
      }),
    );
  });

  it('regression: prototype-member display names slugify instead of resolving Object.prototype', () => {
    // fast-check found this: LANG_SLUGS["constructor"] resolved to Function via the
    // prototype chain, leaking a function as the lang. Pin the own-property guard.
    for (const hostile of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      const state = baseState({ services: [{ type: 'api', lang: hostile }] });
      for (const sv of buildInitializePayload(state).services) {
        expect(typeof sv.lang).toBe('string');
        expect(sv.lang).toMatch(SLUG_RE);
      }
    }
  });

  // ── v5 — named services (SPEC §19.1/§19.5) ─────────────────────────────────
  describe('v5 named services', () => {
    it('includes the trimmed name ONLY when the user set one', () => {
      const state = baseState({
        services: [
          { type: 'api', lang: 'Python', name: '  ingest ' },
          { type: 'api', lang: 'Python' },
          { type: 'wk', lang: 'Go', name: '   ' },
        ],
      });
      const payload = buildInitializePayload(state);
      expect(payload.services).toEqual([
        { type: 'api', lang: 'python', name: 'ingest' },
        { type: 'api', lang: 'python' },
        { type: 'wk', lang: 'go' },
      ]);
      // toEqual ignores absent-vs-undefined; pin the exact key sets.
      expect(Object.keys(payload.services[0]!)).toEqual(['type', 'lang', 'name']);
      expect(Object.keys(payload.services[1]!)).toEqual(['type', 'lang']);
      expect(Object.keys(payload.services[2]!)).toEqual(['type', 'lang']);
    });

    it('regression pin: the no-names payload is BYTE-identical to the pre-v5 shape', () => {
      const payload = buildInitializePayload(baseState({ layout: 'monolith' }));
      // Literal pre-v5 expected object — field order matches the builder.
      const preV5 = {
        project_name: 'District Heating Optimizer',
        blueprint: 'api-python',
        department_id: 'energy',
        user_ids: ['u-joe'],
        service_kind: 'rest-api',
        description: 'Optimizes district heating grids',
        author: 'Alex Holmberg',
        layout: 'monolith',
        services: [{ type: 'api', lang: 'python' }],
      };
      expect(JSON.stringify(payload)).toBe(JSON.stringify(preV5));
    });

    // A guaranteed-valid SPEC §19.1 slug: leading letter + 1–29 tail chars.
    const validNameArb = fc
      .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
        fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'), {
          minLength: 1,
          maxLength: 29,
        }),
      )
      .map(([head, tail]) => head + tail.join(''));

    /** Services whose `name` is absent, a valid slug, or a hostile string. */
    const namedServiceArb: fc.Arbitrary<Service> = fc.record(
      {
        type: typeArb,
        lang: langNameArb,
        name: fc.oneof(validNameArb, fc.string({ maxLength: 8 })),
      },
      { requiredKeys: ['type', 'lang'] },
    );

    const namedStateArb = stateArb(fc.array(namedServiceArb, { maxLength: 6 })).filter(
      (s) => s.name.trim() !== '' && s.gba !== null,
    );

    it('property: under canInit every sent name is valid and resolved names are pairwise distinct', () => {
      fc.assert(
        fc.property(namedStateArb, (state) => {
          if (!canInit(state)) return;
          const payload = buildInitializePayload(state);
          for (const sv of payload.services) {
            if (sv.name !== undefined) {
              expect(sv.name).toMatch(SERVICE_NAME_RE);
            }
          }
          const resolved = state.services.map((_, i) =>
            resolvedServiceName(state.services, i),
          );
          expect(new Set(resolved).size).toBe(resolved.length);
        }),
      );
    });

    it('property: name appears in the payload iff the user set a non-blank one, trimmed', () => {
      fc.assert(
        fc.property(namedStateArb, (state) => {
          const payload = buildInitializePayload(state);
          state.services.forEach((sv, i) => {
            const trimmed = sv.name?.trim() ?? '';
            const sent = payload.services[i]!;
            if (trimmed === '') {
              expect('name' in sent).toBe(false);
            } else {
              expect(sent.name).toBe(trimmed);
            }
          });
        }),
      );
    });

    it('property: no-name states serialize byte-identically to the pre-v5 builder (oracle)', () => {
      fc.assert(
        fc.property(anyStateArb, (state) => {
          const payload = buildInitializePayload(state);
          // Oracle: the v4 builder, inlined verbatim from the pre-v5 revision.
          const dept = state.departments.find((d) => d.name === state.gba);
          const v4 = {
            project_name: state.name.trim(),
            blueprint: 'api-python',
            department_id: dept?.id ?? (state.gba !== null ? slugOf(state.gba) : ''),
            user_ids: state.contributors
              .map((n) => state.users.find((u) => u.name === n)?.id)
              .filter((id): id is string => id !== undefined),
            service_kind: 'rest-api',
            description: state.description.trim(),
            author: state.author,
            layout: state.layout,
            services: state.services.map((sv) => ({
              type: sv.type,
              lang: langSlug(state.catalog, sv.type, sv.lang),
            })),
          };
          expect(JSON.stringify(payload)).toBe(JSON.stringify(v4));
        }),
      );
    });
  });
});

describe('serviceDir / monolithRepo / blueprintRepoLine', () => {
  const services: Service[] = [
    { type: 'fe', lang: 'React' },
    { type: 'api', lang: '.NET' },
    { type: 'api', lang: 'Python' },
  ];

  it('applies the ordinal rule without the slug prefix', () => {
    expect(serviceDir(services, 0)).toBe('fe');
    expect(serviceDir(services, 1)).toBe('api-1');
    expect(serviceDir(services, 2)).toBe('api-2');
  });

  it('throws on an out-of-range index', () => {
    expect(() => serviceDir(services, 5)).toThrow(/out of range/);
  });

  it('monolithRepo prefixes the org', () => {
    expect(monolithRepo('grid-twin')).toBe('ramboll/grid-twin');
  });

  it('blueprintRepoLine switches between repoName and services/{dir}', () => {
    expect(blueprintRepoLine('multi-repo', 'grid-twin', services, 1)).toBe('grid-twin-api-1');
    expect(blueprintRepoLine('monolith', 'grid-twin', services, 1)).toBe('services/api-1');
  });

  it('property: repoName is exactly slug + "-" + serviceDir (shared ordinal rule)', () => {
    const idArb = fc.constantFrom<ServiceTypeId>('fe', 'api', 'wk', 'dp', 'inf');
    fc.assert(
      fc.property(fc.array(idArb, { minLength: 1, maxLength: 12 }), (ids) => {
        const svcs = ids.map((t) => ({ type: t, lang: 'x' }));
        ids.forEach((_, i) => {
          expect(repoName('p', svcs, i)).toBe(`p-${serviceDir(svcs, i)}`);
        });
      }),
    );
  });
});

describe('provRowsFromEvents', () => {
  const events: ProgressEvent[] = WORKFLOW_STEPS.map((s, i) => ({
    step: i + 1,
    key: s.key,
    title: `Real ${s.title}`,
    status: 'done',
    detail: '',
  }));

  it('maps the real events to rows: labels = titles, metas = SPEC §16 mapping', () => {
    const rows = provRowsFromEvents(events);
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.label)).toEqual(events.map((e) => `Real ${WORKFLOW_STEPS[events.indexOf(e)]!.title}`));
    expect(rows.map((r) => r.meta)).toEqual([
      'ENTRA ID',
      'CATALOG',
      'GOLDEN PATH',
      'GITHUB',
      'GITHUB',
      'GOVERNANCE',
      'ACTIONS',
      'CATALOG',
    ]);
  });

  it('falls back to the canonical 8 WORKFLOW_STEPS while no events exist', () => {
    const rows = provRowsFromEvents([]);
    expect(rows.map((r) => r.label)).toEqual(WORKFLOW_STEPS.map((s) => s.title));
    expect(rows).toHaveLength(8);
  });
});

describe('initErrorMessage', () => {
  it("prefers the API's JSON {error} body", () => {
    const err = Object.assign(new Error('keel-api request failed (502)'), {
      body: '{"error":"github rate limit exceeded"}',
    });
    expect(initErrorMessage(err)).toBe('github rate limit exceeded');
  });

  it('falls back to the error message for non-JSON bodies', () => {
    const err = Object.assign(new Error('keel-api request failed (500)'), {
      body: '<html>gateway timeout</html>',
    });
    expect(initErrorMessage(err)).toBe('keel-api request failed (500)');
  });

  it('handles plain errors and garbage', () => {
    expect(initErrorMessage(new Error('network down'))).toBe('network down');
    expect(initErrorMessage(undefined)).toBe('Provisioning failed. Please try again.');
    expect(initErrorMessage({})).toBe('Provisioning failed. Please try again.');
  });
});

describe('createdRepoChips', () => {
  const base: CreatedProject = {
    name: 'District Heating Optimizer',
    gba: 'Energy',
    services: [{ type: 'api', lang: 'Python' }],
    contributors: [],
  };
  const repos: RepoCoordinates[] = [
    {
      owner: 'Alex793x',
      name: 'district-heating-optimizer-api',
      html_url: 'https://github.com/Alex793x/district-heating-optimizer-api',
      default_branch: 'main',
      branches: ['main', 'dev', 'staging'],
    },
  ];

  it('links the REAL outcome repos as owner/name', () => {
    expect(createdRepoChips({ ...base, repos })).toEqual([
      {
        label: 'Alex793x/district-heating-optimizer-api',
        href: 'https://github.com/Alex793x/district-heating-optimizer-api',
      },
    ]);
  });

  it('falls back to the design-derived chips without repos', () => {
    expect(createdRepoChips(base)).toEqual([
      { label: 'ramboll/district-heating-optimizer-api', href: null },
    ]);
    expect(createdRepoChips({ ...base, repos: [] })).toEqual([
      { label: 'ramboll/district-heating-optimizer-api', href: null },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v5 — named service components (SPEC §19.1/§19.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('defaultServiceName / resolvedServiceName (SPEC §19.1)', () => {
  it('gives a unique type its bare type id', () => {
    const services = [namedSvc('fe'), namedSvc('api')];
    expect(defaultServiceName(services, 0)).toBe('fe');
    expect(defaultServiceName(services, 1)).toBe('api');
  });

  it('numbers repeated unnamed types by ordinal', () => {
    const services = [namedSvc('api'), namedSvc('api')];
    expect(defaultServiceName(services, 0)).toBe('api-1');
    expect(defaultServiceName(services, 1)).toBe('api-2');
  });

  it('counts ordinals among UNNAMED services of the type only', () => {
    // Naming the first api removes it from the unnamed pool — the remaining
    // unnamed api is unique again and drops its suffix, exactly like
    // keel-core resolve_service_names (placeholder == server default).
    const services = [namedSvc('api', 'ingest'), namedSvc('api')];
    expect(defaultServiceName(services, 1)).toBe('api');
    // The named entry's own placeholder previews the default it would get if
    // cleared: back in a pool of two → api-1.
    expect(defaultServiceName(services, 0)).toBe('api-1');
  });

  it('resolvedServiceName prefers the trimmed custom name', () => {
    const services = [namedSvc('api', '  ingest  '), namedSvc('api')];
    expect(resolvedServiceName(services, 0)).toBe('ingest');
    expect(resolvedServiceName(services, 1)).toBe('api');
  });

  it('treats blank names as unset', () => {
    const services = [namedSvc('api', '   '), namedSvc('api', '')];
    expect(resolvedServiceName(services, 0)).toBe('api-1');
    expect(resolvedServiceName(services, 1)).toBe('api-2');
  });

  it('throws on an out-of-range index', () => {
    expect(() => defaultServiceName([namedSvc('fe')], 5)).toThrow(/out of range/);
    expect(() => resolvedServiceName([namedSvc('fe')], 5)).toThrow(/out of range/);
    expect(() => serviceNameError([namedSvc('fe')], 5)).toThrow(/out of range/);
  });

  it('property: parity with the v4 ordinal algorithm when nothing is named', () => {
    const idArb = fc.constantFrom<ServiceTypeId>('fe', 'api', 'wk', 'dp', 'inf');
    fc.assert(
      fc.property(fc.array(idArb, { minLength: 1, maxLength: 12 }), (ids) => {
        const services = ids.map((t) => namedSvc(t));
        ids.forEach((t, i) => {
          // Oracle: the pre-v5 ordinal rule, counted among ALL of the type.
          const total = ids.filter((x) => x === t).length;
          const ordinal = ids.slice(0, i + 1).filter((x) => x === t).length;
          const v4 = total > 1 ? `${t}-${ordinal}` : t;
          expect(defaultServiceName(services, i)).toBe(v4);
          expect(resolvedServiceName(services, i)).toBe(v4);
          expect(serviceDir(services, i)).toBe(v4);
          expect(repoName('p', services, i)).toBe(`p-${v4}`);
          expect(serviceNameError(services, i)).toBeNull();
        });
      }),
    );
  });
});

describe('serviceNameError (SPEC §19.5)', () => {
  it('accepts valid SPEC §19.1 slugs', () => {
    for (const name of ['ingest', 'a1', 'heat-optimizer-ingest', 'api-2']) {
      expect(serviceNameError([namedSvc('api', name)], 0)).toBeNull();
    }
  });

  it('rejects malformed names with the exact format copy', () => {
    expect(SERVICE_NAME_FORMAT_ERROR).toBe(
      'Use a-z, 0-9, hyphens (2–30 chars, start with a letter)',
    );
    for (const name of [
      'Ingest',
      'x',
      '1abc',
      'has space',
      '-lead',
      'a'.repeat(31),
      'æøå',
    ]) {
      expect(serviceNameError([namedSvc('api', name)], 0)).toBe(
        SERVICE_NAME_FORMAT_ERROR,
      );
    }
  });

  it('reports duplicates on BOTH rows with the exact copy', () => {
    expect(SERVICE_NAME_DUPLICATE_ERROR).toBe('Name already used in this project');
    const services = [namedSvc('api', 'ingest'), namedSvc('wk', 'ingest')];
    expect(serviceNameError(services, 0)).toBe(SERVICE_NAME_DUPLICATE_ERROR);
    expect(serviceNameError(services, 1)).toBe(SERVICE_NAME_DUPLICATE_ERROR);
  });

  it("flags a custom name colliding with another row's DEFAULT", () => {
    // The unnamed api resolves to 'api'; naming the fe 'api' collides.
    const services = [namedSvc('api'), namedSvc('fe', 'api')];
    expect(serviceNameError(services, 0)).toBe(SERVICE_NAME_DUPLICATE_ERROR);
    expect(serviceNameError(services, 1)).toBe(SERVICE_NAME_DUPLICATE_ERROR);
  });

  it('duplicate check is case-sensitive exact (uppercase fails format first)', () => {
    // 'Ingest' differs case-sensitively from 'ingest' — no duplicate — and
    // the uppercase name reports the slug-rule violation instead.
    const services = [namedSvc('api', 'ingest'), namedSvc('wk', 'Ingest')];
    expect(serviceNameError(services, 0)).toBeNull();
    expect(serviceNameError(services, 1)).toBe(SERVICE_NAME_FORMAT_ERROR);
  });

  it('distinct custom names and defaults coexist error-free', () => {
    const services = [
      namedSvc('api', 'ingest'),
      namedSvc('api'),
      namedSvc('api', 'egress'),
    ];
    expect(services.map((_, i) => serviceNameError(services, i))).toEqual([
      null,
      null,
      null,
    ]);
    // The lone unnamed api keeps the bare default.
    expect(resolvedServiceName(services, 1)).toBe('api');
  });
});

describe('canInit / missingParts / initHint with names (v5 gate)', () => {
  const draft = (services: readonly Service[]): WizardDraft => ({
    name: 'X',
    gba: 'Energy',
    services,
  });

  it('rename → collision → fix flow flips canInit false and back', () => {
    const ok = draft([namedSvc('api', 'ingest'), namedSvc('api')]);
    expect(canInit(ok)).toBe(true);

    const collided = draft([namedSvc('api', 'ingest'), namedSvc('api', 'ingest')]);
    expect(canInit(collided)).toBe(false);
    expect(missingParts(collided)).toEqual(['valid service names']);
    expect(initHint(collided)).toBe('Needs valid service names.');

    const fixed = draft([namedSvc('api', 'ingest'), namedSvc('api', 'egress')]);
    expect(canInit(fixed)).toBe(true);
    expect(initHint(fixed)).toBe('~40 seconds. Everything is reversible.');
  });

  it('an invalid name alone blocks initialization', () => {
    const bad = draft([namedSvc('api', 'Nope')]);
    expect(canInit(bad)).toBe(false);
    expect(missingParts(bad)).toEqual(['valid service names']);
    expect(initHint(bad)).toBe('Needs valid service names.');
  });

  it('name errors stack after the design parts in the hint', () => {
    const d: WizardDraft = { name: '', gba: null, services: [namedSvc('api', 'x')] };
    expect(missingParts(d)).toEqual(['a name', 'a GBA', 'valid service names']);
  });
});

describe('repoName / serviceDir / blueprintRepoLine with custom names (v5 preview)', () => {
  const services: Service[] = [
    { type: 'api', lang: 'Python', name: 'ingest' },
    { type: 'api', lang: 'Python' },
  ];

  it('previews {slug}-{name} and services/{name} for named services', () => {
    expect(repoName('heat', services, 0)).toBe('heat-ingest');
    expect(serviceDir(services, 0)).toBe('ingest');
    expect(blueprintRepoLine('monolith', 'heat', services, 0)).toBe('services/ingest');
    // The unnamed api is unique among unnamed → bare default, no suffix.
    expect(repoName('heat', services, 1)).toBe('heat-api');
    expect(blueprintRepoLine('multi-repo', 'heat', services, 1)).toBe('heat-api');
  });
});
