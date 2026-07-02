/**
 * LiveBlueprint — the sticky right-hand panel of the wizard that mirrors the
 * draft in real time: project node, service nodes, CI/CD node and the
 * "WHAT YOU GET" perk list.
 *
 * Ported EXACTLY from `Ramboll Developer Hub.dc.html` lines 491–536 (markup)
 * and 1197–1212 (blueprint values + perks).
 */
import { ICONS, PathIcon } from '../../design/icons';
import { color, font } from '../../design/tokens';
import {
  blueprintName,
  repoName,
  slugOf,
  typeOf,
  type Service,
} from '../../lib/wizard-model';

/** "WHAT YOU GET" perk rows — design lines 1206–1212, verbatim. */
export const PERKS: readonly string[] = [
  'One repo per service, from approved Ramboll templates',
  'GitHub Actions: build, test & validation pipelines',
  'Branch protection, CODEOWNERS, security scanning',
  'Registered in the software catalog with ownership',
  'Linked docs: golden path, standards, runbook template',
];

export interface LiveBlueprintProps {
  name: string;
  gba: string | null;
  contributors: readonly string[];
  services: readonly Service[];
}

export function LiveBlueprint({ name, gba, contributors, services }: LiveBlueprintProps) {
  const slug = slugOf(name);
  const nodes = services.map((sv, i) => {
    const t = typeOf(sv.type);
    return { tag: t.tag, label: t.label, repo: repoName(slug, services, i), lang: sv.lang };
  });

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        background: 'linear-gradient(180deg, #0A1B33 0%, #081527 100%)',
        border: '1px solid rgba(102,193,243,0.22)',
        borderRadius: 12,
        padding: 22,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: '0.2em',
            color: color.cyan300,
          }}
        >
          LIVE BLUEPRINT
        </span>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: color.cyan500,
            animation: 'pulseDot 1.8s ease-in-out infinite',
          }}
        />
      </div>

      <div
        style={{
          background: color.pageBg,
          border: '1px solid rgba(155,173,197,0.2)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: color.dim,
            letterSpacing: '0.1em',
            marginBottom: 4,
          }}
        >
          PROJECT
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: color.white }}>
          {blueprintName(name)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              padding: '3px 9px',
              borderRadius: 9999,
              fontSize: 10.5,
              fontWeight: 700,
              background: gba ? 'rgba(204,234,251,0.12)' : 'rgba(155,173,197,0.08)',
              color: gba ? color.cyan200 : color.dim,
            }}
          >
            {gba || 'No GBA yet'}
          </span>
          <span
            style={{
              display: 'inline-flex',
              padding: '3px 9px',
              borderRadius: 9999,
              fontSize: 10.5,
              fontWeight: 700,
              background: 'rgba(224,212,219,0.12)',
              color: color.heath,
            }}
          >
            {contributors.length + 1} people
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: 1.5,
            height: 18,
            background:
              'linear-gradient(180deg, rgba(102,193,243,0.6), rgba(102,193,243,0.15))',
          }}
        />
      </div>

      {nodes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nodes.map((b, i) => (
            <div
              key={`${b.repo}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(0,152,235,0.07)',
                border: '1px solid rgba(0,152,235,0.35)',
                borderRadius: 10,
                padding: '11px 14px',
                animation: 'popIn 0.35s cubic-bezier(0.2,0.7,0.2,1) both',
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  fontWeight: 600,
                  color: color.cyan300,
                }}
              >
                {b.tag}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: color.body }}>
                  {b.label}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 9.5, color: color.dim }}>
                  {b.repo}
                </div>
              </div>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  color: color.cyan200,
                  background: 'rgba(153,214,247,0.12)',
                  borderRadius: 4,
                  padding: '3px 7px',
                }}
              >
                {b.lang}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            border: '1px dashed rgba(155,173,197,0.28)',
            borderRadius: 10,
            padding: '20px 16px',
            textAlign: 'center',
            fontSize: 12.5,
            color: color.dim,
          }}
        >
          Add service components to see them here
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: 1.5,
            height: 18,
            background:
              'linear-gradient(180deg, rgba(102,193,243,0.15), rgba(173,208,149,0.5))',
          }}
        />
      </div>

      <div
        style={{
          background: 'rgba(173,208,149,0.07)',
          border: '1px solid rgba(173,208,149,0.3)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: color.grass,
            letterSpacing: '0.1em',
            marginBottom: 3,
          }}
        >
          CI / CD · GITHUB ACTIONS
        </div>
        <div style={{ fontSize: 12, color: color.muted, lineHeight: 1.4 }}>
          Build · test · validate pipelines, wired per repo
        </div>
      </div>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: '0.2em',
          color: color.dim,
          marginBottom: 10,
        }}
      >
        WHAT YOU GET
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PERKS.map((pk) => (
          <div
            key={pk}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: 12.5,
              color: color.muted,
              lineHeight: 1.4,
            }}
          >
            <PathIcon
              d={ICONS.check}
              size={13}
              strokeWidth={2.4}
              stroke={color.grass}
              style={{ marginTop: 2 }}
            />
            {pk}
          </div>
        ))}
      </div>
    </div>
  );
}
