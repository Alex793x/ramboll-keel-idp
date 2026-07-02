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
 */

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
