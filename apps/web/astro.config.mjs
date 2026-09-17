import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

import { SITE_URL } from "@tsukue/config";

export default defineConfig({
  // Single source of truth: packages/config/src/site.ts
  site: SITE_URL,
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
