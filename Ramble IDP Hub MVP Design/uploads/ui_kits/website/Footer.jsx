/* global React, IconLinkedIn, IconInstagram, IconYoutube */

export function Footer() {
  const { IconLinkedIn, IconInstagram, IconYoutube } = window;
  const cols = [
    {
      h: 'Services',
      links: ['Buildings', 'Transport', 'Energy', 'Water', 'Environment & Health', 'Management Consulting', 'Architecture & Landscape'],
    },
    {
      h: 'Insights',
      links: ['Featured insights', 'Sustainable change', 'Climate & nature', 'Resilient societies'],
    },
    {
      h: 'About',
      links: ['Who we are', 'Our strategy', 'Sustainability', 'Leadership', 'Newsroom'],
    },
    {
      h: 'Get in touch',
      links: ['Find an office', 'Contact us', 'Careers', 'For media'],
    },
  ];
  return (
    <footer className="rf">
      <div className="wrap">
        <div className="rf__top">
          <div className="rf__brand">
            <img src="../../assets/ramboll-logo-white.png" alt="Ramboll" />
            <p>Bright ideas. Sustainable change. The Partner for Sustainable Change since 1945.</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, color: '#fff' }}>
              <a aria-label="LinkedIn" style={{ color: '#fff', opacity: 0.75 }}><IconLinkedIn size={22} strokeWidth={1.5} /></a>
              <a aria-label="Instagram" style={{ color: '#fff', opacity: 0.75 }}><IconInstagram size={22} strokeWidth={1.5} /></a>
              <a aria-label="YouTube" style={{ color: '#fff', opacity: 0.75 }}><IconYoutube size={22} strokeWidth={1.5} /></a>
            </div>
          </div>
          {cols.map((c) => (
            <div className="rf__col" key={c.h}>
              <h5>{c.h}</h5>
              {c.links.map((l) => <a key={l}>{l}</a>)}
            </div>
          ))}
        </div>
        <div className="rf__bot">
          <span>© 1945–2026 Ramboll Group A/S · Copenhagen, Denmark</span>
          <div className="rf__bot__links">
            <a>Privacy</a>
            <a>Cookies</a>
            <a>Terms</a>
            <a>Whistleblower</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

window.Footer = Footer;
