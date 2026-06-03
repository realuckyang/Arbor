import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": { target: "http://127.0.0.1:7000", ws: true },
      "/health": "http://127.0.0.1:7000",
    },
  },
});
