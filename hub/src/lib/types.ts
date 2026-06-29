/**
 * Hub-side mirror of the keel-core domain contract (SPEC §3.1 / §3.5).
 *
 * These types describe exactly what the Rust `keel-api` returns and accepts, so the
 * wizard, payload builder, and API client all speak one vocabulary.
 */

/** A Ramboll department (mocked). Maps to a GitHub team slug used for CODEOWNERS. */
export interface Department {
  id: string;
  name: string;
  team_slug: string;
}

/** A user who will own / review the new project (mocked). */
export interface User {
  id: string;
  name: string;
  email: string;
  /** GitHub handle without the leading `@`. */
  github_login: string;
}

/** The kind of Python service a blueprint can produce (keel-core `ServiceKind`, kebab-case). */
export type ServiceKind = "rest-api" | "worker";

/** Every service kind the wizard can offer, in display order. */
export const SERVICE_KINDS: readonly ServiceKind[] = ["rest-api", "worker"] as const;

/** Human labels for service kinds. */
export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  "rest-api": "REST API",
  worker: "Worker",
};

/** A blueprint entry from `GET /api/blueprints`. */
export interface Blueprint {
  name: string;
  title: string;
  description: string;
  version: string;
  parameters?: unknown;
}

/** Status of a single workflow step (keel-core `Status`, serialized lowercase). */
export type StepStatus = "started" | "done" | "skipped" | "error";

/** A progress event emitted once per workflow step (keel-core `ProgressEvent`). */
export interface ProgressEvent {
  step: number;
  key: string;
  title: string;
  status: StepStatus;
  detail: string;
}

/** Where a created repository lives (keel-core `RepoCoordinates`). */
export interface RepoCoordinates {
  owner: string;
  name: string;
  html_url: string;
  default_branch: string;
  branches: string[];
}

/** The result handed back when initialization completes (keel-core `InitOutcome`). */
export interface InitOutcome {
  project: string;
  repo: RepoCoordinates;
  docs_path: string;
  blueprint_version: string;
  catalog_id: string;
  events: ProgressEvent[];
}

/** Request body for `POST /api/initialize` (SPEC §3.5). */
export interface InitializePayload {
  project_name: string;
  blueprint: string;
  department_id: string;
  user_ids: string[];
  service_kind: ServiceKind;
  description: string;
  author: string;
}

/** Response from `POST /api/initialize`. */
export interface InitializeResponse {
  events: ProgressEvent[];
  outcome: InitOutcome;
}

/**
 * The canonical, ordered keys + titles of the 8-step initialization workflow
 * (keel-core `WORKFLOW_STEPS`, whitepaper §6). The hub pre-renders these so the
 * progress view shows all steps even before the API streams its events back.
 */
export const WORKFLOW_STEPS: readonly { key: string; title: string }[] = [
  { key: "signin", title: "Sign in" },
  { key: "form", title: "Validate form" },
  { key: "render", title: "Render blueprint" },
  { key: "create_repo", title: "Create repository" },
  { key: "commit", title: "Commit initial tree" },
  { key: "branches", title: "Create branches" },
  { key: "seed_ci", title: "Seed CI" },
  { key: "register", title: "Register in catalog" },
] as const;
