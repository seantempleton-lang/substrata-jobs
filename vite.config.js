import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Substrata Jobs",
        short_name: "Jobs",
        description: "Offline-first field activity records for drilling teams.",
        theme_color: "#0F1E2E",
        background_color: "#F7F8FA",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-512.svg", sizes: "512x512", type: "image/svg+xml" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,woff2}"]
      }
    })
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080"
    }
  }
});
