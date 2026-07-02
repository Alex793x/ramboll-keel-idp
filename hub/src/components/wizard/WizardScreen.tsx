/**
 * WizardScreen — the "Initialize a project" golden-path form: Identity,
 * Contributors and Service components cards on the left, the LiveBlueprint
 * panel on the right, plus the provisioning overlay.
 *
 * Ported EXACTLY from `Ramboll Developer Hub.dc.html` lines 396–488 (markup),
 * 1044–1116 (chip/row styles + repo naming) and 1214–1223 (init button +
 * hint). v3 (SPEC §13/§16): the chips render IDENTICALLY but from LIVE data
 * (`/api/departments`, `/api/users`, `/api/service-catalog`; the design
 * constants remain the pre-fetch fallback), unavailable languages get the
 * sidebar's dimmed SOON treatment, card 03 gains the repository-layout
 * selector (GBA-chip vocabulary), and Initialize drives the REAL engine via
 * `POST /api/initialize` — the overlay animates the returned 8 workflow
 * events at `EVENT_TICK_MS` before handing off to `CreatedScreen`.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { color, font } from '../../design/tokens';
import { getApi, type KeelApi } from '../../lib/api';
import { getSession } from '../../lib/auth';
import type {
  CatalogServiceType,
  Contributor,
  Department,
  InitializeResponse,
} from '../../lib/types';
import {
  DEFAULT_LAYOUT,
  EVENT_TICK_MS,
  GBAS,
  LAYOUT_HINTS,
  LAYOUT_OPTIONS,
  PEOPLE,
  buildInitializePayload,
  canInit,
  catalogEntry,
  defaultLang,
  designCatalog,
  initErrorMessage,
  initHint,
  initials,
  provRowsFromEvents,
  repoName,
  slugOf,
  type CreatedProject,
  type RepoLayout,
  type Service,
  type ServiceTypeId,
  type WizardDraft,
} from '../../lib/wizard-model';
import { LiveBlueprint } from './LiveBlueprint';
import { ProvisioningOverlay } from './ProvisioningOverlay';
import './wizard.css';

/** The slice of the API client the wizard consumes (injectable for tests). */
export type WizardApi = Pick<
  KeelApi,
  'listDepartments' | 'getUsers' | 'getServiceCatalog' | 'initialize'
>;

export interface WizardScreenProps {
  /** Called once, when the provisioning sequence finishes. */
  onCreated: (created: CreatedProject) => void;
  /** API client override for tests; defaults to the shared singleton. */
  api?: WizardApi;
}

/** Provisioning lifecycle: request in flight → animate the real events. */
type ProvState =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'animating'; response: InitializeResponse; step: number }
  | { phase: 'failed'; message: string };

/** Pre-fetch fallbacks so the design pixels render before/without the API. */
const FALLBACK_DEPARTMENTS: readonly Department[] = GBAS.map((name) => ({
  id: slugOf(name),
  name,
  team_slug: slugOf(name),
}));
const FALLBACK_USERS: readonly Contributor[] = PEOPLE.map((p) => ({
  id: slugOf(p.name),
  name: p.name,
  email: '',
  github_login: '',
  chapter: p.chapter,
}));

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

/** GBA-style selector chip (design line 427 vocabulary) — also the layout pills. */
function selectChipStyle(sel: boolean): CSSProperties {
  return {
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
    border: sel ? `1px solid ${color.cyan500}` : '1px solid rgba(155,173,197,0.22)',
    transition: 'all 140ms',
  };
}

/** The sidebar's SOON chip — mono 9px bordered (design line 82), verbatim. */
const soonChipStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 9,
  letterSpacing: '0.1em',
  color: color.dim,
  border: '1px solid rgba(105,132,168,0.4)',
  borderRadius: 4,
  padding: '2px 5px',
};

export function WizardScreen({ onCreated, api }: WizardScreenProps) {
  const client: WizardApi = useMemo(() => api ?? getApi(), [api]);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [gba, setGba] = useState<string | null>(null);
  const [contributors, setContributors] = useState<readonly string[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  const [layout, setLayout] = useState<RepoLayout>(DEFAULT_LAYOUT);

  // Live directory data (SPEC §16); design constants stand in until fetched.
  const [departments, setDepartments] = useState<readonly Department[]>(FALLBACK_DEPARTMENTS);
  const [users, setUsers] = useState<readonly Contributor[]>(FALLBACK_USERS);
  const [catalog, setCatalog] = useState<readonly CatalogServiceType[]>(designCatalog());

  const [prov, setProv] = useState<ProvState>({ phase: 'idle' });

  useEffect(() => {
    let cancelled = false;
    client
      .listDepartments()
      .then((d) => {
        if (!cancelled && d.length > 0) setDepartments(d);
      })
      .catch(() => {});
    client
      .getUsers()
      .then((u) => {
        if (!cancelled && u.length > 0) setUsers(u);
      })
      .catch(() => {});
    client
      .getServiceCatalog()
      .then((c) => {
        if (!cancelled && c.length > 0) setCatalog(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  const draft: WizardDraft = { name, gba, services };
  const slug = slugOf(name);
  const can = canInit(draft);
  const provisioning = prov.phase !== 'idle';
  const overlayRows = provRowsFromEvents(
    prov.phase === 'animating' ? prov.response.events : [],
  );
  const overlayStep =
    prov.phase === 'animating' ? prov.step : prov.phase === 'pending' ? 0 : -1;

  // Animate the returned events row by row (the response arrives complete).
  useEffect(() => {
    if (prov.phase !== 'animating') return undefined;
    const id = setInterval(() => {
      setProv((p) => (p.phase === 'animating' ? { ...p, step: p.step + 1 } : p));
    }, EVENT_TICK_MS);
    return () => clearInterval(id);
  }, [prov.phase]);

  // One tick past the last row (design cadence), hand off to `created`.
  useEffect(() => {
    if (prov.phase !== 'animating') return;
    if (prov.step <= provRowsFromEvents(prov.response.events).length) return;
    if (gba === null) return; // unreachable: provisioning only starts when canInit
    const outcome = prov.response.outcome;
    const repos = outcome.repos.length > 0 ? outcome.repos : [outcome.repo];
    setProv({ phase: 'idle' });
    onCreated({
      name,
      gba,
      services: [...services],
      contributors: [...contributors],
      repos,
    });
  }, [prov, name, gba, services, contributors, onCreated]);

  // v3: POST the real payload; the overlay opens immediately (pending phase).
  const startProvisioning = () => {
    if (!canInit({ name, gba, services }) || prov.phase !== 'idle') return;
    const payload = buildInitializePayload({
      name,
      description: desc,
      gba,
      contributors,
      services,
      layout,
      departments,
      users,
      catalog,
      author: getSession()?.name ?? 'Hub user',
    });
    setProv({ phase: 'pending' });
    client.initialize(payload).then(
      (response) =>
        setProv((p) =>
          p.phase === 'pending' ? { phase: 'animating', response, step: 0 } : p,
        ),
      (err: unknown) =>
        setProv((p) =>
          p.phase === 'pending' ? { phase: 'failed', message: initErrorMessage(err) } : p,
        ),
    );
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
                  {departments.map((d) => {
                    const sel = gba === d.name;
                    return (
                      <span
                        key={d.id}
                        onClick={() => setGba(sel ? null : d.name)}
                        style={selectChipStyle(sel)}
                      >
                        {d.name}
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
              {users.map((p) => {
                const sel = contributors.includes(p.name);
                return (
                  <span
                    key={p.id}
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
              {catalog.map((t) => (
                <div
                  key={t.id}
                  className="wz-type-card"
                  onClick={() =>
                    setServices((s) => [
                      ...s,
                      // The wire contract guarantees the 5 design type ids.
                      { type: t.id as ServiceTypeId, lang: defaultLang(t) },
                    ])
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
            <div style={{ marginBottom: services.length > 0 ? 18 : 0 }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: color.dim,
                  marginBottom: 8,
                }}
              >
                REPOSITORY LAYOUT
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {LAYOUT_OPTIONS.map((opt) => {
                  const sel = layout === opt.id;
                  return (
                    <span
                      key={opt.id}
                      onClick={() => setLayout(opt.id)}
                      style={selectChipStyle(sel)}
                    >
                      {opt.label}
                    </span>
                  );
                })}
              </div>
              <div
                style={{ fontFamily: font.mono, fontSize: 10.5, color: color.dim, marginTop: 8 }}
              >
                {LAYOUT_HINTS[layout]}
              </div>
            </div>
            {services.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {services.map((sv, i) => {
                  const t = catalogEntry(catalog, sv.type);
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
                          const picked = sv.lang === l.name;
                          if (!l.available) {
                            // Dimmed + SOON (the sidebar's established pattern), not selectable.
                            return (
                              <span
                                key={l.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '5px 12px',
                                  borderRadius: 9999,
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  cursor: 'default',
                                  userSelect: 'none',
                                  opacity: 0.75,
                                  background: 'rgba(204,234,251,0.06)',
                                  color: color.dim,
                                  border: '1px solid rgba(155,173,197,0.2)',
                                }}
                              >
                                {l.name}
                                <span style={soonChipStyle}>SOON</span>
                              </span>
                            );
                          }
                          return (
                            <span
                              key={l.id}
                              onClick={() =>
                                setServices((s) =>
                                  s.map((x, j) => (j === i ? { ...x, lang: l.name } : x)),
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
                              {l.name}
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
        <LiveBlueprint
          name={name}
          gba={gba}
          contributors={contributors}
          services={services}
          layout={layout}
        />
      </div>

      {provisioning && (
        <ProvisioningOverlay
          name={name}
          rows={overlayRows}
          provStep={overlayStep}
          error={prov.phase === 'failed' ? prov.message : null}
          onDismiss={() => setProv({ phase: 'idle' })}
        />
      )}
    </div>
  );
}
