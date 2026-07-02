import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// This vitest jsdom environment ships no `window.localStorage` (and Node 26's experimental
// global `localStorage` is non-functional without `--localstorage-file`). Session helpers in
// `src/lib/auth.ts` read `window.localStorage`, so give tests a spec-shaped in-memory Storage.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true,
  });
}

// Unmount React trees between tests so the jsdom document stays clean.
afterEach(() => {
  cleanup();
});
