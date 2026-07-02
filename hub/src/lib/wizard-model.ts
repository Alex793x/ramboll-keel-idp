/**
 * Wizard model — pure data + logic for the "Initialize a project" golden path.
 *
 * Ported EXACTLY from the design source of truth
 * `Ramble IDP Hub MVP Design/Ramboll Developer Hub.dc.html`:
 * - `GBAS` (line 612), `PEOPLE` (lines 614–625), `TYPES` (lines 627–633),
 *   `PROV_STEPS` (lines 644–651)
 * - `slugOf` (lines 684–687), `repoName` (line 1088)
 * - `canInit` / missing parts / init hint (lines 1108–1112, 1223)
 * - `createdRepos` (lines 1143–1146), `createdSummary` (lines 1147–1151),
 *   `createdId` (line 1227), `initials` (line 1065)
 * - provisioning step progression (`startProvisioning`, lines 689–703)
 *
 * Do NOT edit copy, data, or numbering behaviour here without re-checking the
 * design source — the UI components render these values verbatim.
 *
 * v3 additions (SPEC §13/§16) — pure wiring logic, no visual data changes:
 * layout selection ({@link DEFAULT_LAYOUT}, {@link LAYOUT_HINTS}), the live
 * payload builder ({@link buildInitializePayload}), catalog helpers
 * ({@link designCatalog}, {@link catalogEntry}, {@link langSlug},
 * {@link defaultLang}), monolith blueprint derivations ({@link serviceDir},
 * {@link monolithRepo}, {@link blueprintRepoLine}) and the real-provisioning
 * overlay rows ({@link provRowsFromEvents}, {@link initErrorMessage}).
 */

import { WORKFLOW_STEPS } from './types';
import type {
  CatalogServiceType,
  Contributor,
  Department,
  InitializePayload,
  ProgressEvent,
  RepoCoordinates,
  RepoLayout,
} from './types';

export type { RepoLayout } from './types';

/** The five service-component type ids offered by the wizard. */
export type ServiceTypeId = 'fe' | 'api' | 'wk' | 'dp' | 'inf';

/** One selectable person chip (design `PEOPLE`). */
export interface Person {
  readonly name: string;
  readonly chapter: string;
}

/** One service-component type card (design `TYPES`). */
export interface ServiceType {
  readonly id: ServiceTypeId;
  readonly tag: string;
  readonly label: string;
  /** Non-empty: the first entry is the default language for a new service. */
  readonly langs: readonly [string, ...string[]];
}

/** One service the user added to the draft: a type + chosen language. */
export interface Service {
  readonly type: ServiceTypeId;
  readonly lang: string;
}

/** One row of the provisioning overlay (design `PROV_STEPS`). */
export interface ProvStep {
  readonly label: string;
  readonly meta: string;
}

/** The wizard fields that gate initialization (design state pname/gba/services). */
export interface WizardDraft {
  readonly name: string;
  readonly gba: string | null;
  readonly services: readonly Service[];
}

/** Snapshot captured when provisioning completes (design `state.created`). */
export interface CreatedProject {
  readonly name: string;
  readonly gba: string;
  readonly services: readonly Service[];
  readonly contributors: readonly string[];
  /**
   * v3: the REAL repositories from the engine outcome (`outcome.repos`).
   * When present, the created screen links these instead of deriving
   * `ramboll/{slug}-{type}` chips from the draft.
   */
  readonly repos?: readonly RepoCoordinates[];
}

/** Global Business Areas — design line 612, verbatim. */
export const GBAS: readonly string[] = [
  'Energy',
  'Water',
  'Transport',
  'Buildings',
  'Environment & Health',
  'Management Consulting',
  'Architecture & Landscape',
];

/** Contributor directory — design lines 614–625, verbatim. */
export const PEOPLE: readonly Person[] = [
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
];

/** Service-component types — design lines 627–633, verbatim. */
export const TYPES: readonly ServiceType[] = [
  { id: 'fe', tag: 'FE', label: 'Frontend', langs: ['React', 'Vue', 'Blazor'] },
  { id: 'api', tag: 'API', label: 'Backend API', langs: ['.NET', 'Python', 'Node.js'] },
  { id: 'wk', tag: 'WK', label: 'Worker', langs: ['.NET', 'Python', 'Go'] },
  { id: 'dp', tag: 'DP', label: 'Data pipeline', langs: ['Python', 'dbt', 'Spark'] },
  { id: 'inf', tag: 'INF', label: 'Infrastructure', langs: ['Terraform', 'Bicep'] },
];

/** Provisioning overlay rows — design lines 644–651, verbatim. */
export const PROV_STEPS: readonly ProvStep[] = [
  { label: 'Reserving project ID', meta: 'CATALOG' },
  { label: 'Creating GitHub repositories', meta: 'GITHUB' },
  { label: 'Applying Ramboll standards & templates', meta: 'GOLDEN PATH' },
  { label: 'Wiring CI & validation pipelines', meta: 'ACTIONS' },
  { label: 'Setting branch protection & CODEOWNERS', meta: 'GOVERNANCE' },
  { label: 'Granting contributor access', meta: 'ENTRA ID' },
];

const TYPE_BY_ID: ReadonlyMap<ServiceTypeId, ServiceType> = new Map(
  TYPES.map((t) => [t.id, t]),
);

/** Looks up a service type by id (design's inline `typeOf`, line 1087). */
export function typeOf(id: ServiceTypeId): ServiceType {
  const t = TYPE_BY_ID.get(id);
  if (t === undefined) {
    // Unreachable: `ServiceTypeId` is a closed union covering every TYPES entry.
    throw new Error(`unknown service type: ${String(id)}`);
  }
  return t;
}

/**
 * Project name → repo slug — design lines 684–687, verbatim: lowercase, trim,
 * collapse runs of non-alphanumerics to '-', strip edge dashes, fallback
 * 'unnamed-project'.
 */
export function slugOf(name: string): string {
  const s = (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unnamed-project';
}

/**
 * Repo name for the service at `index` — design line 1088, verbatim:
 * `slug + '-' + type`, and when more than one service shares that type, a
 * `-<ordinal>` suffix counting same-type services up to and including `index`.
 */
export function repoName(
  slug: string,
  services: readonly Service[],
  index: number,
): string {
  const svc = services[index];
  if (svc === undefined) {
    throw new Error(`repoName: index ${index} out of range (${services.length} services)`);
  }
  const sameTypeTotal = services.filter((x) => x.type === svc.type).length;
  const ordinal = services.slice(0, index + 1).filter((x) => x.type === svc.type).length;
  return slug + '-' + svc.type + (sameTypeTotal > 1 ? '-' + String(ordinal) : '');
}

/** Whether the draft can be initialized — design line 1108. */
export function canInit(draft: WizardDraft): boolean {
  return !!draft.name.trim() && !!draft.gba && draft.services.length > 0;
}

/** The missing prerequisites, in design order — design lines 1109–1112. */
export function missingParts(draft: WizardDraft): string[] {
  const missing: string[] = [];
  if (!draft.name.trim()) missing.push('a name');
  if (!draft.gba) missing.push('a GBA');
  if (draft.services.length === 0) missing.push('at least one service');
  return missing;
}

/** Hint next to the Initialize button — design line 1223, verbatim copy. */
export function initHint(draft: WizardDraft): string {
  return canInit(draft)
    ? '~40 seconds. Everything is reversible.'
    : 'Needs ' + missingParts(draft).join(', ') + '.';
}

/** Blueprint header fallback — design line 1197. */
export function blueprintName(name: string): string {
  return name.trim() || 'Untitled project';
}

/**
 * Created-screen repo chips — design lines 1143–1146, verbatim:
 * `ramboll/{slug}-{typeId}` per service (no de-dup ordinal suffix here).
 */
export function createdRepos(created: CreatedProject): string[] {
  const slug = slugOf(created.name);
  return created.services.map((sv) => 'ramboll/' + slug + '-' + sv.type);
}

/** Created-screen summary sentence — design lines 1147–1151, verbatim. */
export function createdSummary(created: CreatedProject): string {
  const svcCount = created.services.length;
  const ppl = created.contributors.length;
  return (
    String(svcCount) +
    (svcCount === 1 ? ' repository' : ' repositories') +
    ' scaffolded under ' +
    created.gba +
    (ppl
      ? ', ' + String(ppl) + ' contributor' + (ppl > 1 ? 's' : '') + ' granted access.'
      : '.')
  );
}

/** Created project id — design line 1227: 'RMB-' + first two GBA letters + '-043'. */
export function createdId(gba: string): string {
  return 'RMB-' + (gba || 'XX').slice(0, 2).toUpperCase() + '-043';
}

/** Avatar initials: first letters of the first two words — design line 1065. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('');
}

/** Render state of a provisioning row — design lines 1120–1121. */
export function provRowState(
  provStep: number,
  index: number,
): 'done' | 'active' | 'pending' {
  if (provStep > index) return 'done';
  if (provStep === index) return 'active';
  return 'pending';
}

/**
 * Whether the provisioning sequence has finished — design lines 693–701: the
 * step counter ticks 0..totalSteps on a 750ms interval and the run completes
 * one tick AFTER the last row turns done (i.e. when `step > totalSteps`).
 */
export function isProvComplete(
  provStep: number,
  totalSteps: number = PROV_STEPS.length,
): boolean {
  return provStep > totalSteps;
}

/** Milliseconds between provisioning steps — design line 702. */
export const PROV_TICK_MS = 750;

// ─────────────────────────────────────────────────────────────────────────────
// v3 — live wiring (SPEC §13/§16). Pure logic only; design data above is frozen.
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds between overlay rows when animating the REAL returned events. */
export const EVENT_TICK_MS = 450;

/** The wizard's default repository layout. */
export const DEFAULT_LAYOUT: RepoLayout = 'multi-repo';

/** Selector chip labels, in design order (Multi-repo first = default). */
export const LAYOUT_OPTIONS: readonly { id: RepoLayout; label: string }[] = [
  { id: 'multi-repo', label: 'Multi-repo' },
  { id: 'monolith', label: 'Monolith' },
] as const;

/** One-line captions under the layout selector, switching with the choice. */
export const LAYOUT_HINTS: Readonly<Record<RepoLayout, string>> = {
  'multi-repo': 'One repository per service.',
  monolith: 'Single repository — smart CI rebuilds only changed services.',
};

/**
 * Fallback display-name → wire-slug map (SPEC §13 display names). Only used
 * when the live service catalog does not carry the language — the catalog
 * response is always preferred (see {@link langSlug}).
 */
export const LANG_SLUGS: Readonly<Record<string, string>> = {
  React: 'react',
  Vue: 'vue',
  Blazor: 'blazor',
  '.NET': 'dotnet',
  Python: 'python',
  'Node.js': 'node',
  Go: 'go',
  dbt: 'dbt',
  Spark: 'spark',
  Terraform: 'terraform',
  Bicep: 'bicep',
};

function langSlugFallback(displayName: string): string {
  return LANG_SLUGS[displayName] ?? slugOf(displayName);
}

/**
 * The design's TYPES as a service catalog (everything available). Used as the
 * initial render state so the wizard keeps its design pixels while
 * `/api/service-catalog` loads (or when the API is unreachable).
 */
export function designCatalog(): CatalogServiceType[] {
  return TYPES.map((t) => ({
    id: t.id,
    tag: t.tag,
    label: t.label,
    langs: t.langs.map((name) => ({ id: langSlugFallback(name), name, available: true })),
  }));
}

/** The catalog entry for a type, falling back to the design's TYPES entry. */
export function catalogEntry(
  catalog: readonly CatalogServiceType[],
  type: ServiceTypeId,
): CatalogServiceType {
  const live = catalog.find((t) => t.id === type);
  if (live !== undefined) return live;
  const dt = typeOf(type);
  return {
    id: dt.id,
    tag: dt.tag,
    label: dt.label,
    langs: dt.langs.map((name) => ({ id: langSlugFallback(name), name, available: true })),
  };
}

/**
 * Display name → wire slug for a service's language. Prefers the slug the
 * live catalog reports for that type; falls back to {@link LANG_SLUGS}, then
 * to {@link slugOf} — so the emitted value is ALWAYS a valid lowercase slug.
 */
export function langSlug(
  catalog: readonly CatalogServiceType[],
  type: string,
  displayName: string,
): string {
  const entry = catalog.find((t) => t.id === type);
  const lang = entry?.langs.find((l) => l.name === displayName);
  return lang?.id ?? langSlugFallback(displayName);
}

/**
 * Default language (display name) when a type card is clicked: the first
 * AVAILABLE language, falling back to the first listed (design `langs[0]`).
 */
export function defaultLang(entry: CatalogServiceType): string {
  const first = entry.langs.find((l) => l.available) ?? entry.langs[0];
  return first?.name ?? '';
}

/**
 * Everything {@link buildInitializePayload} needs, in one pure value: the
 * draft fields (+ layout) and the live directory data they map onto.
 */
export interface WizardState {
  readonly name: string;
  readonly description: string;
  /** Selected GBA (department NAME — mapped to its id via `departments`). */
  readonly gba: string | null;
  /** Selected contributor NAMES — mapped to user ids via `users`. */
  readonly contributors: readonly string[];
  /** Draft services; `lang` holds the DISPLAY name (mapped via `catalog`). */
  readonly services: readonly Service[];
  readonly layout: RepoLayout;
  readonly departments: readonly Department[];
  readonly users: readonly Contributor[];
  readonly catalog: readonly CatalogServiceType[];
  /** The signed-in user reported to the engine. */
  readonly author: string;
}

/**
 * Build the v2 `POST /api/initialize` body from the wizard state (pure).
 *
 * - `gba` (name) → `department_id` via the fetched departments.
 * - contributor names → `user_ids` via the fetched users (unknowns dropped).
 * - services → `[{type, lang}]` with display-name → slug via {@link langSlug}.
 * - `blueprint`/`service_kind` are inert legacy placeholders (SPEC §13).
 */
export function buildInitializePayload(state: WizardState): InitializePayload {
  const dept = state.departments.find((d) => d.name === state.gba);
  return {
    project_name: state.name.trim(),
    blueprint: 'python-service',
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
}

/**
 * Monolith service directory for the service at `index`: the same ordinal
 * rule as {@link repoName}, without the slug prefix (keel-core
 * `service_dirs`: `{type}` when unique, `{type}-{n}` when the type repeats).
 */
export function serviceDir(services: readonly Service[], index: number): string {
  const svc = services[index];
  if (svc === undefined) {
    throw new Error(`serviceDir: index ${index} out of range (${services.length} services)`);
  }
  const sameTypeTotal = services.filter((x) => x.type === svc.type).length;
  const ordinal = services.slice(0, index + 1).filter((x) => x.type === svc.type).length;
  return svc.type + (sameTypeTotal > 1 ? '-' + String(ordinal) : '');
}

/** The single monolith repository shown in the blueprint header. */
export function monolithRepo(slug: string): string {
  return 'ramboll/' + slug;
}

/**
 * The repo line under a blueprint service node: multi-repo keeps the existing
 * {@link repoName} derivation; monolith shows the in-repo `services/{dir}` path.
 */
export function blueprintRepoLine(
  layout: RepoLayout,
  slug: string,
  services: readonly Service[],
  index: number,
): string {
  return layout === 'monolith'
    ? 'services/' + serviceDir(services, index)
    : repoName(slug, services, index);
}

/**
 * SPEC §16 meta mapping: workflow event key → overlay meta chip. Labels come
 * from the event titles; these are the right-hand mono tags.
 */
export const PROV_META: Readonly<Record<string, string>> = {
  signin: 'ENTRA ID',
  form: 'CATALOG',
  render: 'GOLDEN PATH',
  create_repo: 'GITHUB',
  commit: 'GITHUB',
  branches: 'GOVERNANCE',
  seed_ci: 'ACTIONS',
  register: 'CATALOG',
};

/** Meta chip for a workflow key; unknown keys degrade to their uppercased form. */
export function provMeta(key: string): string {
  return PROV_META[key] ?? key.replace(/_/g, ' ').toUpperCase();
}

/**
 * Overlay rows from the REAL returned events (labels = event titles, metas =
 * {@link provMeta}). While no events exist yet (request in flight / failed),
 * falls back to the canonical 8 `WORKFLOW_STEPS` so the overlay renders its
 * full ladder immediately.
 */
export function provRowsFromEvents(events: readonly ProgressEvent[]): ProvStep[] {
  if (events.length === 0) {
    return WORKFLOW_STEPS.map((s) => ({ label: s.title, meta: provMeta(s.key) }));
  }
  return events.map((e) => ({ label: e.title, meta: provMeta(e.key) }));
}

/**
 * Human message for a failed initialize call: prefers the API's JSON
 * `{ "error": "…" }` body (ApiError carries it as `body`), then the error's
 * own message, then a generic fallback.
 */
export function initErrorMessage(err: unknown): string {
  const body = (err as { body?: unknown } | null)?.body;
  if (typeof body === 'string' && body !== '') {
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error !== '') return parsed.error;
    } catch {
      // Not a JSON body — fall through to the error message.
    }
  }
  if (err instanceof Error && err.message !== '') return err.message;
  return 'Provisioning failed. Please try again.';
}

/**
 * Created-screen chips: the REAL `outcome.repos` as `owner/name` links when
 * present, else the design's derived `ramboll/{slug}-{type}` chips (no href).
 */
export function createdRepoChips(
  created: CreatedProject,
): { label: string; href: string | null }[] {
  if (created.repos !== undefined && created.repos.length > 0) {
    return created.repos.map((r) => ({ label: `${r.owner}/${r.name}`, href: r.html_url }));
  }
  return createdRepos(created).map((label) => ({ label, href: null }));
}
