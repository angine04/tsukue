/**
 * `.astro` components imported from a plain module.
 *
 * The MDX registry is the only place that pulls components into a `.ts` file,
 * so one object can be handed to `<Article components={…} />`. Astro generates
 * types for what it compiles rather than for every component, so `tsc` — which
 * `pnpm check` runs on top of `astro check` — has nothing to resolve the
 * extension with, while the build itself resolves it fine.
 *
 * Declared as the component type Astro uses, so the registry stays typed rather
 * than degrading to `any`. A mistyped path is still caught by the build, which
 * fails on a module that does not exist.
 */
declare module "*.astro" {
  const component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default component;
}
