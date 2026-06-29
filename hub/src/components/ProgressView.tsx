/**
 * The progress view shown after submit: the 8 workflow steps (merged with the
 * events the API returned) + the resulting repo URL / branches.
 */
import type { InitOutcome, ProgressEvent, StepStatus } from "../lib/types";
import { WORKFLOW_STEPS } from "../lib/types";

export interface StepRow {
  key: string;
  title: string;
  status: StepStatus | "pending";
  detail: string;
}

/**
 * Merge the canonical 8 steps with the events the API emitted. Pure + exported so
 * it can be unit-tested: any step without an event is rendered as "pending".
 */
export function mergeSteps(events: ProgressEvent[]): StepRow[] {
  const byKey = new Map<string, ProgressEvent>();
  for (const ev of events) {
    // Last event for a key wins (e.g. started → done).
    byKey.set(ev.key, ev);
  }
  return WORKFLOW_STEPS.map(({ key, title }) => {
    const ev = byKey.get(key);
    return {
      key,
      title: ev?.title || title,
      status: ev?.status ?? "pending",
      detail: ev?.detail ?? "",
    };
  });
}

const BADGE_CLASS: Record<StepRow["status"], string> = {
  done: "rb-badge rb-badge--done",
  started: "rb-badge rb-badge--started",
  skipped: "rb-badge rb-badge--skipped",
  error: "rb-badge rb-badge--error",
  pending: "rb-badge rb-badge--pending",
};

export function ProgressView({
  events,
  outcome,
}: {
  events: ProgressEvent[];
  outcome: InitOutcome | null;
}) {
  const rows = mergeSteps(events);
  return (
    <div>
      <h2>Initializing your project</h2>
      <ol className="rb-progress">
        {rows.map((row, i) => (
          <li key={row.key} className="rb-progress__item">
            <span className="rb-step__num">{i + 1}</span>
            <span className={BADGE_CLASS[row.status]}>{row.status}</span>
            <span>
              <strong>{row.title}</strong>
              {row.detail ? <span className="rb-muted"> — {row.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {outcome ? (
        <div className="rb-card" style={{ marginTop: 24 }}>
          <h3>Repository ready</h3>
          <p className="rb-stack">
            <a href={outcome.repo.html_url} target="_blank" rel="noreferrer">
              {outcome.repo.owner}/{outcome.repo.name}
            </a>
            <span className="rb-muted">
              Default branch <span className="rb-mono">{outcome.repo.default_branch}</span>{" "}
              · Branches <span className="rb-mono">{outcome.repo.branches.join(", ")}</span>
            </span>
            <span className="rb-muted">
              Docs at <span className="rb-mono">{outcome.docs_path}</span> · Blueprint
              v{outcome.blueprint_version}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
