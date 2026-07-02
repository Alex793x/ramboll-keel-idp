/**
 * Sidebar — 248px fixed rail with logo + HUB badge, "Initialize project" CTA,
 * WORKSPACE/PLATFORM nav groups and the user footer.
 * Ported exactly from `Ramboll Developer Hub.dc.html` lines 66–96.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { color, font } from "../../design/tokens";
import { ICONS, PathIcon } from "../../design/icons";
import { deriveName } from "../../lib/auth";
import {
  NAV_GROUPS,
  initialsFromName,
  isNavItemActive,
  type NavItem,
} from "./nav";

export function Sidebar({ email }: { email: string | null }) {
  const name = email ? deriveName(email) : "";
  const initials = initialsFromName(name);

  return (
    <aside
      style={{
        width: 248,
        flex: "none",
        background: color.sidebarBg,
        borderRight: "1px solid rgba(155,173,197,0.12)",
        display: "flex",
        flexDirection: "column",
        padding: "22px 14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 10px 22px",
        }}
      >
        <img
          src="/assets/ramboll-logo-white.png"
          alt="Ramboll"
          style={{ height: 24, width: "auto" }}
        />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            color: color.cyan300,
            border: "1px solid rgba(102,193,243,0.35)",
            borderRadius: 4,
            padding: "3px 6px",
          }}
        >
          HUB
        </span>
      </div>

      <InitializeProjectButton />

      {NAV_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 18 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.18em",
              color: color.faint,
              padding: "0 12px 8px",
            }}
          >
            {group.label}
          </div>
          {group.items.map((item) => (
            <SidebarNavItem key={item.name} item={item} />
          ))}
        </div>
      ))}

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 10px",
          borderTop: "1px solid rgba(155,173,197,0.1)",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${color.cyan500}, ${color.ocean})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            color: "#fff",
            flex: "none",
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: color.body,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          <div style={{ fontSize: 11, color: color.dim }}>
            DPE · Platform Engineering
          </div>
        </div>
      </div>
    </aside>
  );
}

function InitializeProjectButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="rdh-shell-cta"
      onClick={() => void navigate({ to: "/new" })}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        margin: "0 6px 22px",
        padding: "12px 16px",
        borderRadius: 9999,
        border: "none",
        color: "#fff",
        fontFamily: font.sans,
        fontSize: 14,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1, marginTop: -1 }}>+</span>{" "}
      Initialize project
    </button>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const active = isNavItemActive(item, pathname);
  const to = item.to;

  return (
    <div
      className={
        active
          ? "rdh-shell-navitem rdh-shell-navitem--active"
          : "rdh-shell-navitem"
      }
      onClick={
        item.soon || !to ? undefined : () => void navigate({ to })
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "9px 12px",
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 700,
        cursor: item.soon ? "default" : "pointer",
        marginBottom: 2,
        color: active ? color.white : item.soon ? color.dim : color.muted,
        boxShadow: active ? `inset 2.5px 0 0 ${color.cyan500}` : "none",
        opacity: item.soon ? 0.75 : 1,
      }}
    >
      <PathIcon
        d={ICONS[item.icon]}
        size={17}
        strokeWidth={1.8}
        style={{ flex: "none" }}
      />
      <span style={{ flex: 1 }}>{item.name}</span>
      {item.soon ? (
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 9,
            letterSpacing: "0.1em",
            color: color.dim,
            border: "1px solid rgba(105,132,168,0.4)",
            borderRadius: 4,
            padding: "2px 5px",
          }}
        >
          SOON
        </span>
      ) : null}
    </div>
  );
}
