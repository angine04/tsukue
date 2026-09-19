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
    // Vite looks for .env beside the app by default, which would mean a second
    // env file for the web build alone. The repo already keeps one at the root
    // (for Wrangler), so both read from there. Only `PUBLIC_`-prefixed values
    // reach the browser, so the Cloudflare credentials alongside it stay
    // build-side.
    envDir: "../../",
    server: {
      // `astro dev` does not run Pages Functions, so without this `/api/*`
      // falls through to the catch-all content route and 404s — which looks
      // like a broken comment form rather than a server that was never
      // started. Forwarded here to `pnpm dev:api`, which does run them.
      proxy: {
        "/api": {
          target: `http://localhost:${process.env.API_DEV_PORT ?? "8788"}`,
          // `changeOrigin` is deliberately left off. It rewrites the Host
          // header to the target, which would make the Function believe the
          // request came from :8788 while the browser's Origin says :4330 —
          // and the admin API rejects a mutation whose Origin does not match.
          // Forwarding the original host keeps the API's view of the request
          // the same one the browser has.
          changeOrigin: false,
        },
      },
    },
  },
});
