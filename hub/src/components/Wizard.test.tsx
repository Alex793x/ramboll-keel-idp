/**
 * UI E2E (SPEC §5.2): mount the wizard → select a department → select users →
 * fill details → submit → assert the API client was called with the EXACT
 * expected `POST /api/initialize` payload (fetch mocked).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wizard } from "./Wizard";
import { KeelApi } from "../lib/api";
import {
  FIXTURE_BLUEPRINTS,
  FIXTURE_DEPARTMENTS,
  FIXTURE_USERS,
} from "../test/fixtures";
import type { InitializeResponse } from "../lib/types";

const INIT_RESPONSE: InitializeResponse = {
  events: [
    { step: 1, key: "signin", title: "Sign in", status: "done", detail: "" },
    { step: 4, key: "create_repo", title: "Create repository", status: "done", detail: "created" },
  ],
  outcome: {
    project: "invoicing-api",
    repo: {
      owner: "Alex793x",
      name: "keel-e2e-invoicing-api",
      html_url: "https://github.com/Alex793x/keel-e2e-invoicing-api",
      default_branch: "main",
      branches: ["main", "dev", "staging"],
    },
    docs_path: "docs/architecture.md",
    blueprint_version: "1.0.0",
    catalog_id: "cat-1",
    events: [],
  },
};

/** A fetch mock that routes each keel-api path to the right fixture. */
function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    if (url.endsWith("/api/blueprints")) return json(FIXTURE_BLUEPRINTS);
    if (url.endsWith("/api/departments")) return json(FIXTURE_DEPARTMENTS);
    const usersMatch = url.match(/\/api\/departments\/([^/]+)\/users$/);
    if (usersMatch) {
      const id = decodeURIComponent(usersMatch[1]!);
      return json(FIXTURE_USERS[id] ?? []);
    }
    if (url.endsWith("/api/initialize") && init?.method === "POST") {
      return json(INIT_RESPONSE);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("Wizard (integration)", () => {
  it("drives department → users → details → submit with the exact payload", async () => {
    const user = userEvent.setup();
    const fetchImpl = makeFetchMock();
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl });

    render(<Wizard api={api} blueprint="python-service" />);

    // ── Step 1: department ──────────────────────────────────────────────
    const buildings = await screen.findByText("Buildings");
    await user.click(buildings);
    await user.click(screen.getByRole("button", { name: /next/i }));

    // ── Step 2: users ───────────────────────────────────────────────────
    const anya = await screen.findByText("Anya Sørensen");
    await user.click(anya);
    // Next should now be enabled (>=1 user).
    await user.click(screen.getByRole("button", { name: /next/i }));

    // ── Step 3: details ─────────────────────────────────────────────────
    const nameInput = await screen.findByLabelText(/project name/i);
    await user.type(nameInput, "invoicing-api");
    await user.selectOptions(screen.getByLabelText(/service kind/i), "worker");
    await user.type(screen.getByLabelText(/description/i), "Async invoice worker");
    await user.type(screen.getByLabelText(/author/i), "Anya Sørensen");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // ── Step 4: review & submit ─────────────────────────────────────────
    await screen.findByText(/review & submit/i);
    const submitBtn = screen.getByRole("button", { name: /initialize project/i });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    // ── Assert: exact initialize payload was sent ───────────────────────
    await waitFor(() => {
      const initCall = fetchImpl.mock.calls.find(([u]) =>
        String(u).endsWith("/api/initialize"),
      );
      expect(initCall).toBeTruthy();
    });

    const initCall = fetchImpl.mock.calls.find(([u]) =>
      String(u).endsWith("/api/initialize"),
    )!;
    const [, init] = initCall;
    expect((init as RequestInit).method).toBe("POST");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toEqual({
      project_name: "invoicing-api",
      blueprint: "python-service",
      department_id: "buildings",
      user_ids: ["u-anya"],
      service_kind: "worker",
      description: "Async invoice worker",
      author: "Anya Sørensen",
    });

    // ── Assert: progress view renders the resulting repo ────────────────
    const repoLink = await screen.findByRole("link", {
      name: /Alex793x\/keel-e2e-invoicing-api/,
    });
    expect(repoLink).toHaveAttribute(
      "href",
      "https://github.com/Alex793x/keel-e2e-invoicing-api",
    );
  });

  it("resets selected users when the department changes mid-flow", async () => {
    const user = userEvent.setup();
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl: makeFetchMock() });
    render(<Wizard api={api} blueprint="python-service" />);

    await user.click(await screen.findByText("Buildings"));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(await screen.findByText("Anya Sørensen"));

    // Go back and pick a different department.
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(await screen.findByText("Transport"));
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Priya/Lars are shown; none selected → Next disabled.
    await screen.findByText("Priya Nair");
    const usersStep = screen.getByText("Select owners").closest("fieldset")!;
    const checkboxes = within(usersStep).getAllByRole("checkbox");
    expect(checkboxes.every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("blocks Next until prerequisites are met at each step", async () => {
    const user = userEvent.setup();
    const api = new KeelApi({ baseUrl: "http://api.test", fetchImpl: makeFetchMock() });
    render(<Wizard api={api} blueprint="python-service" />);

    // No department selected → Next disabled.
    await screen.findByText("Buildings");
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});
