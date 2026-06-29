import { describe, expect, it } from "vitest";
import { mergeSteps } from "./ProgressView";
import { WORKFLOW_STEPS } from "../lib/types";
import type { ProgressEvent } from "../lib/types";

describe("mergeSteps", () => {
  it("renders all 8 canonical steps even with no events", () => {
    const rows = mergeSteps([]);
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.key)).toEqual(WORKFLOW_STEPS.map((s) => s.key));
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("overlays event status onto the canonical step, last-write-wins", () => {
    const events: ProgressEvent[] = [
      { step: 4, key: "create_repo", title: "Create repo", status: "started", detail: "" },
      { step: 4, key: "create_repo", title: "Create repo", status: "done", detail: "ok" },
      { step: 6, key: "branches", title: "Branches", status: "skipped", detail: "exists" },
    ];
    const rows = mergeSteps(events);
    const create = rows.find((r) => r.key === "create_repo")!;
    expect(create.status).toBe("done");
    expect(create.detail).toBe("ok");
    expect(rows.find((r) => r.key === "branches")!.status).toBe("skipped");
    // Untouched steps stay pending.
    expect(rows.find((r) => r.key === "register")!.status).toBe("pending");
  });
});
