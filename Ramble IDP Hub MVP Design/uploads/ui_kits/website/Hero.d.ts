import type { ReactElement } from 'react';

export type HeroVariant = 'cool' | 'green' | 'earth';

export interface HeroProps {
  /** Small uppercase kicker above the headline. */
  kicker?: string;
  /** Main headline. */
  title?: string;
  /** Supporting deck paragraph under the headline. */
  deck?: string;
  /** Primary CTA label; omit to hide. */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Secondary (outline) CTA label; omit to hide. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Photo-placeholder gradient variant. */
  variant?: HeroVariant;
}

/** Full-bleed hero with kicker, headline, deck and up to two CTAs over a photo placeholder. */
export function Hero(props: HeroProps): ReactElement;
