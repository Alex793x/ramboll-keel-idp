import type { ReactElement } from 'react';

export interface HeaderProps {
  /** Label of the currently active nav item (e.g. "Services"). */
  activeNav?: string;
  /** Called with the nav target ("home" | nav label) when a link or the logo is clicked. */
  onNavigate?: (target: string) => void;
  /** Called when the "Get in touch" CTA is clicked. */
  onContact?: () => void;
}

/** Sticky marketing-site top navigation — logo, primary links, search and CTA. */
export function Header(props: HeaderProps): ReactElement;
