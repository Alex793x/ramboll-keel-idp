import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  canAdvance,
  canReach,
  canSubmit,
  initialWizardState,
  wizardReducer,
  type WizardAction,
  type WizardState,
} from "./wizard";
import { buildInitializePayload } from "./payload";

const VALID_NAME = "invoicing-api";

function ready(): WizardState {
  // A state that has everything needed to submit, parked on review.
  let s = initialWizardState("python-service");
  s = wizardReducer(s, { type: "select_department", departmentId: "buildings" });
  s = wizardReducer(s, { type: "next" }); // → users
  s = wizardReducer(s, { type: "toggle_user", userId: "u-anya" });
  s = wizardReducer(s, { type: "next" }); // → details
  s = wizardReducer(s, { type: "set_project_name", value: VALID_NAME });
  s = wizardReducer(s, { type: "set_author", value: "Anya" });
  s = wizardReducer(s, { type: "next" }); // → review
  return s;
}

describe("wizardReducer — basics", () => {
  it("starts on the department step with no selection", () => {
    const s = initialWizardState();
    expect(s.step).toBe("department");
    expect(s.departmentId).toBeNull();
    expect(s.userIds).toEqual([]);
    expect(canAdvance(s)).toBe(false);
  });

  it("advances only when each step's gate is met", () => {
    let s = initialWizardState();
    s = wizardReducer(s, { type: "next" }); // blocked: no dept
    expect(s.step).toBe("department");

    s = wizardReducer(s, { type: "select_department", departmentId: "buildings" });
    s = wizardReducer(s, { type: "next" });
    expect(s.step).toBe("users");

    s = wizardReducer(s, { type: "next" }); // blocked: no users
    expect(s.step).toBe("users");

    s = wizardReducer(s, { type: "toggle_user", userId: "u-anya" });
    s = wizardReducer(s, { type: "next" });
    expect(s.step).toBe("details");

    s = wizardReducer(s, { type: "next" }); // blocked: no valid name
    expect(s.step).toBe("details");

    s = wizardReducer(s, { type: "set_project_name", value: VALID_NAME });
    s = wizardReducer(s, { type: "next" });
    expect(s.step).toBe("review");
    expect(canSubmit(s)).toBe(true);
  });

  it("toggling a user adds then removes it", () => {
    let s = wizardReducer(initialWizardState(), {
      type: "select_department",
      departmentId: "buildings",
    });
    s = wizardReducer(s, { type: "toggle_user", userId: "u-anya" });
    expect(s.userIds).toEqual(["u-anya"]);
    s = wizardReducer(s, { type: "toggle_user", userId: "u-anya" });
    expect(s.userIds).toEqual([]);
  });

  it("reset returns to a fresh state but keeps blueprint", () => {
    const s = wizardReducer(ready(), { type: "reset" });
    expect(s.step).toBe("department");
    expect(s.blueprint).toBe("python-service");
    expect(s.userIds).toEqual([]);
  });

  it("re-selecting the same department keeps users", () => {
    let s = wizardReducer(initialWizardState(), {
      type: "select_department",
      departmentId: "buildings",
    });
    s = wizardReducer(s, { type: "toggle_user", userId: "u-anya" });
    s = wizardReducer(s, { type: "select_department", departmentId: "buildings" });
    expect(s.userIds).toEqual(["u-anya"]);
  });
});

describe("PROPERTY: selecting a new department resets the chosen users", () => {
  it("any non-empty selection is cleared when the department changes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userIds, deptA, deptB) => {
          fc.pre(deptA !== deptB);
          let s = initialWizardState();
          s = wizardReducer(s, { type: "select_department", departmentId: deptA });
          s = wizardReducer(s, { type: "set_users", userIds });
          expect(s.userIds.length).toBeGreaterThan(0);
          // Switch department → users must be empty.
          s = wizardReducer(s, { type: "select_department", departmentId: deptB });
          expect(s.userIds).toEqual([]);
        },
      ),
    );
  });
});

describe("PROPERTY: cannot reach submit without >=1 user and a valid project name", () => {
  it("canSubmit / canReach('review') imply users + valid name", () => {
    const arbState: fc.Arbitrary<WizardState> = fc.record({
      step: fc.constantFrom("department", "users", "details", "review" as const),
      departmentId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
      userIds: fc.array(fc.string({ minLength: 1 }), { maxLength: 4 }),
      projectName: fc.oneof(
        fc.string(),
        fc.constantFrom("invoicing-api", "abc", "x", "BAD", ""),
      ),
      serviceKind: fc.constantFrom("rest-api", "worker" as const),
      description: fc.string(),
      author: fc.string(),
      blueprint: fc.constantFrom("python-service", ""),
    });

    fc.assert(
      fc.property(arbState, (s) => {
        if (canSubmit(s)) {
          expect(s.userIds.length).toBeGreaterThanOrEqual(1);
          // A valid name is required.
          expect(/^[a-z][a-z0-9-]{2,40}$/.test(s.projectName)).toBe(true);
          expect(s.departmentId).not.toBeNull();
          // And a submittable state always yields a payload.
          expect(buildInitializePayload(s)).not.toBeNull();
        }
        // You can never *reach* review from an earlier step without the gates.
        if (s.step !== "review" && canReach(s, "review")) {
          expect(s.departmentId).not.toBeNull();
          expect(s.userIds.length).toBeGreaterThanOrEqual(1);
          expect(/^[a-z][a-z0-9-]{2,40}$/.test(s.projectName)).toBe(true);
        }
      }),
    );
  });

  it("driving the reducer can never land on review without prerequisites", () => {
    const action: fc.Arbitrary<WizardAction> = fc.oneof(
      fc.record({
        type: fc.constant("select_department" as const),
        departmentId: fc.constantFrom("buildings", "transport"),
      }),
      fc.record({
        type: fc.constant("toggle_user" as const),
        userId: fc.constantFrom("u-anya", "u-mads"),
      }),
      fc.record({
        type: fc.constant("set_project_name" as const),
        value: fc.oneof(fc.string(), fc.constant("invoicing-api")),
      }),
      fc.constant({ type: "next" as const }),
      fc.constant({ type: "back" as const }),
    );

    fc.assert(
      fc.property(fc.array(action, { maxLength: 30 }), (actions) => {
        let s = initialWizardState();
        for (const a of actions) {
          s = wizardReducer(s, a);
          if (s.step === "review") {
            // Whenever we're on review, the invariants must hold.
            expect(s.departmentId).not.toBeNull();
            expect(s.userIds.length).toBeGreaterThanOrEqual(1);
            expect(/^[a-z][a-z0-9-]{2,40}$/.test(s.projectName)).toBe(true);
          }
        }
      }),
    );
  });
});
