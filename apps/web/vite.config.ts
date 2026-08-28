import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ws = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

// Browser-safe facade over @moneytalks/shared (excludes the Node-only
// fingerprint module). Keeps app imports pointing at the package specifier.
const sharedClient = fileURLToPath(
  new URL("./src/lib/shared-client.ts", import.meta.url),
);

// Design tokens live outside the app root; expose them through a bare specifier
// so Tailwind v4's Vite resolver can import them (avoids crossing the root).
const tokens = fileURLToPath(
  new URL("../../packages/config/tokens/moneytalks.css", import.meta.url),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@moneytalks/shared": sharedClient,
      "@moneytalks/types": ws("types"),
      "@moneytalks/validation": ws("validation"),
      "@moneytalks/tokens": tokens,
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
