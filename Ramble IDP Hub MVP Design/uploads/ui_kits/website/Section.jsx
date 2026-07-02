/* global React */

export function Section({ kicker, title, lead, children, variant, narrow }) {
  const cls = `sec ${variant ? `sec--${variant}` : ''}`;
  return (
    <section className={cls}>
      <div className={`wrap ${narrow ? 'wrap--narrow' : ''}`}>
        {(kicker || title || lead) && (
          <div className="sec__head">
            {kicker && <div className="sec__kicker">{kicker}</div>}
            {title && <h2 className="h2" style={{ marginBottom: lead ? 16 : 0 }}>{title}</h2>}
            {lead && <p className="lead">{lead}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

window.Section = Section;
