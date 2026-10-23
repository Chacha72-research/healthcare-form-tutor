import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, Vite serves the app on :5173 and forwards API and
// websocket calls to the Python server on :8000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // lets phones on the same Wi-Fi open the dev server
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
