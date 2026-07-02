/**
 * Shared dashboard primitives: the glass panel with its mono letterspaced
 * label (+ optional LIVE pulsing dot, the wizard's LIVE BLUEPRINT idiom),
 * branch chips, and the KB copy pattern (`COPY` → `COPIED ✓` for 1400ms).
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { color, font } from "../../design/tokens";

/** Stagger step for panel entrances (SPEC §18.3: popIn staggered 70ms). */
export const STAGGER_MS = 70;

export function GlassPanel({
  label,
  live = false,
  index = 0,
  right,
  children,
  style,
}: {
  /** Mono letterspaced header, e.g. "THE FLOW". */
  label: string;
  /** Adds the pulsing cyan dot next to the label (LIVE BLUEPRINT idiom). */
  live?: boolean;
  /** Position in the entrance stagger (× 70ms). */
  index?: number;
  /** Optional right-aligned header content. */
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      className="prj-panel"
      style={{
        background: color.card,
        borderRadius: 12,
        padding: "18px 20px",
        animation: `popIn 0.5s cubic-bezier(0.2,0.7,0.2,1) ${index * STAGGER_MS}ms both`,
        ...style,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.2em",
            color: color.cyan300,
          }}
        >
          {label}
          {live && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color.cyan500,
                animation: "pulseDot 1.8s ease-in-out infinite",
              }}
            />
          )}
        </span>
        {right}
      </header>
      {children}
    </section>
  );
}

/** Mono branch chip — `feature/dh-114-load-forecast` in a soft cyan pill. */
export function BranchChip({ name }: { name: string }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        color: color.cyan200,
        background: "rgba(153,214,247,0.1)",
        border: "1px solid rgba(153,214,247,0.25)",
        borderRadius: 6,
        padding: "2px 8px",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </span>
  );
}

/**
 * KB copy pattern (blocks.tsx CodeBlock): returns `copied` and a `copy(text)`
 * that writes to the clipboard and flips the flag back after 1400ms.
 */
export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string) => {
    try {
      if (navigator.clipboard) void navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable — label feedback still applies (as in the KB source) */
    }
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };
  return { copied, copy };
}
