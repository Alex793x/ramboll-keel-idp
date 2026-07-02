/**
 * AddServicePopover — "add a service to a running project" (SPEC §19.5).
 *
 * A ghost `+ Add service` chip appended to the header's service-chip row
 * opens an anchored glass popover with three compact steps in one card:
 * the 5 type cards (live `/api/service-catalog`) → language chips
 * (unavailable ⇒ dimmed + SOON, disabled) → mono name input prefilled with
 * the next free default for the picked type. Submitting POSTs
 * `POST /api/projects/:id/services`; the returned ProgressEvents render as a
 * compact inline strip (the provisioning-overlay idiom, small), then the
 * popover closes and calls `onAdded` so the screen refetches the overview.
 * `materialized:false` (seeded demo projects) first shows the mono
 * `catalog-only · demo project` note for {@link CATALOG_NOTE_MS}.
 * API errors render inline (clay) and leave the form editable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { color, font } from "../../design/tokens";
import { useAsync } from "../../hooks/useAsync";
import { getApi, type KeelApi } from "../../lib/api";
import {
  SERVICE_NAME_RE,
  type AddServiceResponse,
  type CatalogLang,
  type CatalogServiceType,
  type OverviewService,
  type StepStatus,
} from "../../lib/types";

/** How long the `catalog-only · demo project` note stays before closing. */
export const CATALOG_NOTE_MS = 2000;
/** How long the materialized progress strip stays before closing. */
export const CLOSE_AFTER_SUCCESS_MS = 900;

/** The slice of the API client the popover consumes (injectable for tests). */
export type AddServiceApi = Pick<
  KeelApi,
  "getServiceCatalog" | "addProjectService"
>;

/* ── Pure naming logic (SPEC §19.1 defaults, mirrored for the suggestion) ──── */

/** `services/api` → `api` (monolith dirs are `services/{name}`; multi-repo bare). */
function dirBase(dir: string): string {
  const segments = dir.split("/").filter((s) => s !== "");
  return segments[segments.length - 1] ?? dir;
}

/** Every identifier a new service may not collide with: dir basenames + names. */
export function takenServiceNames(
  services: readonly OverviewService[],
): Set<string> {
  const taken = new Set<string>();
  for (const s of services) {
    taken.add(dirBase(s.dir));
    taken.add(s.name);
  }
  return taken;
}

/** Next free default for a type: `{tag}` if free, else `{tag}-1`, `{tag}-2`, … */
export function suggestServiceName(
  typeId: string,
  services: readonly OverviewService[],
): string {
  const taken = takenServiceNames(services);
  if (!taken.has(typeId)) return typeId;
  for (let n = 1; ; n += 1) {
    const candidate = `${typeId}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** `null` when the name is valid and free; otherwise the inline error copy. */
export function serviceNameError(
  name: string,
  services: readonly OverviewService[],
): string | null {
  if (!SERVICE_NAME_RE.test(name)) return "must match [a-z][a-z0-9-]{1,29}";
  if (takenServiceNames(services).has(name)) return "name already taken";
  return null;
}

/* ── Trigger chip + anchored card ──────────────────────────────────────────── */

export interface AddServicePopoverProps {
  /** The project id (catalog slug / `RMB-*`) the service is added to. */
  projectId: string;
  /** The project's current services — suggestion + collision input. */
  services: readonly OverviewService[];
  /** API client override for tests; defaults to the shared singleton. */
  api?: AddServiceApi;
  /** Called after a successful add, right before the popover closes. */
  onAdded?: () => void;
}

export function AddServicePopover({
  projectId,
  services,
  api,
  onAdded,
}: AddServicePopoverProps) {
  const client = useMemo(() => api ?? getApi(), [api]);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap-lite, half two: return focus to the trigger on close.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={triggerRef}
        type="button"
        className="prj-addsvc-chip"
        style={chipStyle}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        + Add service
      </button>
      {open && (
        <PopoverCard
          projectId={projectId}
          services={services}
          api={client}
          onClose={close}
          onAdded={onAdded ?? noop}
        />
      )}
    </span>
  );
}

function noop(): void {}

/** Submit lifecycle: editable form → request in flight → returned events. */
type SubmitState =
  | { phase: "form"; error: string | null }
  | { phase: "pending" }
  | { phase: "done"; response: AddServiceResponse };

function PopoverCard({
  projectId,
  services,
  api,
  onClose,
  onAdded,
}: {
  projectId: string;
  services: readonly OverviewService[];
  api: AddServiceApi;
  onClose: () => void;
  onAdded: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const catalog = useAsync<CatalogServiceType[]>(
    () => api.getServiceCatalog(),
    [api],
  );

  const [picked, setPicked] = useState<CatalogServiceType | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [state, setState] = useState<SubmitState>({
    phase: "form",
    error: null,
  });

  // Esc + click-away close. The wrapper span holds both the chip and the
  // card, so a click on the trigger toggles instead of close-then-reopen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const host = cardRef.current?.parentElement;
      if (host && e.target instanceof Node && !host.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // Focus trap-lite, half one: the first type card once the catalog is in.
  useEffect(() => {
    if (catalog.data) {
      cardRef.current
        ?.querySelector<HTMLButtonElement>(".prj-addsvc-type")
        ?.focus();
    }
  }, [catalog.data]);

  // Success: hold the strip (and the catalog-only note) briefly, then hand
  // control back — `onAdded` triggers the parent's overview refetch.
  useEffect(() => {
    if (state.phase !== "done") return undefined;
    const holdMs = state.response.materialized
      ? CLOSE_AFTER_SUCCESS_MS
      : CATALOG_NOTE_MS;
    const id = setTimeout(() => {
      onAdded();
      onClose();
    }, holdMs);
    return () => clearTimeout(id);
  }, [state, onAdded, onClose]);

  const formActive = state.phase === "form";
  const nameErr = picked !== null ? serviceNameError(name, services) : null;
  const canAdd =
    formActive && picked !== null && lang !== null && nameErr === null;

  const pickType = (t: CatalogServiceType) => {
    setPicked(t);
    setLang(t.langs.find((l) => l.available)?.id ?? null);
    setName(suggestServiceName(t.id, services));
    setState({ phase: "form", error: null });
  };

  const submit = () => {
    if (!canAdd || picked === null || lang === null) return;
    setState({ phase: "pending" });
    api.addProjectService(projectId, { type: picked.id, lang, name }).then(
      (response) => setState({ phase: "done", response }),
      (err: unknown) =>
        setState({
          phase: "form",
          error:
            err instanceof Error && err.message !== ""
              ? err.message
              : "Could not add the service.",
        }),
    );
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Add a service component"
      style={popCardStyle}
    >
      <div style={sectionLabelStyle}>ADD SERVICE</div>

      {catalog.loading && (
        <div
          className="prj-addsvc-pulse"
          style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}
        >
          loading catalog…
        </div>
      )}
      {catalog.error !== null && !catalog.loading && (
        <div style={inlineErrorStyle}>Could not load the service catalog.</div>
      )}

      {catalog.data !== null && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              marginBottom: 14,
            }}
          >
            {catalog.data.map((t) => (
              <button
                key={t.id}
                type="button"
                className="prj-addsvc-type"
                onClick={() => pickType(t)}
                disabled={!formActive}
                aria-pressed={picked?.id === t.id}
                style={typeCardStyle(picked?.id === t.id)}
              >
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    fontWeight: 600,
                    color: color.cyan300,
                    letterSpacing: "0.06em",
                  }}
                >
                  {t.tag}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: color.body,
                    lineHeight: 1.2,
                  }}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>

          {picked !== null && (
            <>
              <div style={sectionLabelStyle}>LANGUAGE</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {picked.langs.map((l) => (
                  <LangChip
                    key={l.id}
                    lang={l}
                    picked={lang === l.id}
                    disabled={!formActive}
                    onPick={() => setLang(l.id)}
                  />
                ))}
              </div>

              <div style={sectionLabelStyle}>NAME</div>
              <input
                className="prj-addsvc-name"
                aria-label="Service name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!formActive}
                spellCheck={false}
                style={nameInputStyle(nameErr !== null && name !== "")}
              />
              {nameErr !== null && name !== "" && (
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: color.clay,
                    marginTop: 6,
                  }}
                >
                  {nameErr}
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: 14 }}>
            {state.phase === "form" && (
              <>
                {state.error !== null && (
                  <div style={inlineErrorStyle}>{state.error}</div>
                )}
                <button
                  type="button"
                  className="prj-addsvc-add"
                  onClick={submit}
                  disabled={!canAdd}
                  style={addBtnStyle(canAdd)}
                >
                  Add service →
                </button>
              </>
            )}
            {state.phase === "pending" && (
              <div
                className="prj-addsvc-pulse"
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.cyan300,
                }}
              >
                provisioning…
              </div>
            )}
            {state.phase === "done" && <ProgressStrip response={state.response} />}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Sub-pieces ────────────────────────────────────────────────────────────── */

function LangChip({
  lang,
  picked,
  disabled,
  onPick,
}: {
  lang: CatalogLang;
  picked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  if (!lang.available) {
    // Dimmed + SOON (the sidebar's established pattern), never selectable.
    return (
      <button type="button" disabled style={soonLangStyle}>
        {lang.name}
        <span style={soonChipStyle}>SOON</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={picked}
      style={langChipStyle(picked)}
    >
      {lang.name}
    </button>
  );
}

/**
 * The compact inline progress strip: one row per returned ProgressEvent
 * (status glyph + mono key — the provisioning overlay's row idiom, small),
 * plus the catalog-only note for non-materialized (demo) additions.
 */
function ProgressStrip({ response }: { response: AddServiceResponse }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {response.events.map((e, i) => (
        <div
          key={`${e.key}-${i}`}
          data-testid="addsvc-event"
          style={{ display: "flex", alignItems: "center", gap: 9 }}
        >
          <span style={{ ...glyphStyle, color: STATUS_COLOR[e.status] }}>
            {STATUS_GLYPH[e.status]}
          </span>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.06em",
              color: color.body,
            }}
          >
            {e.key}
          </span>
          <span style={{ flex: 1 }} />
          <span
            style={{ fontFamily: font.mono, fontSize: 9.5, color: color.faint }}
          >
            {e.status.toUpperCase()}
          </span>
        </div>
      ))}
      {!response.materialized && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: color.dim,
            marginTop: 4,
          }}
        >
          catalog-only · demo project
        </div>
      )}
    </div>
  );
}

const STATUS_GLYPH: Record<StepStatus, string> = {
  done: "✓",
  error: "✕",
  skipped: "→",
  started: "·",
};
const STATUS_COLOR: Record<StepStatus, string> = {
  done: color.grass,
  error: color.clay,
  skipped: color.dim,
  started: color.cyan300,
};

/* ── Styles (design tokens; hover states live in project.css) ──────────────── */

/** Ghost chip: the header's mono service chip, but dashed (SPEC §19.5). */
const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontFamily: font.mono,
  fontSize: 10,
  letterSpacing: "0.08em",
  color: color.muted,
  border: "1px dashed rgba(155,173,197,0.3)",
  borderRadius: 6,
  padding: "3px 9px",
  background: "transparent",
  cursor: "pointer",
};

/** The glass card, anchored under the chip (provisioning-overlay chrome). */
const popCardStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 10px)",
  left: 0,
  zIndex: 40,
  width: 400,
  background: color.card,
  border: "1px solid rgba(102,193,243,0.25)",
  borderRadius: 12,
  boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
  padding: "16px 18px",
  animation: "popIn 0.35s cubic-bezier(0.2,0.7,0.2,1) both",
  textAlign: "left",
};

const sectionLabelStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 10,
  letterSpacing: "0.18em",
  color: color.cyan300,
  marginBottom: 8,
};

const inlineErrorStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 10.5,
  color: color.clay, // #FF8855
  marginBottom: 8,
};

/** Wizard type-card idiom, compact (dashed → cyan when selected). */
function typeCardStyle(sel: boolean): CSSProperties {
  return {
    border: sel
      ? `1px solid ${color.cyan500}`
      : "1px dashed rgba(155,173,197,0.3)",
    background: sel ? "rgba(0,152,235,0.1)" : "transparent",
    borderRadius: 10,
    padding: "9px 4px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    cursor: "pointer",
    textAlign: "center",
    fontFamily: font.sans,
  };
}

function langChipStyle(picked: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 11px",
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: font.sans,
    cursor: "pointer",
    background: picked ? color.cyan500 : "rgba(204,234,251,0.06)",
    color: picked ? "#fff" : color.muted,
    border: picked
      ? `1px solid ${color.cyan500}`
      : "1px solid rgba(155,173,197,0.2)",
    transition: "all 130ms",
  };
}

const soonLangStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 11px",
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: font.sans,
  cursor: "default",
  opacity: 0.75,
  background: "rgba(204,234,251,0.06)",
  color: color.dim,
  border: "1px solid rgba(155,173,197,0.2)",
};

/** The sidebar's SOON chip — mono 9px bordered, verbatim. */
const soonChipStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 9,
  letterSpacing: "0.1em",
  color: color.dim,
  border: "1px solid rgba(105,132,168,0.4)",
  borderRadius: 4,
  padding: "2px 5px",
};

function nameInputStyle(invalid: boolean): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: font.mono,
    fontSize: 12,
    padding: "9px 11px",
    border: invalid
      ? "1px solid rgba(255,136,85,0.65)"
      : "1px solid rgba(155,173,197,0.22)",
    borderRadius: 8,
    background: color.pageBg,
    color: color.body,
    outline: "none",
    transition: "border-color 120ms, box-shadow 120ms",
  };
}

/** Primary cyan pill (the wizard Initialize button, compact). */
function addBtnStyle(enabled: boolean): CSSProperties {
  return {
    padding: "9px 20px",
    borderRadius: 9999,
    border: "none",
    background: enabled ? color.cyan500 : "rgba(155,173,197,0.15)",
    color: enabled ? "#fff" : color.dim,
    fontFamily: font.sans,
    fontSize: 12.5,
    fontWeight: 800,
    cursor: enabled ? "pointer" : "default",
    boxShadow: enabled ? "0 8px 28px rgba(0,152,235,0.35)" : "none",
    transition: "all 200ms",
  };
}

const glyphStyle: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  flex: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid currentColor",
  fontSize: 9,
  lineHeight: 1,
};
