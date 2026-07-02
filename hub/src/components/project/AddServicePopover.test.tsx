/**
 * AddServicePopover tests — mocked fetch through a real KeelApi
 * (ProjectScreen.test idiom): open/close (chip, Esc, click-away), the
 * type → lang → name flow with the live suggestion + duplicate validation,
 * the happy-path POST + inline progress strip + `onAdded`, the
 * `catalog-only · demo project` note, and inline 400 errors.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeelApi } from "../../lib/api";
import type {
  AddServiceResponse,
  CatalogServiceType,
  OverviewService,
} from "../../lib/types";
import {
  AddServicePopover,
  CATALOG_NOTE_MS,
  CLOSE_AFTER_SUCCESS_MS,
  suggestServiceName,
} from "./AddServicePopover";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The dashboard fixture's services: dir basenames `api` + `fe` are taken. */
function fixtureServices(): OverviewService[] {
  return [
    { dir: "services/api", type: "api", lang: "python", name: "district-heating-optimizer-api" },
    { dir: "services/fe", type: "fe", lang: "react", name: "district-heating-optimizer-fe" },
  ];
}

function fixtureCatalog(): CatalogServiceType[] {
  return [
    {
      id: "fe",
      tag: "FE",
      label: "Frontend",
      langs: [
        { id: "react", name: "React", available: true },
        { id: "vue", name: "Vue", available: false },
      ],
    },
    {
      id: "api",
      tag: "API",
      label: "API service",
      langs: [
        { id: "python", name: "Python", available: true },
        { id: "dotnet", name: ".NET", available: false },
      ],
    },
    { id: "wk", tag: "WK", label: "Worker", langs: [{ id: "python", name: "Python", available: true }] },
    { id: "dp", tag: "DP", label: "Data pipeline", langs: [{ id: "python", name: "Python", available: true }] },
    { id: "inf", tag: "INF", label: "Infra", langs: [{ id: "terraform", name: "Terraform", available: true }] },
  ];
}

function addServiceResponse(materialized = true): AddServiceResponse {
  return {
    service: { dir: "services/api-1", type: "api", lang: "python", name: "api-1" },
    repo: materialized
      ? {
          name: "district-heating-optimizer-api-1",
          html_url: "https://github.com/ramboll/district-heating-optimizer-api-1",
          default_branch: "main",
        }
      : null,
    materialized,
    events: [
      { step: 1, key: "form", title: "Validate form", status: "done", detail: "" },
      { step: 2, key: "render", title: "Render blueprint", status: "done", detail: "" },
      { step: 3, key: "commit", title: "Commit service", status: "done", detail: "" },
      { step: 4, key: "register", title: "Register in catalog", status: "done", detail: "" },
    ],
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(opts: { addService?: () => Response | Promise<Response> } = {}) {
  const onAdded = vi.fn();
  const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/api/service-catalog")) return jsonResponse(fixtureCatalog());
    if (url.endsWith("/api/projects/RMB-EN-042/services")) {
      return opts.addService ? opts.addService() : jsonResponse(addServiceResponse());
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl: fetchImpl as typeof fetch });
  const utils = render(
    <AddServicePopover
      projectId="RMB-EN-042"
      services={fixtureServices()}
      api={api}
      onAdded={onAdded}
    />,
  );
  return { fetchImpl, onAdded, ...utils };
}

/** Flush pending microtasks (the mocked fetches resolve immediately). */
async function flush() {
  await act(async () => {});
}

/** Open the popover and wait for the catalog to load. */
async function openPopover() {
  fireEvent.click(screen.getByRole("button", { name: "+ Add service" }));
  await flush();
  return screen.getByRole("dialog", { name: "Add a service component" });
}

const addButton = () => screen.getByRole("button", { name: "Add service →" });
const nameInput = () => screen.getByLabelText("Service name");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AddServicePopover", () => {
  it("opens from the ghost chip, focuses the first type card, and closes on Escape", async () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openPopover();
    // Focus trap-lite: first type card gets focus once the catalog is in.
    const typeCards = screen.getAllByRole("button", { name: /Frontend/ });
    expect(document.activeElement).toBe(typeCards[0]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // …and focus returns to the trigger.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "+ Add service" }),
    );
  });

  it("closes on click-away but stays open for clicks inside", async () => {
    setup();
    const dialog = await openPopover();

    fireEvent.mouseDown(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the 5 type cards and dims unavailable languages as SOON", async () => {
    setup();
    await openPopover();
    for (const tag of ["FE", "API", "WK", "DP", "INF"]) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /API service/ }));
    expect(screen.getByRole("button", { name: "Python" })).toBeEnabled();
    const soon = screen.getByRole("button", { name: /\.NET/ });
    expect(soon).toBeDisabled();
    expect(soon).toHaveTextContent("SOON");
  });

  it("enables Add only when type, lang and a valid name are set", async () => {
    setup();
    await openPopover();
    expect(addButton()).toBeDisabled(); // no type picked yet

    fireEvent.click(screen.getByRole("button", { name: /API service/ }));
    expect(addButton()).toBeEnabled(); // lang defaulted, name suggested

    fireEvent.change(nameInput(), { target: { value: "" } });
    expect(addButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "Ingest" } }); // uppercase ⇒ invalid
    expect(addButton()).toBeDisabled();
    expect(screen.getByText("must match [a-z][a-z0-9-]{1,29}")).toBeInTheDocument();

    fireEvent.change(nameInput(), { target: { value: "ingest" } });
    expect(addButton()).toBeEnabled();
  });

  it("prefills the next free default name for the picked type", async () => {
    setup();
    await openPopover();

    // `api` is taken (dir services/api) ⇒ suggest api-1.
    fireEvent.click(screen.getByRole("button", { name: /API service/ }));
    expect(nameInput()).toHaveValue("api-1");

    // `wk` is free ⇒ suggest the bare tag.
    fireEvent.click(screen.getByRole("button", { name: /Worker/ }));
    expect(nameInput()).toHaveValue("wk");
  });

  it("rejects duplicates against existing service dirs and names", async () => {
    setup();
    await openPopover();
    fireEvent.click(screen.getByRole("button", { name: /API service/ }));

    fireEvent.change(nameInput(), { target: { value: "fe" } }); // dir basename
    expect(screen.getByText("name already taken")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();

    fireEvent.change(nameInput(), {
      target: { value: "district-heating-optimizer-api" }, // service name
    });
    expect(screen.getByText("name already taken")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it("happy path: POSTs the exact body, shows the event strip, then calls onAdded", async () => {
    let resolveAdd!: (r: Response) => void;
    const { fetchImpl, onAdded } = setup({
      addService: () => new Promise<Response>((r) => { resolveAdd = r; }),
    });
    await openPopover();
    fireEvent.click(screen.getByRole("button", { name: /API service/ }));
    fireEvent.click(addButton());

    // In flight: pulsing provisioning line, exact wire body.
    expect(screen.getByText("provisioning…")).toBeInTheDocument();
    const post = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/services"))!;
    expect(JSON.parse(post[1]?.body as string)).toEqual({
      type: "api",
      lang: "python",
      name: "api-1",
    });

    await act(async () => {
      resolveAdd(jsonResponse(addServiceResponse()));
    });

    // The compact strip: one row per returned event (key + status glyph).
    const rows = screen.getAllByTestId("addsvc-event");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("form");
    expect(rows[0]).toHaveTextContent("✓");
    expect(rows[3]).toHaveTextContent("register");
    expect(screen.queryByText("catalog-only · demo project")).not.toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(CLOSE_AFTER_SUCCESS_MS);
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("materialized:false shows the catalog-only note for 2s before closing", async () => {
    const { onAdded } = setup({
      addService: () => jsonResponse(addServiceResponse(false)),
    });
    await openPopover();
    fireEvent.click(screen.getByRole("button", { name: /API service/ }));
    fireEvent.click(addButton());
    await flush();

    expect(screen.getByText("catalog-only · demo project")).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(CATALOG_NOTE_MS - 1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a 400 shows the server's message inline and keeps the form editable", async () => {
    const { onAdded } = setup({
      addService: () =>
        jsonResponse({ error: "a service named 'api-1' already exists" }, 400),
    });
    await openPopover();
    fireEvent.click(screen.getByRole("button", { name: /API service/ }));
    fireEvent.click(addButton());
    await flush();

    expect(
      screen.getByText("a service named 'api-1' already exists"),
    ).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();

    // Form stays editable: rename and the Add button is live again.
    expect(nameInput()).toBeEnabled();
    fireEvent.change(nameInput(), { target: { value: "ingest" } });
    expect(addButton()).toBeEnabled();
  });
});

describe("suggestServiceName", () => {
  it("walks tag → tag-1 → tag-2 over taken dirs and names", () => {
    const services = fixtureServices();
    expect(suggestServiceName("wk", services)).toBe("wk");
    expect(suggestServiceName("api", services)).toBe("api-1");
    expect(
      suggestServiceName("api", [
        ...services,
        { dir: "services/api-1", type: "api", lang: "python", name: "api-1" },
      ]),
    ).toBe("api-2");
  });
});
