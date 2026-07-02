/**
 * Initials avatar — the sidebar's gradient circle idiom
 * (`linear-gradient(135deg, cyan500, ocean)`, Sidebar.tsx), sized for rows.
 */
import { color } from "../../design/tokens";
import { initialsFromName } from "../shell/nav";

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${color.cyan500}, ${color.ocean})`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 800,
        color: "#fff",
        flex: "none",
      }}
    >
      {initialsFromName(name)}
    </span>
  );
}

/** Avatar for a GitHub login ("joe-evans" → "JE"). */
export function LoginAvatar({ login, size = 20 }: { login: string; size?: number }) {
  return <Avatar name={login.replace(/-/g, " ")} size={size} />;
}
