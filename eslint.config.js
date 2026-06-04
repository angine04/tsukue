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
]);
