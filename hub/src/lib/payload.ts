/**
 * The payload builder (SPEC §4 / §3.5): turns a finished {@link WizardState} into
 * the exact `POST /api/initialize` body.
 *
 * Pure and total. `buildInitializePayload` returns `null` for any state that is
 * not submittable, so the property "output always has non-empty user_ids, a valid
 * project_name, and a known service_kind" holds by construction.
 */

import type { InitializePayload } from "./types";
import { canSubmit, type WizardState } from "./wizard";

/**
 * Build the request body, or `null` if `state` is not submittable.
 *
 * Trims free-text fields. Project name is taken verbatim (it must already match
 * the strict pattern for `canSubmit` to be true).
 */
export function buildInitializePayload(state: WizardState): InitializePayload | null {
  if (!canSubmit(state)) {
    return null;
  }
  // canSubmit guarantees departmentId is non-null and userIds is non-empty.
  return {
    project_name: state.projectName,
    blueprint: state.blueprint,
    department_id: state.departmentId as string,
    user_ids: [...state.userIds],
    service_kind: state.serviceKind,
    description: state.description.trim(),
    author: state.author.trim(),
  };
}
