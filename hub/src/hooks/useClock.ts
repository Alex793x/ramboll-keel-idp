/**
 * Live clock — exact port of the design's clock tick
 * (`Ramboll Developer Hub.dc.html` lines 661–665): `HH:MM:SS CET`, each part
 * padStart(2, '0'), updated every 1000ms, interval cleared on unmount.
 */
import { useEffect, useState } from 'react';

/** Pure formatter, exported separately so it can be unit-tested. */
export function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' CET';
}

/**
 * Returns the live clock string. Mirrors the design source exactly: starts as
 * `''` and first populates on the first 1000ms tick.
 */
export function useClock(): string {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = setInterval(() => {
      setClock(formatClock(new Date()));
    }, 1000);
    return () => clearInterval(tick);
  }, []);
  return clock;
}
