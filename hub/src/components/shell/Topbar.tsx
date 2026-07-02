/**
 * Topbar — 62px header with the ⌘K search pill, "ALL SYSTEMS OPERATIONAL"
 * status and the live CET clock.
 * Ported exactly from `Ramboll Developer Hub.dc.html` lines 100–113.
 */
import { color, font } from "../../design/tokens";
import { SearchIcon } from "../../design/icons";
import { useClock } from "../../hooks/useClock";

export function Topbar() {
  const clock = useClock();

  return (
    <div
      style={{
        height: 62,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 28px",
        borderBottom: "1px solid rgba(155,173,197,0.1)",
        background: "rgba(6,16,33,0.7)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="rdh-shell-search"
        style={{
          flex: "1 1 240px",
          minWidth: 0,
          maxWidth: 520,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: color.card,
          borderRadius: 9999,
          padding: "9px 16px",
          color: color.dim,
          cursor: "text",
        }}
      >
        <SearchIcon size={15} strokeWidth={2} style={{ flex: "none" }} />
        <span
          style={{
            fontSize: 13.5,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Search services, repos, docs, people…
        </span>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: color.dim,
            border: "1px solid rgba(105,132,168,0.4)",
            borderRadius: 4,
            padding: "2px 6px",
            flex: "none",
          }}
        >
          ⌘K
        </span>
      </div>
      <div style={{ flex: "0 1 40px" }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: font.mono,
          fontSize: 11,
          color: color.grass,
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
          flex: "none",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color.grass,
            animation: "pulseDot 2.2s ease-in-out infinite",
          }}
        />
        ALL SYSTEMS OPERATIONAL
      </div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.dim,
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
          flex: "none",
        }}
      >
        {clock}
      </div>
    </div>
  );
}
