import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GBAS,
  PEOPLE,
  PROV_STEPS,
  PROV_TICK_MS,
  TYPES,
  blueprintName,
  canInit,
  createdId,
  createdRepos,
  createdSummary,
  initHint,
  initials,
  isProvComplete,
  missingParts,
  provRowState,
  repoName,
  slugOf,
  typeOf,
  type CreatedProject,
  type Service,
  type ServiceTypeId,
  type WizardDraft,
} from './wizard-model';

const svc = (type: ServiceTypeId, lang = 'x'): Service => ({ type, lang });

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
