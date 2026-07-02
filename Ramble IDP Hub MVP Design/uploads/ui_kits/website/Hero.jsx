/* global React */

export function Hero({ kicker, title, deck, primaryLabel, onPrimary, secondaryLabel, onSecondary, variant }) {
  const heroClass = `hero ${variant ? `placeholder-photo placeholder-photo--${variant}` : ''}`;
  return (
    <section className={heroClass}>
      <span className="hero__photo-label">Photo placeholder</span>
      <div className="hero__inner">
        {kicker && <div className="hero__kicker">{kicker}</div>}
        <h1 className="hero__title">{title}</h1>
        <p className="hero__deck">{deck}</p>
        <div className="hero__actions">
          {primaryLabel && (
            <button className="btn btn--lg" onClick={onPrimary}>{primaryLabel}</button>
          )}
          {secondaryLabel && (
            <button
              className="btn btn--lg btn--secondary"
              onClick={onSecondary}
              style={{ color: '#fff', borderColor: '#fff', background: 'transparent' }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

window.Hero = Hero;
