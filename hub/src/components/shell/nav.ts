/**
 * Sidebar navigation model — ported exactly from the Ramboll Developer Hub
 * design (`Ramboll Developer Hub.dc.html`, lines 949–967).
 *
 * Kept dependency-free (icon names are a string union matching the `ICONS`
 * map keys in `design/icons.tsx`) so the model is unit-testable in isolation.
 */

export type NavIconName =
  | "home"
  | "folder"
  | "book"
  | "grid"
  | "branch"
  | "zap"
  | "bot"
  | "help";

export type NavRoute = "/" | "/projects" | "/knowledge";

export interface NavItem {
  name: string;
  icon: NavIconName;
  /** Route target; absent for `soon` (non-clickable) items. */
  to?: NavRoute;
  /** Placeholder platform item — dimmed, non-clickable, with a SOON chip. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "WORKSPACE",
    items: [
      { name: "Home", icon: "home", to: "/" },
      { name: "Projects", icon: "folder", to: "/projects" },
      { name: "Knowledge Base", icon: "book", to: "/knowledge" },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { name: "Software Catalog", icon: "grid", soon: true },
      { name: "Repositories", icon: "branch", soon: true },
      { name: "Golden Paths", icon: "zap", soon: true },
      { name: "Agents", icon: "bot", soon: true },
      { name: "Platform Support", icon: "help", soon: true },
    ],
  },
];

/**
 * Route → nav-item active match. `/` matches only exactly; every other target
 * matches the exact path or any sub-path, so e.g. `/knowledge/py-gp-001`
 * keeps Knowledge Base active. `soon` items are never active.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.to || item.soon) {
    return false;
  }
  if (item.to === "/") {
    return pathname === "/";
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** First letters of the first two words, uppercased ("Anya Sorensen" → "AS"). */
export function initialsFromName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
