/**
 * CreatedScreen — the celebration view shown after provisioning finishes:
 * check circle, "{name} is live.", summary, repo chips and the two CTAs.
 *
 * Ported EXACTLY from `Ramboll Developer Hub.dc.html` lines 541–560 (markup)
 * and 1143–1151 / 1227 (repos, summary, id). Navigation is delegated to the
 * route via `onGoHome` / `onGoProjects`.
 */
import { ICONS, PathIcon } from '../../design/icons';
import { color, font } from '../../design/tokens';
import {
  createdId,
  createdRepos,
  createdSummary,
  type CreatedProject,
} from '../../lib/wizard-model';
import './wizard.css';

export interface CreatedScreenProps {
  created: CreatedProject;
  /** "Back to control room" → `/`. */
  onGoHome: () => void;
  /** "View all projects" → `/projects`. */
  onGoProjects: () => void;
}

export function CreatedScreen({ created, onGoHome, onGoProjects }: CreatedScreenProps) {
  return (
    <div
      style={{
        padding: '70px 40px',
        maxWidth: 760,
        margin: '0 auto',
        textAlign: 'center',
        animation: 'fadeUp 0.6s cubic-bezier(0.2,0.7,0.2,1) both',
      }}
    >
      <div
        style={{
          width: 78,
          height: 78,
          borderRadius: '50%',
          background: 'rgba(173,208,149,0.12)',
          border: '1.5px solid rgba(173,208,149,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 26px',
          animation: 'popIn 0.6s cubic-bezier(0.2,0.7,0.2,1) both',
        }}
      >
        <PathIcon d={ICONS.check} size={34} strokeWidth={2.4} stroke={color.grass} />
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: '0.24em',
          color: color.cyan300,
          marginBottom: 12,
        }}
      >
        {createdId(created.gba)} · PROVISIONED
      </div>
      <h1
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 12px',
          color: color.white,
        }}
      >
        {created.name} is live.
      </h1>
      <p
        style={{
          fontSize: 15.5,
          color: color.muted,
          lineHeight: 1.6,
          margin: '0 auto 30px',
          maxWidth: '52ch',
        }}
      >
        {createdSummary(created)} Standards, branch protection and CI validation pipelines
        are already in place.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 36,
        }}
      >
        {createdRepos(created).map((cr, i) => (
          <span
            key={`${cr}-${i}`}
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.cyan200,
              background: 'rgba(153,214,247,0.1)',
              border: '1px solid rgba(153,214,247,0.25)',
              borderRadius: 6,
              padding: '6px 12px',
            }}
          >
            {cr}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          type="button"
          className="wz-btn-home"
          onClick={onGoHome}
          style={{
            padding: '13px 28px',
            borderRadius: 9999,
            border: 'none',
            background: color.cyan500,
            color: '#fff',
            fontFamily: font.sans,
            fontSize: 14.5,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
        >
          Back to control room
        </button>
        <button
          type="button"
          className="wz-btn-projects"
          onClick={onGoProjects}
          style={{
            padding: '13px 28px',
            borderRadius: 9999,
            border: '1.5px solid rgba(155,173,197,0.35)',
            background: 'transparent',
            color: color.body,
            fontFamily: font.sans,
            fontSize: 14.5,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'border-color 150ms',
          }}
        >
          View all projects
        </button>
      </div>
    </div>
  );
}
