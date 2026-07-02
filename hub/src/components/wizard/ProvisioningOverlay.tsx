/**
 * ProvisioningOverlay — full-screen modal shown while the project is being
 * stood up. Purely presentational: the step counter lives in `WizardScreen`
 * (ticked every `PROV_TICK_MS`), this component just renders the six rows.
 *
 * Ported EXACTLY from `Ramboll Developer Hub.dc.html` lines 567–589 (markup)
 * and 1118–1139 (row styles).
 */
import { ICONS, PathIcon } from '../../design/icons';
import { color, font } from '../../design/tokens';
import { PROV_STEPS, blueprintName, provRowState } from '../../lib/wizard-model';

export interface ProvisioningOverlayProps {
  /** The draft project name ("Standing up {name}"). */
  name: string;
  /** Current step index; rows before it are done, the row at it is active. */
  provStep: number;
}

export function ProvisioningOverlay({ name, provStep }: ProvisioningOverlayProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(6,16,33,0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.3s ease both',
      }}
    >
      <div
        style={{
          width: 480,
          background: color.card,
          border: '1px solid rgba(102,193,243,0.25)',
          borderRadius: 16,
          padding: '34px 36px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          animation: 'popIn 0.4s cubic-bezier(0.2,0.7,0.2,1) both',
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: '0.24em',
            color: color.cyan300,
            marginBottom: 8,
          }}
        >
          PROVISIONING · RMB-NEW
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 24px', color: color.white }}>
          Standing up {blueprintName(name)}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {PROV_STEPS.map((st, i) => {
            const state = provRowState(provStep, i);
            const done = state === 'done';
            const active = state === 'active';
            return (
              <div key={st.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: done ? color.grass : 'transparent',
                    border: done
                      ? `1px solid ${color.grass}`
                      : active
                        ? `2px solid ${color.cyan500}`
                        : '1.5px solid rgba(155,173,197,0.3)',
                    borderTopColor: active ? 'transparent' : undefined,
                    animation: active ? 'spin 0.8s linear infinite' : 'none',
                    transition: 'background 200ms',
                  }}
                >
                  {done && (
                    <PathIcon d={ICONS.check} size={11} strokeWidth={3} stroke={color.pageBg} />
                  )}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: done ? color.body : active ? color.cyan100 : color.dim,
                    transition: 'color 200ms',
                  }}
                >
                  {st.label}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
                  {st.meta}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
