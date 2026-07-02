/* global React, IconSearch */

export function Header({ activeNav, onNavigate, onContact }) {
  const { IconSearch } = window;
  const links = ['Services', 'Projects', 'Insights', 'About', 'Careers'];
  return (
    <header className="rh">
      <div className="rh__inner">
        <div className="rh__left">
          <a
            onClick={() => onNavigate('home')}
            style={{ cursor: 'pointer', borderBottom: 'none' }}
          >
            <img className="rh__logo" src="../../assets/ramboll-logo-cyan.png" alt="Ramboll" />
          </a>
          <nav className="rh__nav">
            {links.map((l) => (
              <span
                key={l}
                className={`rh__link ${activeNav === l ? 'is-active' : ''}`}
                onClick={() => onNavigate(l)}
              >
                {l}
              </span>
            ))}
          </nav>
        </div>
        <div className="rh__right">
          <button className="rh__iconbtn" aria-label="Search">
            <IconSearch />
          </button>
          <button className="btn btn--sm" onClick={onContact}>Get in touch</button>
        </div>
      </div>
    </header>
  );
}

window.Header = Header;
