/**
 * The project wizard (SPEC §4). A thin React shell around the pure
 * {@link wizardReducer} state machine + {@link buildInitializePayload}.
 *
 * Steps: (1) Department → (2) Users → (3) Details → (4) Review & submit → a
 * progress view. The API client is injectable so the integration test can mount
 * this component with a mocked fetch and assert the exact submitted payload.
 */
import { useEffect, useReducer, useState } from "react";
import type { KeelApi } from "../lib/api";
import { getApi } from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import {
  canAdvance,
  canSubmit,
  initialWizardState,
  wizardReducer,
} from "../lib/wizard";
import { buildInitializePayload } from "../lib/payload";
import {
  PROJECT_NAME_HINT,
  validateProjectName,
} from "../lib/validation";
import {
  SERVICE_KINDS,
  SERVICE_KIND_LABELS,
  type Department,
  type InitOutcome,
  type ProgressEvent,
  type User,
} from "../lib/types";
import { StepBar } from "./StepBar";
import { ProgressView } from "./ProgressView";

export interface WizardProps {
  /** Injectable API client (tests pass a client wired to a mocked fetch). */
  api?: KeelApi;
  /** Initial blueprint (from the catalog CTA). */
  blueprint?: string;
}

type SubmitState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "done"; events: ProgressEvent[]; outcome: InitOutcome }
  | { phase: "error"; message: string };

export function Wizard({ api, blueprint = "python-service" }: WizardProps) {
  const client = api ?? getApi();
  // Guard against an explicitly-passed empty/blank blueprint (e.g. `/new?blueprint=`),
  // which would otherwise leave the wizard permanently unsubmittable with no feedback.
  const safeBlueprint = blueprint.trim() || "python-service";
  const [state, dispatch] = useReducer(
    wizardReducer,
    safeBlueprint,
    initialWizardState,
  );
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });

  // Keep the reducer's blueprint in sync if the prop changes (catalog CTA).
  useEffect(() => {
    dispatch({ type: "set_blueprint", value: safeBlueprint });
  }, [safeBlueprint]);

  async function handleSubmit() {
    const payload = buildInitializePayload(state);
    if (!payload) {
      return;
    }
    setSubmit({ phase: "submitting" });
    try {
      const res = await client.initialize(payload);
      setSubmit({ phase: "done", events: res.events, outcome: res.outcome });
    } catch (err) {
      setSubmit({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (submit.phase === "done") {
    return (
      <div className="rb-card">
        <ProgressView events={submit.events} outcome={submit.outcome} />
        <div className="rb-wizard__actions">
          <button
            type="button"
            className="rb-btn rb-btn--secondary"
            onClick={() => {
              setSubmit({ phase: "idle" });
              dispatch({ type: "reset", blueprint: safeBlueprint });
            }}
          >
            Start another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rb-card">
      <StepBar current={state.step} />

      {state.step === "department" ? (
        <DepartmentStep
          client={client}
          selectedId={state.departmentId}
          onSelect={(id) => dispatch({ type: "select_department", departmentId: id })}
        />
      ) : null}

      {state.step === "users" && state.departmentId ? (
        <UsersStep
          client={client}
          departmentId={state.departmentId}
          selected={state.userIds}
          onToggle={(id) => dispatch({ type: "toggle_user", userId: id })}
        />
      ) : null}

      {state.step === "details" ? (
        <DetailsStep
          projectName={state.projectName}
          serviceKind={state.serviceKind}
          description={state.description}
          author={state.author}
          onChange={dispatch}
        />
      ) : null}

      {state.step === "review" ? <ReviewStep state={state} client={client} /> : null}

      {submit.phase === "error" ? (
        <p className="rb-error" role="alert">
          Initialization failed: {submit.message}
        </p>
      ) : null}

      <div className="rb-wizard__actions">
        <button
          type="button"
          className="rb-btn rb-btn--secondary"
          onClick={() => dispatch({ type: "back" })}
          disabled={state.step === "department"}
        >
          ← Back
        </button>

        {state.step === "review" ? (
          <button
            type="button"
            className="rb-btn rb-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit(state) || submit.phase === "submitting"}
          >
            {submit.phase === "submitting" ? "Initializing…" : "Initialize project →"}
          </button>
        ) : (
          <button
            type="button"
            className="rb-btn rb-btn--primary"
            onClick={() => dispatch({ type: "next" })}
            disabled={!canAdvance(state)}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Department ───────────────────────────────────────────────────────

function DepartmentStep({
  client,
  selectedId,
  onSelect,
}: {
  client: KeelApi;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, loading, error } = useAsync<Department[]>(
    () => client.listDepartments(),
    [],
  );
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend>
        <h2>Select a department</h2>
      </legend>
      {loading ? <p className="rb-muted">Loading departments…</p> : null}
      {error ? (
        <p className="rb-error" role="alert">
          {error.message}
        </p>
      ) : null}
      {data?.map((dept) => {
        const selected = dept.id === selectedId;
        return (
          <label
            key={dept.id}
            className={selected ? "rb-option rb-option--selected" : "rb-option"}
          >
            <input
              type="radio"
              name="department"
              checked={selected}
              onChange={() => onSelect(dept.id)}
            />
            <span className="rb-stack">
              <strong>{dept.name}</strong>
              <span className="rb-option__meta">team @{dept.team_slug}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ── Step 2: Users ────────────────────────────────────────────────────────────

function UsersStep({
  client,
  departmentId,
  selected,
  onToggle,
}: {
  client: KeelApi;
  departmentId: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { data, loading, error } = useAsync<User[]>(
    () => client.listUsers(departmentId),
    [departmentId],
  );
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend>
        <h2>Select owners</h2>
      </legend>
      <p className="rb-hint">
        Selected users become CODEOWNERS / reviewers. Pick at least one.
      </p>
      {loading ? <p className="rb-muted">Loading users…</p> : null}
      {error ? (
        <p className="rb-error" role="alert">
          {error.message}
        </p>
      ) : null}
      {data?.map((user) => {
        const checked = selected.includes(user.id);
        return (
          <label
            key={user.id}
            className={checked ? "rb-option rb-option--selected" : "rb-option"}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(user.id)}
            />
            <span className="rb-stack">
              <strong>{user.name}</strong>
              <span className="rb-option__meta">
                {user.email} · @{user.github_login}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ── Step 3: Details ──────────────────────────────────────────────────────────

function DetailsStep({
  projectName,
  serviceKind,
  description,
  author,
  onChange,
}: {
  projectName: string;
  serviceKind: (typeof SERVICE_KINDS)[number];
  description: string;
  author: string;
  onChange: React.Dispatch<Parameters<typeof wizardReducer>[1]>;
}) {
  const nameValid = projectName === "" || validateProjectName(projectName);
  return (
    <div>
      <h2>Project details</h2>
      <div className="rb-field">
        <label htmlFor="project_name">Project name</label>
        <input
          id="project_name"
          value={projectName}
          aria-invalid={!nameValid}
          aria-describedby="project_name_hint"
          placeholder="invoicing-api"
          onChange={(e) =>
            onChange({ type: "set_project_name", value: e.target.value })
          }
        />
        <span id="project_name_hint" className={nameValid ? "rb-hint" : "rb-error"}>
          {PROJECT_NAME_HINT}
        </span>
      </div>

      <div className="rb-field">
        <label htmlFor="service_kind">Service kind</label>
        <select
          id="service_kind"
          value={serviceKind}
          onChange={(e) =>
            onChange({
              type: "set_service_kind",
              value: e.target.value as (typeof SERVICE_KINDS)[number],
            })
          }
        >
          {SERVICE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SERVICE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      <div className="rb-field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          rows={3}
          value={description}
          placeholder="What does this service do?"
          onChange={(e) =>
            onChange({ type: "set_description", value: e.target.value })
          }
        />
      </div>

      <div className="rb-field">
        <label htmlFor="author">Author</label>
        <input
          id="author"
          value={author}
          placeholder="Your name"
          onChange={(e) => onChange({ type: "set_author", value: e.target.value })}
        />
      </div>
    </div>
  );
}

// ── Step 4: Review ───────────────────────────────────────────────────────────

function ReviewStep({
  state,
  client,
}: {
  state: Parameters<typeof buildInitializePayload>[0];
  client: KeelApi;
}) {
  // Resolve names for a friendly summary (best-effort; falls back to ids).
  const depts = useAsync<Department[]>(() => client.listDepartments(), []);
  const users = useAsync<User[]>(
    () => (state.departmentId ? client.listUsers(state.departmentId) : Promise.resolve([])),
    [state.departmentId],
  );
  const deptName =
    depts.data?.find((d) => d.id === state.departmentId)?.name ?? state.departmentId;
  const userNames = (users.data ?? [])
    .filter((u) => state.userIds.includes(u.id))
    .map((u) => u.name);

  return (
    <div>
      <h2>Review &amp; submit</h2>
      <table className="rb-table">
        <tbody>
          <tr>
            <th>Project name</th>
            <td className="rb-mono">{state.projectName}</td>
          </tr>
          <tr>
            <th>Blueprint</th>
            <td>{state.blueprint}</td>
          </tr>
          <tr>
            <th>Department</th>
            <td>{deptName}</td>
          </tr>
          <tr>
            <th>Owners</th>
            <td>{userNames.length ? userNames.join(", ") : `${state.userIds.length} selected`}</td>
          </tr>
          <tr>
            <th>Service kind</th>
            <td>{SERVICE_KIND_LABELS[state.serviceKind]}</td>
          </tr>
          <tr>
            <th>Description</th>
            <td>{state.description || <span className="rb-muted">—</span>}</td>
          </tr>
          <tr>
            <th>Author</th>
            <td>{state.author || <span className="rb-muted">—</span>}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
