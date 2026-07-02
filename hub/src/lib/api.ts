/**
 * The Keel API client (SPEC §3.5 / §4): a thin, typed `fetch` wrapper around the
 * Rust `keel-api`. The base URL comes from `VITE_KEEL_API_URL`
 * (default `http://localhost:8787`).
 *
 * The client is constructed with an injectable `fetch` and base URL so it is
 * unit-testable with a mocked fetch and free of import.meta side effects.
 */

import type {
  AddServiceBody,
  AddServiceResponse,
  Blueprint,
  CatalogServiceType,
  Contributor,
  Department,
  InitOutcome,
  InitializePayload,
  InitializeResponse,
  ProjectOverview,
  User,
} from "./types";

export const DEFAULT_API_URL = "http://localhost:8787";

/** Resolve the configured API base URL, falling back to the default. */
export function resolveApiUrl(): string {
  // import.meta.env is statically replaced by Vite; guard for non-Vite contexts.
  const fromEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta).env?.VITE_KEEL_API_URL;
  return (fromEnv && String(fromEnv)) || DEFAULT_API_URL;
}

/** An error raised when the API responds with a non-2xx status. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `keel-api request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface KeelApiOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class KeelApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KeelApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? resolveApiUrl()).replace(/\/+$/, "");
    // Bind so callers can pass `window.fetch` / a mock without losing `this`.
    const f = options.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = f.bind(globalThis);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    if (!res.ok) {
      const body = await safeText(res);
      throw new ApiError(res.status, body);
    }
    return (await res.json()) as T;
  }

  /** `GET /api/health` → `{ status: "ok" }`. */
  health(): Promise<{ status: string }> {
    return this.request<{ status: string }>("/api/health");
  }

  /** `GET /api/departments`. */
  listDepartments(): Promise<Department[]> {
    return this.request<Department[]>("/api/departments");
  }

  /** `GET /api/departments/:id/users`. */
  listUsers(departmentId: string): Promise<User[]> {
    return this.request<User[]>(
      `/api/departments/${encodeURIComponent(departmentId)}/users`,
    );
  }

  /** `GET /api/users` — the global contributors (v3, SPEC §13). */
  getUsers(): Promise<Contributor[]> {
    return this.request<Contributor[]>("/api/users");
  }

  /** `GET /api/service-catalog` — the 5 service types with per-language availability. */
  getServiceCatalog(): Promise<CatalogServiceType[]> {
    return this.request<CatalogServiceType[]>("/api/service-catalog");
  }

  /** `GET /api/blueprints`. */
  listBlueprints(): Promise<Blueprint[]> {
    return this.request<Blueprint[]>("/api/blueprints");
  }

  /** `GET /api/projects`. */
  listProjects(): Promise<InitOutcome[]> {
    return this.request<InitOutcome[]>("/api/projects");
  }

  /** `GET /api/projects/:id/overview` — the v4 project dashboard payload (SPEC §18.1). */
  projectOverview(id: string): Promise<ProjectOverview> {
    return this.request<ProjectOverview>(
      `/api/projects/${encodeURIComponent(id)}/overview`,
    );
  }

  /** `POST /api/initialize` with the wizard-built payload. */
  initialize(payload: InitializePayload): Promise<InitializeResponse> {
    return this.request<InitializeResponse>("/api/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /**
   * `POST /api/projects/:id/services` — add a service component to a running
   * project (SPEC §19.4). Non-2xx rejects with an {@link ApiError} whose
   * message is the server's JSON `{ "error": … }` when the body carries one
   * (bad type/lang/name, collision ⇒ 400; unknown project ⇒ 404).
   */
  async addProjectService(
    id: string,
    body: AddServiceBody,
  ): Promise<AddServiceResponse> {
    try {
      return await this.request<AddServiceResponse>(
        `/api/projects/${encodeURIComponent(id)}/services`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    } catch (err) {
      if (err instanceof ApiError) {
        throw new ApiError(
          err.status,
          err.body,
          serverErrorMessage(err.body) ?? err.message,
        );
      }
      throw err;
    }
  }
}

/** The server's JSON `{ "error": "…" }` message, when the body carries one. */
function serverErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error !== ""
      ? parsed.error
      : null;
  } catch {
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** A lazily-constructed singleton for app code (tests construct their own). */
let singleton: KeelApi | null = null;
export function getApi(): KeelApi {
  if (!singleton) {
    singleton = new KeelApi();
  }
  return singleton;
}
