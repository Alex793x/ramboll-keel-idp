# UI Shell — Sign-in screen + App shell (sidebar/topbar)

Agent: **fleet-ui-shell** · Status: **done** · Date: 2026-07-02

Port of the Ramboll Developer Hub design (`Ramble IDP Hub MVP Design/Ramboll
Developer Hub.dc.html`) — sign-in screen (source lines 36–59) and the
signed-in app shell (lines 61–116, nav model lines 949–967). Ported exactly:
px values, rgba stops, copy strings, animation timings.

## Files

| File | Action | What |
| --- | --- | --- |
| `hub/src/routes/login.tsx` | rewritten | Full-viewport sign-in: ambient orbs (driftA 16s / driftB 20s), 56px masked grid, fadeUp column, "Continue with Microsoft" pill (ringPulse 2.6s), footer `INTERNAL PLATFORM · V0.1 MVP` |
| `hub/src/components/shell/AppShell.tsx` | new | `<AppShell>{children}</AppShell>` — flex/100vh/hidden on `#061021`; redirects to `/login` when no session (effect + guarded render, same pattern as `new.tsx`) |
| `hub/src/components/shell/Sidebar.tsx` | new | 248px rail: logo + HUB badge, `+ Initialize project` CTA → `/new`, WORKSPACE/PLATFORM groups, user footer (avatar gradient + `deriveName` + initials) |
| `hub/src/components/shell/Topbar.tsx` | new | 62px bar: ⌘K search pill, `ALL SYSTEMS OPERATIONAL` (pulseDot 2.2s), `useClock()` CET clock |
| `hub/src/components/shell/nav.ts` | new | Dependency-free nav model: `NAV_GROUPS`, `isNavItemActive` (exact `/`; prefix for others so `/knowledge/...` keeps Knowledge Base lit), `initialsFromName` |
| `hub/src/components/shell/nav.test.ts` | new | 14 tests: group order, routes, soon flags, active matching, initials |
| `hub/src/components/shell/shell.css` | new | `.rdh-shell-*` hover states (sign-in button, CTA, nav items, search pill). Base bg/border for hover-overridden props live here so no `!important` |

## Usage (for other agents)

```tsx
import { AppShell } from "../components/shell/AppShell"; // from src/routes/*

<AppShell>{/* your screen */}</AppShell>
```

- Wraps content in the scroll area (`flex:1; overflow-y:auto; position:relative`).
- Handles the no-session redirect itself — pages do not need their own guard.
- Sidebar active state derives from `useRouterState` pathname; any `/knowledge/...`
  sub-path marks Knowledge Base active.

## Sign-in behavior

- Click → `signIn('kristoffer.pedersen@ramboll.com', 'sso')` (mock Entra ID SSO
  via existing `useSession`) → navigate `/`.
- Already signed in → redirect `/`.

## Validation

- `npx vitest run src/components/shell` — 14/14 green.
- `npx tsc --noEmit` — one expected error: `"/knowledge"` not yet in
  `routeTree.gen.ts` (route owned by the knowledge agent, in flight). Clears
  automatically when `routes/knowledge*.tsx` lands and the route tree regenerates.

## Notes

- Compiled against frozen contracts: `design/tokens.ts` (`color`, `font`),
  `design/icons.tsx` (`PathIcon`, `ICONS`, `SearchIcon`), `design/global.css`
  keyframes (fadeUp/driftA/driftB/ringPulse/pulseDot), `hooks/useClock.ts`,
  `/assets/ramboll-logo-white.png` — all landed by the design agent.
- Source `style-hover` semantics preserved: nav-item `:hover` rule is declared
  after the active modifier, so hover overrides the active background exactly
  like the design runtime.
