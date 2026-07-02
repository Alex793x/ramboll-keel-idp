import type { ReactElement, ReactNode } from 'react';

export type SectionVariant = 'pebble' | 'ocean';

export interface SectionProps {
  /** Small uppercase kicker with a cyan hairline rule. */
  kicker?: string;
  /** Section H2. */
  title?: string;
  /** Lead paragraph under the title. */
  lead?: string;
  /** Background variant — default white, "pebble" warm off-white, "ocean" dark navy. */
  variant?: SectionVariant;
  /** Constrain content to the narrow measure. */
  narrow?: boolean;
  children?: ReactNode;
}

/** Vertical content section shell — kicker, H2, lead, then arbitrary children. */
export function Section(props: SectionProps): ReactElement;
