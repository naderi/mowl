import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  clearScreen: false,
  // Env vars starting with these prefixes are exposed to the client.
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // The bundled system WebViews are all evergreen Chromium / WebKit.
    target: ["es2022", "chrome110", "safari15"],
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
