/* global React */
// Tiny stroke-SVG icon set — Lucide-equivalent.
// Each component takes size and inherits color via currentColor.

export const Icon = ({ children, size = 20, strokeWidth = 1.75, ...rest }) =>
  React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ...rest,
    },
    children
  );

export const IconLeaf = (p) => (
  <Icon {...p}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6" />
  </Icon>
);
export const IconWind = (p) => (
  <Icon {...p}>
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </Icon>
);
export const IconBuilding = (p) => (
  <Icon {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01" /><path d="M16 6h.01" />
    <path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" />
    <path d="M16 10h.01" /><path d="M16 14h.01" />
    <path d="M8 10h.01" /><path d="M8 14h.01" />
  </Icon>
);
export const IconBridge = (p) => (
  <Icon {...p}>
    <path d="M3 12h18" />
    <path d="M3 17h18" />
    <path d="M6 12V6" /><path d="M18 12V6" />
    <path d="M3 6h18" />
  </Icon>
);
export const IconDroplet = (p) => (
  <Icon {...p}>
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C10 11.1 9 13 9 15s.81 4 3 5.43Z" />
  </Icon>
);
export const IconZap = (p) => (
  <Icon {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </Icon>
);
export const IconGlobe = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </Icon>
);
export const IconBriefcase = (p) => (
  <Icon {...p}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </Icon>
);
export const IconArrowRight = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);
export const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);
export const IconClose = (p) => (
  <Icon {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);
export const IconCheck = (p) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const IconLinkedIn = (p) => (
  <Icon {...p}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </Icon>
);
export const IconInstagram = (p) => (
  <Icon {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.5 6.5h.01" />
  </Icon>
);
export const IconYoutube = (p) => (
  <Icon {...p}>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </Icon>
);

Object.assign(window, {
  IconLeaf, IconWind, IconBuilding, IconBridge, IconDroplet, IconZap, IconGlobe, IconBriefcase,
  IconArrowRight, IconSearch, IconClose, IconCheck, IconLinkedIn, IconInstagram, IconYoutube,
});
