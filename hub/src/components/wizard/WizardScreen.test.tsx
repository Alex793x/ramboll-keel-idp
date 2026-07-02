import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeelApi } from '../../lib/api';
import { clearSession, saveSession } from '../../lib/auth';
import type {
  CatalogServiceType,
  Contributor,
  Department,
  InitializeResponse,
  ProgressEvent,
  RepoCoordinates,
} from '../../lib/types';
import { EVENT_TICK_MS } from '../../lib/wizard-model';
import { WizardScreen } from './WizardScreen';

// ── Live-API fixtures (mirror fixtures/mock-data.json + SPEC §13/§14) ────────

const DEPARTMENTS: Department[] = [
  { id: 'energy', name: 'Energy', team_slug: 'energy' },
  { id: 'water', name: 'Water', team_slug: 'water' },
  { id: 'transport', name: 'Transport', team_slug: 'transport' },
  { id: 'buildings', name: 'Buildings', team_slug: 'buildings' },
  { id: 'environment-health', name: 'Environment & Health', team_slug: 'environment-health' },
  {
    id: 'management-consulting',
    name: 'Management Consulting',
    team_slug: 'management-consulting',
  },
  {
    id: 'architecture-landscape',
    name: 'Architecture & Landscape',
    team_slug: 'architecture-landscape',
  },
];

const person = (id: string, name: string, chapter: string): Contributor => ({
  id,
  name,
  email: `${id.slice(2)}@ramboll.com`,
  github_login: id.slice(2),
  chapter,
});

/** 11 people = the design PEOPLE + Alex Holmberg (SPEC §13). */
const USERS: Contributor[] = [
  person('u-daniel', 'Daniel Bruun', 'Digital Engineering & Delivery'),
  person('u-magdalena', 'Magdalena Keller', 'ML & Data Engineering'),
  person('u-jyotheena', 'Jyotheena Jose', 'Digital Engineering & Delivery'),
  person('u-fabian', 'Fabian Geier', 'Product Architecture'),
  person('u-piyush', 'Piyush Lamba', 'Hyper Automation & Visualisation'),
  person('u-simon', 'Simon Scott Siedler', 'Developer Platform Engineering'),
  person('u-mansi', 'Mansi Gautam', 'Developer Platform Engineering'),
  person('u-joe', 'Joe Evans', 'Developer Platform Engineering'),
  person('u-stephanie', 'Stephanie Bramlage', 'Developer Platform Engineering'),
  person('u-anshu', 'Anshu Pathak', 'Developer Platform Engineering'),
  person('u-alex', 'Alex Holmberg', 'Developer Platform Engineering'),
];

/** Availability per SPEC §14: 8 blueprints exist, 6 combos stay SOON. */
const CATALOG: CatalogServiceType[] = [
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
  {
    id: 'dp',
    tag: 'DP',
    label: 'Data pipeline',
    langs: [
      { id: 'python', name: 'Python', available: true },
      { id: 'dbt', name: 'dbt', available: false },
      { id: 'spark', name: 'Spark', available: false },
    ],
  },
  {
    id: 'inf',
    tag: 'INF',
    label: 'Infrastructure',
    langs: [
      { id: 'terraform', name: 'Terraform', available: true },
      { id: 'bicep', name: 'Bicep', available: false },
    ],
  },
];

const EVENTS: ProgressEvent[] = [
  { step: 1, key: 'signin', title: 'Sign in', status: 'done', detail: 'alex' },
  { step: 2, key: 'form', title: 'Validate form', status: 'done', detail: '' },
  { step: 3, key: 'render', title: 'Render blueprint', status: 'done', detail: '' },
  { step: 4, key: 'create_repo', title: 'Create repository', status: 'done', detail: '' },
  { step: 5, key: 'commit', title: 'Commit initial tree', status: 'done', detail: '' },
  { step: 6, key: 'branches', title: 'Create branches', status: 'done', detail: '' },
  { step: 7, key: 'seed_ci', title: 'Seed CI', status: 'done', detail: '' },
  { step: 8, key: 'register', title: 'Register project', status: 'done', detail: '' },
];

const REPOS: RepoCoordinates[] = [
  {
    owner: 'Alex793x',
    name: 'district-heating-optimizer-api',
    html_url: 'https://github.com/Alex793x/district-heating-optimizer-api',
    default_branch: 'main',
    branches: ['main', 'dev', 'staging'],
  },
];

const INIT_RESPONSE: InitializeResponse = {
  events: EVENTS,
  outcome: {
    project: 'District Heating Optimizer',
    repo: REPOS[0]!,
    repos: REPOS,
    docs_path: 'docs/',
    blueprint_version: '2.0.0',
    catalog_id: 'RMB-EN-043',
    events: EVENTS,
  },
};

// ── Harness ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface MockOptions {
  /** Override the `/api/initialize` response factory. */
  initialize?: () => Response | Promise<Response>;
}

function mockFetch(options: MockOptions = {}) {
  return vi.fn(async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/api/departments')) return jsonResponse(DEPARTMENTS);
    if (url.endsWith('/api/users')) return jsonResponse(USERS);
    if (url.endsWith('/api/service-catalog')) return jsonResponse(CATALOG);
    if (url.endsWith('/api/initialize')) {
      return options.initialize ? options.initialize() : jsonResponse(INIT_RESPONSE);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function setup(options: MockOptions = {}) {
  const fetchImpl = mockFetch(options);
  const api = new KeelApi({ baseUrl: 'http://api.test', fetchImpl: fetchImpl as typeof fetch });
  const onCreated = vi.fn();
  const utils = render(<WizardScreen onCreated={onCreated} api={api} />);
  return { onCreated, fetchImpl, ...utils };
}

/** Flush pending microtasks (the mocked fetches resolve immediately). */
async function flush() {
  await act(async () => {});
}

function fillValidDraft() {
  fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
    target: { value: 'District Heating Optimizer' },
  });
  fireEvent.click(screen.getByText('Energy'));
  fireEvent.click(screen.getByText('Backend API')); // type card → adds a service
}

/** The POST body sent to /api/initialize, parsed. */
function sentPayload(fetchImpl: ReturnType<typeof mockFetch>): unknown {
  const call = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/api/initialize'));
  expect(call).toBeDefined();
  const init = (call as unknown[])[1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  saveSession({
    email: 'alex.holmberg@ramboll.com',
    name: 'Alex Holmberg',
    signedInAt: '2026-07-02T09:00:00.000Z',
  });
});

afterEach(() => {
  clearSession();
});

describe('WizardScreen', () => {
  it('renders the header copy verbatim', async () => {
    setup();
    await flush();
    expect(screen.getByText('GOLDEN PATH · NEW PROJECT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Initialize a project' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Every project ships with best-in-class building blocks: standardized architecture, approved libraries, CI & validation pipelines via GitHub Actions.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the GBA chips from the live departments (design names)', async () => {
    setup();
    await flush();
    for (const d of DEPARTMENTS) {
      expect(screen.getByText(d.name)).toBeInTheDocument();
    }
  });

  it('renders the 11 live contributors including Alex Holmberg, with initials', async () => {
    setup();
    await flush();
    for (const u of USERS) {
      expect(screen.getByText(u.name)).toBeInTheDocument();
    }
    expect(screen.getByText('AH')).toBeInTheDocument(); // Alex Holmberg's avatar
  });

  it('shows the slug hint fallback and updates it as the name is typed', async () => {
    setup();
    await flush();
    expect(screen.getByText('unnamed-project')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
      target: { value: 'Grid Twin 2.0' },
    });
    expect(screen.getByText('grid-twin-2-0')).toBeInTheDocument();
  });

  it('disables Initialize and lists every missing part until the draft is complete', async () => {
    setup();
    await flush();
    const button = screen.getByRole('button', { name: 'Initialize project' });
    expect(button).toBeDisabled();
    expect(
      screen.getByText('Needs a name, a GBA, at least one service.'),
    ).toBeInTheDocument();

    fillValidDraft();
    expect(button).toBeEnabled();
    expect(screen.getByText('~40 seconds. Everything is reversible.')).toBeInTheDocument();
  });

  it('toggles a GBA chip on and off (single-select)', async () => {
    setup();
    await flush();
    fireEvent.click(screen.getByText('Energy'));
    // Blueprint chip flips away from the empty-state copy…
    expect(screen.queryByText('No GBA yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Water'));
    // …and single-select means Water replaced Energy, still no empty state.
    expect(screen.queryByText('No GBA yet')).not.toBeInTheDocument();
    // 'Water' now also shows in the blueprint chip; the form chip comes first.
    fireEvent.click(screen.getAllByText('Water')[0]!);
    expect(screen.getByText('No GBA yet')).toBeInTheDocument();
  });

  it('counts the owner plus toggled contributors in the blueprint team chip', async () => {
    setup();
    await flush();
    expect(screen.getByText('1 people')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Daniel Bruun'));
    fireEvent.click(screen.getByText('Magdalena Keller'));
    expect(screen.getByText('3 people')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Daniel Bruun'));
    expect(screen.getByText('2 people')).toBeInTheDocument();
  });

  it('adds service rows with ordinal repo names when a type repeats', async () => {
    setup();
    await flush();
    fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
      target: { value: 'District Heating Optimizer' },
    });
    fireEvent.click(screen.getByText('Backend API'));
    // One api service: unsuffixed (form row + blueprint node render it).
    expect(screen.getAllByText('district-heating-optimizer-api')).toHaveLength(2);

    // 'Backend API' now also labels the row + blueprint node; the type card comes first.
    fireEvent.click(screen.getAllByText('Backend API')[0]!);
    expect(screen.getAllByText('district-heating-optimizer-api-1')).toHaveLength(2);
    expect(screen.getAllByText('district-heating-optimizer-api-2')).toHaveLength(2);
  });

  it('removes a service row via the ✕ control', async () => {
    setup();
    await flush();
    fireEvent.click(screen.getByText('Frontend'));
    expect(screen.getAllByText('unnamed-project-fe')).toHaveLength(2);
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('unnamed-project-fe')).not.toBeInTheDocument();
    expect(screen.getByText('Add service components to see them here')).toBeInTheDocument();
  });

  describe('service catalog availability (SPEC §14)', () => {
    it('defaults a new Worker to the first AVAILABLE language (Python, not .NET)', async () => {
      setup();
      await flush();
      fireEvent.click(screen.getByText('Worker'));
      // Blueprint node lang chip + selected form chip both say Python.
      expect(screen.getAllByText('Python')).toHaveLength(2);
    });

    it('renders unavailable languages dimmed with a SOON chip and not selectable', async () => {
      setup();
      await flush();
      fireEvent.click(screen.getByText('Frontend')); // React (available) is default
      // Vue + Blazor are SOON on the fe row.
      expect(screen.getAllByText('SOON')).toHaveLength(2);
      const vue = screen.getByText('Vue');
      expect(vue).toHaveStyle({ cursor: 'default', opacity: '0.75' });

      // Clicking Vue must NOT switch the service language away from React.
      fireEvent.click(vue);
      expect(screen.getAllByText('React')).toHaveLength(2); // form chip + blueprint chip
    });
  });

  describe('repository layout selector', () => {
    it('defaults to Multi-repo with the per-service caption', async () => {
      setup();
      await flush();
      expect(screen.getByText('REPOSITORY LAYOUT')).toBeInTheDocument();
      expect(screen.getByText('Multi-repo')).toBeInTheDocument();
      expect(screen.getByText('Monolith')).toBeInTheDocument();
      expect(screen.getByText('One repository per service.')).toBeInTheDocument();
    });

    it('switches the caption and the blueprint panel when Monolith is picked', async () => {
      setup();
      await flush();
      fireEvent.change(screen.getByPlaceholderText('e.g. District Heating Optimizer'), {
        target: { value: 'Grid Twin' },
      });
      fireEvent.click(screen.getByText('Backend API'));

      fireEvent.click(screen.getByText('Monolith'));
      expect(
        screen.getByText('Single repository — smart CI rebuilds only changed services.'),
      ).toBeInTheDocument();
      // Blueprint header shows the single repo; the node shows its in-repo dir.
      expect(screen.getByText('ramboll/grid-twin')).toBeInTheDocument();
      expect(screen.getByText('services/api')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Multi-repo'));
      expect(screen.getByText('One repository per service.')).toBeInTheDocument();
      expect(screen.queryByText('ramboll/grid-twin')).not.toBeInTheDocument();
    });
  });

  describe('real provisioning (POST /api/initialize)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not open the overlay or POST when the draft is incomplete', async () => {
      const { fetchImpl } = setup();
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      expect(screen.queryByText('PROVISIONING · RMB-NEW')).not.toBeInTheDocument();
      expect(
        fetchImpl.mock.calls.some(([u]) => String(u).endsWith('/api/initialize')),
      ).toBe(false);
    });

    it('POSTs the exact v2 payload built from the live directory data', async () => {
      const { fetchImpl } = setup();
      await flush();
      fillValidDraft();
      fireEvent.change(screen.getByPlaceholderText('One line on what this project does'), {
        target: { value: 'Optimizes district heating grids' },
      });
      fireEvent.click(screen.getByText('Python')); // switch the api service language
      fireEvent.click(screen.getByText('Joe Evans'));
      fireEvent.click(screen.getByText('Monolith'));

      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      await flush();

      expect(sentPayload(fetchImpl)).toEqual({
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

    it('animates the 8 returned events row by row, then reports the created project', async () => {
      const { onCreated } = setup();
      await flush();
      fillValidDraft();
      fireEvent.click(screen.getByText('Python'));
      fireEvent.click(screen.getByText('Joe Evans'));
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));

      // Overlay opens immediately (request in flight).
      expect(screen.getByText('PROVISIONING · RMB-NEW')).toBeInTheDocument();
      expect(screen.getByText('Standing up District Heating Optimizer')).toBeInTheDocument();

      await flush(); // POST resolves → the real event rows render
      for (const e of EVENTS) {
        expect(screen.getByText(e.title)).toBeInTheDocument();
      }
      expect(screen.getByText('ENTRA ID')).toBeInTheDocument();
      expect(screen.getAllByText('GITHUB')).toHaveLength(2);

      // Rows 1..8 turn done tick by tick; completion fires one tick later.
      act(() => {
        vi.advanceTimersByTime(EVENT_TICK_MS * EVENTS.length);
      });
      expect(onCreated).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(EVENT_TICK_MS);
      });
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith({
        name: 'District Heating Optimizer',
        gba: 'Energy',
        services: [{ type: 'api', lang: 'Python' }],
        contributors: ['Joe Evans'],
        repos: REPOS,
      });
      // Overlay closes with the hand-off.
      expect(screen.queryByText('PROVISIONING · RMB-NEW')).not.toBeInTheDocument();
    });

    it('shows the API error in the overlay and dismisses back to the intact form', async () => {
      const { onCreated, fetchImpl } = setup({
        initialize: () =>
          jsonResponse({ error: 'github rate limit exceeded' }, 502),
      });
      await flush();
      fillValidDraft();
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      await flush();

      // Error tone row + dismiss (design clay), no hand-off.
      expect(screen.getByText('github rate limit exceeded')).toBeInTheDocument();
      expect(screen.getByText('ERROR')).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
      expect(screen.queryByText('PROVISIONING · RMB-NEW')).not.toBeInTheDocument();
      // The draft survives: name still filled, Initialize still enabled.
      expect(screen.getByPlaceholderText('e.g. District Heating Optimizer')).toHaveValue(
        'District Heating Optimizer',
      );
      expect(screen.getByRole('button', { name: 'Initialize project' })).toBeEnabled();

      // And the run can be retried.
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      await flush();
      expect(
        fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/api/initialize')),
      ).toHaveLength(2);
    });

    it('cleans up the animation interval on unmount', async () => {
      const { onCreated, unmount } = setup();
      await flush();
      fillValidDraft();
      fireEvent.click(screen.getByRole('button', { name: 'Initialize project' }));
      await flush();
      act(() => {
        vi.advanceTimersByTime(EVENT_TICK_MS * 2);
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(EVENT_TICK_MS * 20);
      });
      expect(onCreated).not.toHaveBeenCalled();
    });
  });
});
