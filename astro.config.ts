import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: {
    inlineStylesheets: "always",
  },
  vite: {
    plugins: [tailwindcss()],
    css: {
      transformer: "lightningcss",
    },
    build: {
      cssMinify: "lightningcss",
    },
    worker: {
      format: "es",
    },
  },
});
