import type { WizardStep } from "../lib/wizard";
import { WIZARD_STEPS } from "../lib/wizard";

const LABELS: Record<WizardStep, string> = {
  department: "Department",
  users: "Users",
  details: "Details",
  review: "Review",
};

/** The pill row at the top of the wizard showing progress through the 4 steps. */
export function StepBar({ current }: { current: WizardStep }) {
  const currentIdx = WIZARD_STEPS.indexOf(current);
  return (
    <ol className="rb-steps" aria-label="Wizard steps">
      {WIZARD_STEPS.map((step, i) => {
        const cls =
          i === currentIdx
            ? "rb-step rb-step--active"
            : i < currentIdx
              ? "rb-step rb-step--done"
              : "rb-step";
        return (
          <li key={step} className={cls} aria-current={i === currentIdx ? "step" : undefined}>
            <span className="rb-step__num">{i + 1}</span>
            {LABELS[step]}
          </li>
        );
      })}
    </ol>
  );
}
