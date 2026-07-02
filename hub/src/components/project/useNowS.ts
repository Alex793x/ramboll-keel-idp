/**
 * Ticking "now" in unix epoch seconds. When `live` is true the value updates
 * every second (running pipelines show a ticking elapsed timer); when false it
 * stays at the mount-time value so nothing re-renders needlessly.
 */
import { useEffect, useState } from "react";

export function useNowS(live: boolean): number {
  const [nowS, setNowS] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!live) return;
    const tick = setInterval(() => {
      setNowS(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [live]);
  return nowS;
}
