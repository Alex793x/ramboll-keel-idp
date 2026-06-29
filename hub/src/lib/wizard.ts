/**
 * The wizard state machine (SPEC §4) — a pure reducer over the four wizard
 * steps: department → users → details → review.
 *
 * Pure on purpose: the React route is a thin shell around this reducer, and the
 * invariants below are pinned by fast-check property tests:
 *   - selecting a *new* department resets the chosen users;
 *   - you cannot reach `submit` without ≥1 user and a valid project name.
 */

import type { ServiceKind } from "./types";
import { SERVICE_KINDS } from "./types";
import { validateProjectName } from "./validation";

/** The four ordered wizard steps. */
export const WIZARD_STEPS = ["department", "users", "details", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The data the wizard collects. */
export interface WizardState {
  step: WizardStep;
  departmentId: string | null;
  /** Selected user ids. Reset whenever the department changes. */
  userIds: string[];
  projectName: string;
  serviceKind: ServiceKind;
  description: string;
  author: string;
  blueprint: string;
}

/** A fresh wizard, parked on the department step. */
export function initialWizardState(blueprint = "python-service"): WizardState {
  return {
    step: "department",
    departmentId: null,
    userIds: [],
    projectName: "",
    serviceKind: "rest-api",
    description: "",
    author: "",
    blueprint,
  };
}

export type WizardAction =
  | { type: "select_department"; departmentId: string }
  | { type: "toggle_user"; userId: string }
  | { type: "set_users"; userIds: string[] }
  | { type: "set_project_name"; value: string }
  | { type: "set_service_kind"; value: ServiceKind }
  | { type: "set_description"; value: string }
  | { type: "set_author"; value: string }
  | { type: "set_blueprint"; value: string }
  | { type: "goto"; step: WizardStep }
  | { type: "next" }
  | { type: "back" }
  | { type: "reset"; blueprint?: string };

const STEP_INDEX: Record<WizardStep, number> = {
  department: 0,
  users: 1,
  details: 2,
  review: 3,
};

/** Is `kind` one of the known service kinds? */
export function isKnownServiceKind(kind: string): kind is ServiceKind {
  return (SERVICE_KINDS as readonly string[]).includes(kind);
}

/**
 * Can the wizard advance *out of* `state.step`? This is the gate that makes the
 * "cannot reach submit without users + valid name" invariant hold: `review` (the
 * submit step) is only reachable once details — and therefore name + users — pass.
 */
export function canAdvance(state: WizardState): boolean {
  switch (state.step) {
    case "department":
      return state.departmentId !== null;
    case "users":
      return state.userIds.length >= 1;
    case "details":
      return (
        validateProjectName(state.projectName) &&
        isKnownServiceKind(state.serviceKind) &&
        state.userIds.length >= 1 &&
        state.departmentId !== null
      );
    case "review":
      // Already at the final step; nothing to advance to.
      return false;
  }
}

/**
 * The single source of truth for "is this state submittable?". The submit button
 * and the payload builder both consult this. Re-checks every upstream invariant
 * so the state can never be submitted out of order.
 */
export function canSubmit(state: WizardState): boolean {
  return (
    state.step === "review" &&
    state.departmentId !== null &&
    state.userIds.length >= 1 &&
    validateProjectName(state.projectName) &&
    isKnownServiceKind(state.serviceKind) &&
    state.blueprint.length > 0
  );
}

function nextStep(step: WizardStep): WizardStep {
  const idx = STEP_INDEX[step];
  return WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)]!;
}

function prevStep(step: WizardStep): WizardStep {
  const idx = STEP_INDEX[step];
  return WIZARD_STEPS[Math.max(idx - 1, 0)]!;
}

/**
 * The reducer. Total and pure — every action returns a fully-valid state.
 *
 * Navigation is *guarded*: `next` only moves forward when `canAdvance` holds, and
 * a `goto` cannot jump to a step whose prerequisites are not met (so `review` is
 * unreachable without a department, ≥1 user, and a valid project name).
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "select_department": {
      if (action.departmentId === state.departmentId) {
        // Re-selecting the same department keeps the chosen users.
        return state;
      }
      // INVARIANT: choosing a *new* department resets the chosen users.
      return { ...state, departmentId: action.departmentId, userIds: [] };
    }

    case "toggle_user": {
      const has = state.userIds.includes(action.userId);
      const userIds = has
        ? state.userIds.filter((id) => id !== action.userId)
        : [...state.userIds, action.userId];
      return { ...state, userIds };
    }

    case "set_users":
      return { ...state, userIds: dedupe(action.userIds) };

    case "set_project_name":
      return { ...state, projectName: action.value };

    case "set_service_kind":
      return { ...state, serviceKind: action.value };

    case "set_description":
      return { ...state, description: action.value };

    case "set_author":
      return { ...state, author: action.value };

    case "set_blueprint":
      return { ...state, blueprint: action.value };

    case "goto": {
      if (canReach(state, action.step)) {
        return { ...state, step: action.step };
      }
      return state;
    }

    case "next":
      return canAdvance(state) ? { ...state, step: nextStep(state.step) } : state;

    case "back":
      return { ...state, step: prevStep(state.step) };

    case "reset":
      return initialWizardState(action.blueprint ?? state.blueprint);
  }
}

/**
 * Can we move the wizard to `target` from `state`? Backward moves are always
 * allowed; forward moves require every intermediate step's gate to pass.
 */
export function canReach(state: WizardState, target: WizardStep): boolean {
  const targetIdx = STEP_INDEX[target];
  const currentIdx = STEP_INDEX[state.step];
  if (targetIdx <= currentIdx) {
    return true; // going back (or staying) is always fine
  }
  // Walk forward from the current step, requiring each gate to pass.
  let cursor: WizardStep = state.step;
  while (STEP_INDEX[cursor] < targetIdx) {
    if (!canAdvance({ ...state, step: cursor })) {
      return false;
    }
    cursor = nextStep(cursor);
  }
  return true;
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}
