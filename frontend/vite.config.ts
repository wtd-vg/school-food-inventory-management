import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,

    // Khi React gọi /api, Vite chuyển request sang container Django.
    proxy: {
      "/api": "http://backend:8000",
    },
  },
});
