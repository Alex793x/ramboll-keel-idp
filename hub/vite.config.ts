/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~": srcDir,
    },
  },
  plugins: [
    // TanStack Start: filesystem routing + SSR wiring. Must come before viteReact.
    // Exclude colocated *.test/*.spec files from the generated route tree.
    tanstackStart({
      router: { routeFileIgnorePattern: "\\.(test|spec)\\.(ts|tsx)$" },
    }),
    viteReact(),
  ],
  test: {
    // jsdom so Testing Library can render React components.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // The router/start plugins are build-time concerns; tests cover pure logic +
    // component units, so we restrict discovery to src test files.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
