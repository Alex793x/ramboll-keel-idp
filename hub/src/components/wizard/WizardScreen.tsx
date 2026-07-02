/**
 * WizardScreen — the "Initialize a project" golden-path form: Identity,
 * Contributors and Service components cards on the left, the LiveBlueprint
 * panel on the right, plus the provisioning overlay and its 750ms step timer.
 *
 * Ported EXACTLY from `Ramboll Developer Hub.dc.html` lines 396–488 (markup),
 * 1044–1116 (chip/row styles + repo naming), 1214–1223 (init button + hint)
 * and 689–703 (`startProvisioning` timing). When provisioning completes the
 * component reports the created project via `onCreated`; the `/new` route
 * swaps to `CreatedScreen`.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { color, font } from '../../design/tokens';
import {
  GBAS,
  PEOPLE,
  PROV_STEPS,
  PROV_TICK_MS,
  TYPES,
  canInit,
  initHint,
  initials,
  repoName,
  slugOf,
  typeOf,
  type CreatedProject,
  type Service,
  type WizardDraft,
} from '../../lib/wizard-model';
import { LiveBlueprint } from './LiveBlueprint';
import { ProvisioningOverlay } from './ProvisioningOverlay';
import './wizard.css';

export interface WizardScreenProps {
  /** Called once, when the provisioning sequence finishes. */
  onCreated: (created: CreatedProject) => void;
}

/** Shared card chrome for the three numbered sections (design lines 407/433/448). */
const cardStyle: CSSProperties = {
  background: color.card,
  border: '1px solid rgba(155,173,197,0.14)',
  borderRadius: 12,
  padding: 24,
};

/** Numbered chip + h3 header row (design lines 408–411 etc.). */
function CardHeader({ num, title, marginBottom }: { num: string; title: string; marginBottom: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom }}>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          fontWeight: 600,
          color: color.cyan300,
          border: '1px solid rgba(102,193,243,0.4)',
          borderRadius: 6,
          padding: '3px 8px',
        }}
      >
        {num}
      </span>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: color.white }}>{title}</h3>
    </div>
  );
}

/** Text input styling shared by name + description (design lines 415/420). */
const inputStyle: CSSProperties = {
  fontFamily: font.sans,
  fontSize: 15,
  padding: '12px 14px',
  border: '1px solid rgba(155,173,197,0.22)',
  borderRadius: 8,
  background: color.pageBg,
  color: color.body,
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: color.cyan100,
};

export function WizardScreen({ onCreated }: WizardScreenProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [gba, setGba] = useState<string | null>(null);
  const [contributors, setContributors] = useState<readonly string[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  /** -1 = not provisioning (design `state.provStep`). */
  const [provStep, setProvStep] = useState(-1);

  const draft: WizardDraft = { name, gba, services };
  const slug = slugOf(name);
  const can = canInit(draft);
  const provisioning = provStep >= 0;

  // Design lines 693–702: advance one step every 750ms while provisioning.
  useEffect(() => {
    if (!provisioning) return undefined;
    const id = setInterval(() => {
      setProvStep((s) => s + 1);
    }, PROV_TICK_MS);
    return () => clearInterval(id);
  }, [provisioning]);

  // Design lines 696–698: one tick past the last step, hand off to `created`.
  useEffect(() => {
    if (provStep !== PROV_STEPS.length + 1) return;
    if (gba === null) return; // unreachable: provisioning only starts when canInit
    setProvStep(-1);
    onCreated({ name, gba, services: [...services], contributors: [...contributors] });
  }, [provStep, name, gba, services, contributors, onCreated]);

  // Design lines 689–692: no-op unless name, GBA and ≥1 service are present.
  const startProvisioning = () => {
    if (!canInit({ name, gba, services })) return;
    setProvStep(0);
  };

  return (
    <div
      style={{
        padding: '36px 40px 80px',
        maxWidth: 1240,
        margin: '0 auto',
        animation: 'fadeUp 0.5s cubic-bezier(0.2,0.7,0.2,1) both',
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: '0.2em',
          color: color.cyan300,
          marginBottom: 10,
        }}
      >
        GOLDEN PATH · NEW PROJECT
      </div>
      <h1
        style={{
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 4px',
          color: color.white,
        }}
      >
        Initialize a project
      </h1>
      <p style={{ fontSize: 14, color: color.muted, margin: '0 0 32px', maxWidth: '62ch' }}>
        Every project ships with best-in-class building blocks: standardized architecture,
        approved libraries, CI &amp; validation pipelines via GitHub Actions.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap: 28,
          alignItems: 'start',
        }}
      >
        {/* Left: form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={cardStyle}>
            <CardHeader num="01" title="Identity" marginBottom={18} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Project name</label>
                <input
                  className="wz-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. District Heating Optimizer"
                  style={inputStyle}
                />
                <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.dim }}>
                  repo prefix → <span style={{ color: color.cyan300 }}>{slug}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Description</label>
                <input
                  className="wz-input"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="One line on what this project does"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Global Business Area</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {GBAS.map((g) => {
                    const sel = gba === g;
                    return (
                      <span
                        key={g}
                        onClick={() => setGba(sel ? null : g)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '8px 16px',
                          borderRadius: 9999,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          userSelect: 'none',
                          background: sel ? color.cyan500 : 'rgba(204,234,251,0.06)',
                          color: sel ? color.white : color.muted,
                          border: sel
                            ? `1px solid ${color.cyan500}`
                            : '1px solid rgba(155,173,197,0.22)',
                          transition: 'all 140ms',
                        }}
                      >
                        {g}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <CardHeader num="02" title="Contributors" marginBottom={6} />
            <p style={{ fontSize: 12.5, color: color.dim, margin: '0 0 16px' }}>
              You are the owner. Pick the main contributors — they get repo access and
              CODEOWNERS entries.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PEOPLE.map((p) => {
                const sel = contributors.includes(p.name);
                return (
                  <span
                    key={p.name}
                    onClick={() =>
                      setContributors((cs) =>
                        sel ? cs.filter((x) => x !== p.name) : [...cs, p.name],
                      )
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 14px 6px 6px',
                      borderRadius: 9999,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: sel ? 'rgba(0,152,235,0.16)' : 'rgba(204,234,251,0.05)',
                      color: sel ? color.cyan100 : color.muted,
                      border: sel
                        ? '1px solid rgba(0,152,235,0.7)'
                        : '1px solid rgba(155,173,197,0.2)',
                      transition: 'all 140ms',
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9.5,
                        fontWeight: 800,
                        background: sel ? color.cyan500 : 'rgba(155,173,197,0.18)',
                        color: sel ? '#fff' : color.muted,
                      }}
                    >
                      {initials(p.name)}
                    </span>
                    {p.name}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={cardStyle}>
            <CardHeader num="03" title="Service components" marginBottom={6} />
            <p style={{ fontSize: 12.5, color: color.dim, margin: '0 0 16px' }}>
              Add the building blocks this project starts with. Each becomes a repo
              scaffolded from an approved Ramboll template.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 10,
                marginBottom: 18,
              }}
            >
              {TYPES.map((t) => (
                <div
                  key={t.id}
                  className="wz-type-card"
                  onClick={() =>
                    setServices((s) => [...s, { type: t.id, lang: t.langs[0] }])
                  }
                  style={{
                    border: '1px dashed rgba(155,173,197,0.3)',
                    borderRadius: 10,
                    padding: '14px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 7,
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'border-color 150ms, background 150ms',
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      fontWeight: 600,
                      color: color.cyan300,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {t.tag}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: color.body,
                      lineHeight: 1.2,
                    }}
                  >
                    {t.label}
                  </span>
                  <span style={{ fontSize: 15, color: color.dim, lineHeight: 1 }}>+</span>
                </div>
              ))}
            </div>
            {services.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {services.map((sv, i) => {
                  const t = typeOf(sv.type);
                  return (
                    <div
                      key={`${sv.type}-${i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        background: color.pageBg,
                        border: '1px solid rgba(155,173,197,0.18)',
                        borderRadius: 10,
                        padding: '12px 16px',
                        animation: 'popIn 0.35s cubic-bezier(0.2,0.7,0.2,1) both',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: color.pageBg,
                          background: color.cyan300,
                          borderRadius: 6,
                          padding: '5px 7px',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {t.tag}
                      </span>
                      <div style={{ minWidth: 130 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: color.white }}>
                          {t.label}
                        </div>
                        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                          {repoName(slug, services, i)}
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          gap: 6,
                          justifyContent: 'flex-end',
                          flexWrap: 'wrap',
                        }}
                      >
                        {t.langs.map((l) => {
                          const picked = sv.lang === l;
                          return (
                            <span
                              key={l}
                              onClick={() =>
                                setServices((s) =>
                                  s.map((x, j) => (j === i ? { ...x, lang: l } : x)),
                                )
                              }
                              style={{
                                display: 'inline-flex',
                                padding: '5px 12px',
                                borderRadius: 9999,
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: 'pointer',
                                userSelect: 'none',
                                background: picked ? color.cyan500 : 'rgba(204,234,251,0.06)',
                                color: picked ? '#fff' : color.muted,
                                border: picked
                                  ? `1px solid ${color.cyan500}`
                                  : '1px solid rgba(155,173,197,0.2)',
                                transition: 'all 130ms',
                              }}
                            >
                              {l}
                            </span>
                          );
                        })}
                      </div>
                      <span
                        className="wz-remove"
                        onClick={() => setServices((s) => s.filter((_, j) => j !== i))}
                        style={{
                          color: color.dim,
                          cursor: 'pointer',
                          fontSize: 16,
                          lineHeight: 1,
                          padding: '4px 6px',
                          borderRadius: 6,
                          transition: 'color 120ms',
                        }}
                      >
                        ✕
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              className="wz-init"
              disabled={!can}
              onClick={startProvisioning}
              style={{
                padding: '14px 32px',
                borderRadius: 9999,
                border: 'none',
                background: can ? color.cyan500 : 'rgba(155,173,197,0.15)',
                color: can ? '#fff' : color.dim,
                fontFamily: font.sans,
                fontSize: 15,
                fontWeight: 800,
                cursor: can ? 'pointer' : 'default',
                boxShadow: can ? '0 8px 28px rgba(0,152,235,0.35)' : 'none',
                transition: 'all 200ms',
              }}
            >
              Initialize project
            </button>
            <span style={{ fontSize: 12.5, color: color.dim }}>{initHint(draft)}</span>
          </div>
        </div>

        {/* Right: live blueprint */}
        <LiveBlueprint name={name} gba={gba} contributors={contributors} services={services} />
      </div>

      {provisioning && <ProvisioningOverlay name={name} provStep={provStep} />}
    </div>
  );
}
