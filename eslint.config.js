import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.astro/**",
      "**/.wrangler/**",
      "apps/web/dist/**",
      "apps/web/.astro/**",
      "pnpm-lock.yaml",
    ],
  },
  {
    // Build and tooling configs run in Node, so they legitimately read the
    // environment. Scoped to those files rather than declared globally, so a
    // stray `process` in application code is still an error.
    files: ["**/*.config.{js,mjs,cjs,ts}", "eslint.config.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
]);
