import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildInitializePayload } from "./payload";
import {
  initialWizardState,
  wizardReducer,
  type WizardState,
} from "./wizard";
import { SERVICE_KINDS } from "./types";

function submittable(overrides: Partial<WizardState> = {}): WizardState {
  let s = initialWizardState("python-service");
  s = wizardReducer(s, { type: "select_department", departmentId: "buildings" });
  s = wizardReducer(s, { type: "next" });
  s = wizardReducer(s, { type: "toggle_user", userId: "u-anya" });
  s = wizardReducer(s, { type: "next" });
  s = wizardReducer(s, { type: "set_project_name", value: "invoicing-api" });
  s = wizardReducer(s, { type: "next" });
  return { ...s, ...overrides };
}

describe("buildInitializePayload", () => {
  it("returns null for an incomplete state", () => {
    expect(buildInitializePayload(initialWizardState())).toBeNull();
  });

  it("builds the exact §3.5 body for a finished wizard", () => {
    const payload = buildInitializePayload(
      submittable({ description: "  An API  ", author: "  Anya  " }),
    );
    expect(payload).toEqual({
      project_name: "invoicing-api",
      blueprint: "python-service",
      department_id: "buildings",
      user_ids: ["u-anya"],
      service_kind: "rest-api",
      description: "An API", // trimmed
      author: "Anya", // trimmed
    });
  });

  it("does not alias the wizard's user array", () => {
    const state = submittable();
    const payload = buildInitializePayload(state)!;
    payload.user_ids.push("mutation");
    expect(state.userIds).toEqual(["u-anya"]);
  });

  describe("PROPERTY: a non-null payload is always well-formed", () => {
    it("non-empty user_ids, valid project_name, known service_kind", () => {
      const arbState: fc.Arbitrary<WizardState> = fc.record({
        step: fc.constantFrom("department", "users", "details", "review" as const),
        departmentId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
        userIds: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
        projectName: fc.oneof(
          fc.string(),
          fc.constantFrom("invoicing-api", "abc", "data-pipeline-9"),
        ),
        serviceKind: fc.constantFrom(...SERVICE_KINDS),
        description: fc.string(),
        author: fc.string(),
        blueprint: fc.constantFrom("python-service", "rust-service", ""),
      });

      fc.assert(
        fc.property(arbState, (s) => {
          const payload = buildInitializePayload(s);
          if (payload !== null) {
            expect(payload.user_ids.length).toBeGreaterThanOrEqual(1);
            expect(/^[a-z][a-z0-9-]{2,40}$/.test(payload.project_name)).toBe(true);
            expect(SERVICE_KINDS).toContain(payload.service_kind);
            expect(payload.department_id.length).toBeGreaterThan(0);
            expect(payload.blueprint.length).toBeGreaterThan(0);
          }
        }),
      );
    });
  });
});
