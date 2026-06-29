/** Footer with the Ramboll tagline (SPEC §8). */
export function AppFooter() {
  return (
    <footer className="rb-footer">
      <div className="rb-footer__inner">
        <span>© {new Date().getFullYear()} Ramboll · Keel</span>
        <span className="rb-footer__tagline">Bright ideas. Sustainable change.</span>
      </div>
    </footer>
  );
}
