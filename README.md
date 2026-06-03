# Tsukue

A tactile, editorial blog template built with Astro, React, and Hono. Designed to feel like a physical desk with paper cards scattered across a wooden surface — warm, material, and distinctly personal.

**[Live Demo →](https://tsukue.angine.tech)** (placeholder)

---

## Features

- **Tactile Desk Interface** — Blog posts as physical paper cards on a wooden desk surface
- **Card-to-Article Expansion** — Seamless transitions from desk cards to full article sheets
- **Multilingual Support** — i18n-ready with per-language MDX files
- **Static-First Architecture** — Real semantic HTML at build time, SEO-safe
- **Comments System** — Hono backend with Cloudflare D1, moderation, and Turnstile spam protection
- **Newsletter** — Double opt-in subscription with unsubscribe support
- **Admin Dashboard** — Protected comment moderation and subscriber management
- **RSS & Sitemap** — Auto-generated

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Site** | Astro 6, React 19, Tailwind CSS v4, Framer Motion |
| **Backend** | Hono, Cloudflare Pages Functions, D1 |
| **Content** | MDX, Astro Content Collections |
| **Mail** | Provider-agnostic adapter (pluggable) |
| **Spam** | Cloudflare Turnstile |
| **Package** | pnpm workspaces |

---

## Quick Start

### Prerequisites

- Node.js `>=22.12.0`
- pnpm (`npm install -g pnpm`)

### 1. Use this template

```bash
# Clone the template
git clone https://github.com/angine/tsukue.git my-blog
cd my-blog

# Install dependencies
pnpm install
```

### 2. Configure your site

Edit `packages/config/src/site.ts`:

```typescript
export const SITE_NAME = "Your Name";
export const SITE_DESCRIPTION = "Your tagline.";
export const SITE_URL = "https://yourdomain.com";
export const AUTHOR_NAME = "Your Name";
export const AUTHOR_EMAIL = "hello@yourdomain.com";
```

### 3. Add your content

Create MDX files in `apps/web/src/content/posts/en/` (or other language folders):

```yaml
---
title: "On Slowness in a Fast World"
description: "A short essay about speed, attention, and deliberate work."
date: "2026-05-28T00:00:00Z"
lang: en
translationKey: on-slowness-in-a-fast-world
slug: on-slowness
---

Your article content here.
```

### 4. Run locally

```bash
# Start the web app (includes API functions at /api/*)
pnpm dev:web
```

### 5. Build for production

```bash
# Build the static site (includes API functions)
pnpm build:web
```

---

## Project Structure

```
tsukue/
├── apps/
│   └── web/              # Astro frontend (desk UI, articles, admin)
├── functions/            # Hono API functions (Cloudflare Pages)
│   └── api/
│       └── [[path]].ts
├── packages/             # Shared packages
│   ├── config/           # Routes, i18n, site metadata
│   ├── schemas/          # Zod validation schemas
│   ├── types/            # TypeScript types
│   └── mail/             # Mail provider abstraction
├── migrations/           # D1 database migrations
└── wrangler.toml         # Cloudflare Pages configuration
```

---

## Customization

### Route Modes

The template supports configurable article URLs:

- **Flat**: `/on-slowness`
- **Prefixed**: `/posts/on-slowness`

Edit `packages/config/src/routes.ts` to change the default.

### Languages

Add new language folders in `apps/web/src/content/posts/`:

```
posts/
├── en/
├── zh-Hans/
├── zh-Hant/
├── ja/
└── ko/
```

### Cards

Each post can specify card metadata in frontmatter:

```yaml
card:
  kind: article      # article | about
  color: ivory       # ivory | sand | olive | terracotta
  variant: wide      # wide | compact
  rotation: -0.8     # degrees (-5 to +5)
  accent: brown
```

### Styling

Design tokens are in `apps/web/src/styles/tokens.css`:

```css
:root {
  --color-desk-base: #8a5f3e;
  --color-paper-ivory: #f2eadc;
  --color-paper-olive: #6f7564;
  --color-ink: #231b16;
  --shadow-card-rest: 0 12px 24px rgba(26, 16, 8, 0.18);
}
```

### Fonts

Fonts are self-hosted via [fontsource](https://fontsource.org/) packages:

- **Newsreader** (serif) — `@fontsource/newsreader`
- **Cabin** (sans) — `@fontsource/cabin`
- **Monaspace Argon** (code) — `@fontsource/monaspace-argon`

CJK fonts are loaded per-language via system font fallbacks. To customize, update `apps/web/src/styles/fonts.css` and `apps/web/src/styles/global.css`.

---

## Deployment

### Cloudflare (Recommended)

The project deploys as a single Cloudflare Pages site with API functions running at `/api/*`.

#### Option 1: Dashboard Git Connection (Default)

Connect your repository in the Cloudflare Pages dashboard. The project will auto-deploy on every push to `main`.

| Setting | Value |
|---------|-------|
| **Build command** | `pnpm install && pnpm --filter web build` |
| **Build output directory** | `apps/web/dist` |

The `functions/` directory at the repo root is automatically detected by Cloudflare Pages.

#### Option 2: GitHub Actions (Optional)

A deploy workflow is included at `.github/workflows/deploy.yml` but disabled by default. To enable it:

1. Set these secrets in your repository settings:
   ```
   CLOUDFLARE_API_TOKEN
   CLOUDFLARE_ACCOUNT_ID
   ```
2. Uncomment the `push` trigger in `.github/workflows/deploy.yml`
3. Comment out or remove the `workflow_dispatch` trigger

**Note:** Don't enable both dashboard git connection and GitHub Actions — they will conflict.

#### Manual Deployment (CLI)

```bash
# Deploy everything (static site + API functions)
pnpm deploy:cf
```

### Database Setup

```bash
# Apply D1 migrations
wrangler d1 migrations apply DB
```

### Environment Variables

Set these in Cloudflare Pages settings:

```
TURNSTILE_SECRET_KEY
MAIL_PROVIDER_API_KEY
ADMIN_SECRET
ENCRYPTION_KEY
```

---

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Astro dev server |
| `pnpm build` | Build static site |
| `pnpm deploy:cf` | Deploy to Cloudflare Pages (from root) |
| `pnpm check` | Type-check all packages |
| `pnpm test` | Run tests across monorepo |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format all packages |

---

## Development Workflow

### Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production — deployed automatically via Cloudflare Pages |
| `develop` | Integration — merge features here first |
| `feat/*` | Feature work |
| `fix/*` | Bug fixes |

### Workflow

1. Create a branch from `develop`: `git checkout -b feat/my-feature`
2. Make changes, commit with conventional commits (`feat:`, `fix:`, etc.)
3. Push the branch and open a PR to `develop`
4. Merge strategy:
   - **Small fixes** (typo, one-liner, simple bug): squash or rebase for linear history
   - **Major features** (multi-commit, architectural): regular merge to preserve history
5. When ready to release, merge `develop` into `main` via regular merge

**Never commit directly to `main`.**

---

## Philosophy

This template is designed for writers who want:

- A site that feels **personal** and **craft-like**, not corporate
- **Content-first** architecture with real static HTML
- One **deliberate interactive surface** (the desk) rather than SPA complexity
- **Future-proof** configurability (routes, i18n, mail provider)

The desk metaphor is a metaphor for **slow, deliberate curation** — your blog is a physical workspace, not a feed.

---

## License

[MIT](LICENSE)

---

## Acknowledgments

Built with [Astro](https://astro.build), [Hono](https://hono.dev), and [Framer Motion](https://www.framer.com/motion/). Desk concept inspired by physical editorial design.
