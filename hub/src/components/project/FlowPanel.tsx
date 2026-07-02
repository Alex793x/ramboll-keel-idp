/**
 * FlowPanel — mounts the `BranchFlow` visualization (built by the flow agent;
 * frozen props `{ branches, onSelect? }` per SPEC §18.4) inside the Flow
 * glass card that `ProjectScreen` labels "THE FLOW".
 *
 * This is the ONLY module that imports from `./flow/` — screen tests mock
 * this panel so the dashboard suite never depends on BranchFlow internals.
 */
import type { OverviewBranch } from "../../lib/types";
import { BranchFlow } from "./flow/BranchFlow";

export function FlowPanel({ branches }: { branches: OverviewBranch[] }) {
  return <BranchFlow branches={branches} />;
}
