# Angine Blog

A tactile, editorial blog template built with Astro, React, and Hono. Designed to feel like a physical desk with paper cards scattered across a wooden surface — warm, material, and distinctly personal.

**[Live Demo →](https://angineblog.com)** (placeholder)

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
| **Backend** | Hono, Cloudflare Workers, D1 |
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
git clone https://github.com/angine/angineblog.git my-blog
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
# Start the web app
pnpm dev:web

# Start the API (in another terminal)
pnpm dev:api
```

### 5. Build for production

```bash
# Build the static site
pnpm build:web

# Build the API
pnpm build:api
```

---

## Project Structure

```
angineblog/
├── apps/
│   ├── web/              # Astro frontend (desk UI, articles, admin)
│   └── api/              # Hono backend (comments, newsletter, admin)
├── packages/
│   ├── config/           # Shared config (routes, i18n, fonts, site)
│   ├── schemas/          # Zod validation schemas
│   ├── types/            # TypeScript interfaces
│   └── mail/             # Mail provider abstraction
├── migrations/           # D1 database migrations
├── pnpm-workspace.yaml   # pnpm monorepo config
└── package.json          # Root scripts
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

Latin fonts are self-hosted (Newsreader + Cabin). CJK fonts are loaded per-language. Update `apps/web/src/styles/fonts.css` and `packages/config/src/fonts.ts`.

---

## Deployment

### Cloudflare (Recommended)

```bash
# Deploy web app to Cloudflare Pages
pnpm deploy:web

# Deploy API to Cloudflare Workers
pnpm deploy:api
```

### Database Setup

```bash
# Apply migrations
pnpm --filter api db:migrate
```

### Environment Variables

Set these in Cloudflare Workers secrets:

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
| `pnpm dev:web` | Start Astro dev server |
| `pnpm dev:api` | Start Hono dev server |
| `pnpm build:web` | Build static site |
| `pnpm build:api` | Build API worker |
| `pnpm deploy:web` | Deploy to Cloudflare Pages |
| `pnpm deploy:api` | Deploy to Cloudflare Workers |
| `pnpm check` | Type-check all packages |
| `pnpm test` | Run tests across monorepo |

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
