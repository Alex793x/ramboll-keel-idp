import { describe, expect, it, vi } from "vitest";
import { ApiError, DEFAULT_API_URL, KeelApi } from "./api";
import type { AddServiceBody, AddServiceResponse, InitializePayload } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("KeelApi", () => {
  it("uses the default base URL when none is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    const api = new KeelApi({ fetchImpl });
    await api.health();
    expect(fetchImpl).toHaveBeenCalledWith(
      `${DEFAULT_API_URL}/api/health`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const api = new KeelApi({ baseUrl: "http://api.test/", fetchImpl });
    await api.listDepartments();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/api/departments",
      expect.anything(),
    );
  });

  it("GET /api/departments returns the parsed array", async () => {
    const depts = [{ id: "buildings", name: "Buildings", team_slug: "buildings" }];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(depts));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await expect(api.listDepartments()).resolves.toEqual(depts);
  });

  it("GET /api/departments/:id/users encodes the id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await api.listUsers("a b/c");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/api/departments/a%20b%2Fc/users",
      expect.anything(),
    );
  });

  it("GET /api/users returns the global contributors (with chapter)", async () => {
    const people = [
      {
        id: "u-joe",
        name: "Joe Evans",
        email: "joe.evans@ramboll.com",
        github_login: "joe-evans",
        chapter: "Developer Platform Engineering",
      },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(people));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await expect(api.getUsers()).resolves.toEqual(people);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/api/users",
      expect.anything(),
    );
  });

  it("GET /api/service-catalog returns the typed catalog", async () => {
    const catalog = [
      {
        id: "fe",
        tag: "FE",
        label: "Frontend",
        langs: [
          { id: "react", name: "React", available: true },
          { id: "vue", name: "Vue", available: false },
        ],
      },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(catalog));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await expect(api.getServiceCatalog()).resolves.toEqual(catalog);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/api/service-catalog",
      expect.anything(),
    );
  });

  it("POST /api/initialize sends JSON with the right method + headers + body", async () => {
    const payload: InitializePayload = {
      project_name: "invoicing-api",
      blueprint: "api-python",
      department_id: "buildings",
      user_ids: ["u-anya"],
      service_kind: "rest-api",
      description: "desc",
      author: "Anya",
      layout: "multi-repo",
      services: [{ type: "api", lang: "python" }],
    };
    const repo = {
      owner: "Alex793x",
      name: "keel-e2e-invoicing-api",
      html_url: "https://github.com/Alex793x/keel-e2e-invoicing-api",
      default_branch: "main",
      branches: ["main", "dev", "staging"],
    };
    const response = {
      events: [],
      outcome: {
        project: "invoicing-api",
        repo,
        repos: [repo],
        docs_path: "docs/",
        blueprint_version: "1.0.0",
        catalog_id: "cat-1",
        events: [],
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(response));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });

    const res = await api.initialize(payload);

    expect(res).toEqual(response);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/initialize");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("GET /api/projects/:id/overview returns the parsed overview and encodes the id", async () => {
    // A shape-faithful (if minimal) ProjectOverview body — the client passes it through untouched.
    const overview = {
      project: { id: "RMB-EN-042", name: "District Heating Optimizer" },
      team: [],
      branches: [],
      runs: [],
      commits: [],
    };
    // Fresh Response per call: a Response body can only be read once.
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse(overview));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await expect(api.projectOverview("RMB-EN-042")).resolves.toEqual(overview);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/api/projects/RMB-EN-042/overview",
      expect.anything(),
    );

    await api.projectOverview("a b/c");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "http://api.test/api/projects/a%20b%2Fc/overview",
      expect.anything(),
    );
  });

  it("GET /api/projects/:id/overview throws ApiError(404) for unknown projects", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ error: "unknown project" }), { status: 404 }),
      );
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await expect(api.projectOverview("RMB-XX-999")).rejects.toBeInstanceOf(ApiError);
    await expect(api.projectOverview("RMB-XX-999")).rejects.toMatchObject({ status: 404 });
  });

  it("POST /api/projects/:id/services sends the body and returns the parsed response", async () => {
    const body: AddServiceBody = { type: "api", lang: "python", name: "ingest" };
    const response: AddServiceResponse = {
      service: { dir: "services/ingest", type: "api", lang: "python", name: "ingest" },
      repo: null,
      materialized: false,
      events: [
        { step: 1, key: "form", title: "Validate form", status: "done", detail: "" },
        { step: 2, key: "register", title: "Register in catalog", status: "done", detail: "" },
      ],
    };
    // Fresh Response per call: a Response body can only be read once.
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse(response));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });

    await expect(api.addProjectService("RMB-EN-042", body)).resolves.toEqual(response);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/projects/RMB-EN-042/services");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(body);

    // The project id is URL-encoded, like every other id-bearing path.
    await api.addProjectService("a b/c", body);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "http://api.test/api/projects/a%20b%2Fc/services",
      expect.anything(),
    );
  });

  it("POST /api/projects/:id/services surfaces the server's {error} message on a 400 collision", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: "a service named 'api-1' already exists" }), {
            status: 400,
          }),
      );
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    const call = () =>
      api.addProjectService("RMB-EN-042", { type: "api", lang: "python", name: "api-1" });

    await expect(call()).rejects.toBeInstanceOf(ApiError);
    await expect(call()).rejects.toMatchObject({
      status: 400,
      message: "a service named 'api-1' already exists",
    });
  });

  it("POST /api/projects/:id/services throws ApiError(404) for unknown projects", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ error: "unknown project" }), { status: 404 }),
      );
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    const call = () =>
      api.addProjectService("RMB-XX-999", { type: "api", lang: "python" });

    await expect(call()).rejects.toBeInstanceOf(ApiError);
    await expect(call()).rejects.toMatchObject({ status: 404, message: "unknown project" });
  });

  it("throws ApiError on a non-2xx response", async () => {
    // Fresh Response per call: a Response body can only be read once.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response("boom", { status: 500 }));
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });
    await expect(api.listProjects()).rejects.toBeInstanceOf(ApiError);
    await expect(api.listProjects()).rejects.toMatchObject({
      status: 500,
      body: "boom",
    });
  });
});
