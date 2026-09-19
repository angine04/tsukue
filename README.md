# Tsukue

A tactile, editorial blog template built with Astro, React, and Hono. Designed to feel like a physical desk with paper cards scattered across a wooden surface — warm, material, and distinctly personal.

**[Live Demo →](https://tsukue.angine.tech)** (placeholder)

---

## Features

### Working today

- **Tactile Desk Homepage** — Posts as paper cards scattered on a warm wood surface; one card focused at a time, with wheel, drag, dot, and arrow-key navigation that all agree
- **Static-First Architecture** — Cards are real links and articles are real semantic HTML, readable without JavaScript
- **Multilingual Content** — One MDX file per language, grouped by `translationKey`
- **Configurable Routing** — Flat or prefixed post routes, flat or prefixed locale routes
- **Article Partials** — Chrome-free fragments at `/partials/*` for in-app article expansion
- **Card-to-Article Expansion** — A focused card grows into the article sheet as one shared-layout transition, and collapses back on Escape or browser Back
- **One Page Per URL** — Landing on an article or the About page directly gives the same desk with the same sheet open, adopted from the server-rendered markup rather than re-fetched
- **Comments API** — `GET /api/comments` returns approved comments only; `POST /api/comments` validates, verifies Turnstile, rate-limits, detects duplicates and stores everything as _pending_. Addresses are hashed for lookup and encrypted for sending; IPs are salted-hashed, never stored raw
- **Comment Thread** — A reader-facing thread and form at the foot of every article sheet, inside the same island, so it works the same whether the card was clicked or the URL was opened directly. Bodies render as plain text with only `http(s)` links linkified; nothing a reader types can become markup
- **Moderation Dashboard** — A queue at `/admin` for approving, hiding, deleting and marking comments as spam, plus replies published as the site author. Every action is written to an audit log, and the API behind it refuses anything unauthenticated
- **SEO** — Canonical URLs, `hreflang` alternates, RSS, sitemap, and robots.txt
- **Build-Time Content Validation** — Reserved slugs, conflicting routes, duplicate translation pairs, unsupported language tags, and drafts fail the build
- **CSS-Only Textures** — Paper grain and wood grain drawn with gradients; the site requests no texture images
- **Reduced Motion** — Desk scatter and sheet transitions respect `prefers-reduced-motion`

### Planned

- **Newsletter** — Double opt-in subscription with unsubscribe support, and subscriber management in the dashboard
- **Reader Replies** — The API and schema support replies one level deep and the dashboard publishes the author's; readers have no reply control yet
- **Reply notifications** — A reply is stored and displayed, but nobody is emailed about it yet

## Tech Stack

| Layer       | Technology                                        |
| ----------- | ------------------------------------------------- |
| **Site**    | Astro 6, React 19, Tailwind CSS v4, Framer Motion |
| **Backend** | Hono, Cloudflare Pages Functions, D1              |
| **Content** | MDX, Astro Content Collections                    |
| **Mail**    | Provider-agnostic adapter (pluggable)             |
| **Spam**    | Cloudflare Turnstile                              |
| **Package** | pnpm workspaces                                   |

---

## Quick Start

### Prerequisites

- Node.js `>=22.12.0`
- pnpm (`npm install -g pnpm`)

### 1. Use this template

```bash
# Clone the template
git clone https://github.com/angine04/tsukue.git my-blog
cd my-blog

# Install dependencies
pnpm install
```

**If you are forking this for your own site**, change the two resource names in
`wrangler.toml` before deploying. They are the template's, and deploying with
them unchanged would target the template's own Pages project and database:

```toml
name = "your-project-name"          # also your *.pages.dev subdomain
[[d1_databases]]
database_name = "your-db-name"
database_id = "<your database id>"  # from `wrangler d1 create`
```

Create your own with `wrangler pages project create` and `wrangler d1 create`.
The project name is permanent — it becomes your `*.pages.dev` subdomain and
Cloudflare cannot rename it, so pick it deliberately.

### 2. Configure your site

Edit `packages/config/src/site.ts`:

```typescript
export const SITE_NAME = "Your Blog";
export const SITE_DESCRIPTION = "Your tagline.";
export const SITE_URL = "https://yourdomain.com"; // must match the deployed domain
export const AUTHOR_NAME = "Your Name";
export const AUTHOR_ROLE = "Writer & Engineer";
```

These five constants are the whole of your site's identity in code: they feed
the wordmark, the About name card, page titles, canonical URLs, the sitemap and
RSS. Nothing else in the repository names your site — which means a fork is
this file plus the two Cloudflare resource names below.

### 3. Add your content

Create MDX files in `apps/web/src/content/posts/en/` (or other language folders):

```yaml
---
title: "On Slowness in a Fast World"
description: "A short essay about speed, attention, and deliberate work."
date: 2026-05-28
lang: en
translationKey: on-slowness-in-a-fast-world
slug: on-slowness

draft: false
tags: [essays, attention]

card:
  kind: article
  color: ivory
  variant: wide
  rotation: -0.8
  accent: brown
---
Your article content here.
```

Everything except the `card` block is required. The schema is strict, so an
unrecognised key fails the build rather than being ignored — a typo in
`translationKey` or `card.color` is an error, not a silently defaulted card.
The file must also live at `src/content/posts/<lang>/<slug>.mdx`.

### 4. Run locally

Two processes, because Cloudflare Pages Functions are not part of the Astro dev
server — `astro dev` renders pages, `wrangler pages dev` runs `/api/*` against
your local D1.

```bash
# Terminal 1 — pages, with fast refresh
pnpm dev

# Terminal 2 — the API and local D1 on :8788
pnpm dev:api
```

`pnpm dev` proxies `/api/*` to `:8788` (see `astro.config.mjs`), so the browser
only ever talks to the Astro origin and comments work in development. Override
the port with `API_DEV_PORT` if you move it.

Running `pnpm dev` alone is fine for layout and content work: `/api/*` will fail
to connect, which the comment section tolerates rather than breaking the page.

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
│   ├── comments/         # Comment API, D1 queries, Turnstile, hashing
│   └── mail/             # Mail provider abstraction
├── migrations/           # D1 database migrations
└── wrangler.toml         # Cloudflare Pages configuration
```

`functions/` holds one file because every file there becomes a route. The
comment API lives in `packages/api` and is mounted by that entry point,
which also keeps it testable without a running Worker.

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
  kind: article # article | about
  color: ivory # ivory | sand | olive | terracotta
  variant: wide # wide | compact
  rotation: -0.8 # degrees (-5 to +5)
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

| Setting                    | Value                                     |
| -------------------------- | ----------------------------------------- |
| **Build command**          | `pnpm install && pnpm --filter web build` |
| **Build output directory** | `apps/web/dist`                           |

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

### Protecting the admin dashboard

`/admin` and `/api/admin/*` must both be covered. Covering only the page leaves
the API reachable — the dashboard is just a client for it:

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Add an
   application → Self-hosted**.
2. Add two paths on your domain: `/admin` and `/api/admin/*`.
3. Add a policy allowing only your email address.
4. Copy the application's **Audience tag** into `ACCESS_AUD`, and your team
   domain into `ACCESS_TEAM_DOMAIN`.

The API verifies the Access JWT itself rather than trusting that the request
arrived through Access, so a route left uncovered is refused rather than
treated as authenticated. It checks the signature, the issuer, the expiry and
the audience, and it will not accept an `alg: none` token.

Without `ACCESS_TEAM_DOMAIN` it falls back to `ADMIN_TOKEN`; without either it
**refuses every admin request**, which is deliberate — an admin API that is
open because authentication was never finished is the worst default.

### Database Setup

```bash
# Apply D1 migrations to your local development database
wrangler d1 migrations apply DB --local

# Apply them to the deployed database
wrangler d1 migrations apply DB --remote
```

The `DB` binding is declared in `wrangler.toml`. Comment storage needs migrations
`0001`, `0004`; newsletter needs `0002`; the admin audit log needs `0003`.

### Environment Variables

`PUBLIC_TURNSTILE_SITE_KEY` is a **build-time** variable, supplied by whoever
builds the site (in `.env`, which `astro.config.mjs` points Vite at). It is
public — the comment form embeds it — and no Function reads it, so it is not a
Pages secret. Without it the comment form is replaced by a notice and no request
is made to Cloudflare.

Everything else is a runtime secret:

```bash
wrangler pages secret put TURNSTILE_SECRET --project-name=tsukue
wrangler pages secret put HASH_SALT --project-name=tsukue
wrangler pages secret put EMAIL_ENCRYPTION_KEY --project-name=tsukue
wrangler pages secret put ADMIN_EMAIL --project-name=tsukue
# If using Cloudflare Access instead of a shared token:
wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name=tsukue
wrangler pages secret put ACCESS_AUD --project-name=tsukue
wrangler pages secret put MAIL_ENDPOINT --project-name=tsukue   # if sending mail
wrangler pages secret put MAIL_TOKEN --project-name=tsukue      # if the endpoint needs one
wrangler pages secret put MAIL_FROM --project-name=tsukue       # if sending mail
```

| Variable               | Required                  | Purpose                                                                                                                                                                                  |
| ---------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURNSTILE_SECRET`     | For comments              | Server-side verification. Without it **every submission is refused** — the check fails closed rather than open.                                                                          |
| `HASH_SALT`            | For comments              | Salt for the IP / user-agent / address lookup hashes. Without it submissions are refused, so a deployment cannot silently skip rate limiting. Rotating it invalidates every stored hash. |
| `EMAIL_ENCRYPTION_KEY` | For notifications         | Base64 32-byte AES-GCM key. Addresses are hashed for lookup and encrypted for sending; without this key addresses are not stored at all.                                                 |
| `ACCESS_TEAM_DOMAIN`   | For `/admin`              | Your Access team domain, e.g. `yourteam.cloudflareaccess.com`. With `ACCESS_AUD`, the admin API verifies Cloudflare Access JWTs itself.                                                  |
| `ACCESS_AUD`           | For `/admin`              | The Access application's Audience tag.                                                                                                                                                   |
| `ADMIN_TOKEN`          | For `/admin`              | Shared secret accepted as a bearer token. The fallback when Access is not used, and how you reach the admin API locally. Without either, `/api/admin/*` refuses everything.              |
| `ADMIN_EMAIL`          | For notifications         | Where "a comment is waiting" is sent. Unset means no notification, not a failure.                                                                                                        |
| `MAIL_PROVIDER`        | For mail                  | Which adapter sends: `http` (any JSON endpoint) or `resend`. Unset means no mail is sent, which is a valid state.                                                                        |
| `MAIL_FROM`            | For mail                  | The sender every provider needs, e.g. `Tsukue <comments@notify.example.com>`.                                                                                                            |
| `MAIL_TOKEN`           | For mail                  | The credential, whatever the provider calls it — bearer token for `http`, API key (`re_…`) for `resend`.                                                                                 |
| `MAIL_ENDPOINT`        | With `MAIL_PROVIDER=http` | The URL that accepts `{ to, from, subject, html, text, headers }` as JSON.                                                                                                               |

Mail is provider-agnostic: all the adapters read the same three variables, so
choosing a provider is a configuration change and not a code change. Adding one
that is not listed is an adapter beside the others in `packages/mail/src/providers`
plus a branch in the factory — the factory refuses an unknown name rather than
quietly sending nothing.

For local development the two halves come from different files, because they are
read at different times:

- **`.dev.vars`** (gitignored) for the runtime secrets above — Wrangler reads it
  in place of the deployed ones.
- **`.env`** (gitignored) for `PUBLIC_TURNSTILE_SITE_KEY` — the Astro build reads
  it, and no Function can see it.

Turnstile publishes a test pair that needs no account: site key
`1x00000000000000000000AA` with secret
`1x0000000000000000000000000000000AA` always passes, and secret `2x…` always
fails, which is how the rejection path is exercised without a real widget.

---

## Commands

| Command          | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `pnpm dev`       | Start Astro dev server                                   |
| `pnpm dev:api`   | Build, then serve static + Functions + local D1 on :8788 |
| `pnpm build`     | Build static site                                        |
| `pnpm deploy:cf` | Deploy to Cloudflare Pages (from root)                   |
| `pnpm check`     | Type-check all packages                                  |
| `pnpm test`      | Run unit tests across the monorepo                       |
| `pnpm lint`      | Lint all packages                                        |
| `pnpm format`    | Format all packages                                      |

### Browser tests

`apps/web` has a Playwright suite (`pnpm --filter web test:e2e`) covering the
desk, the article routes, the comment form and admin protection. It needs two
things beyond a checkout:

```bash
pnpm --filter web exec playwright install chromium   # once per machine
# and a .dev.vars, which the API reads for Turnstile, HASH_SALT and ADMIN_TOKEN
```

It builds the site and serves it through `wrangler pages dev`, so the Functions
and a local D1 are in the request path — the same shape as a deployment, which a
dev server would not be.

Two things to expect when running it repeatedly against the same local database:
submissions are rate-limited per source, and an identical comment is refused
within the hour. The suite uses a unique body for that reason, and will start
failing on the rate limit after five runs in ten minutes rather than on a bug.

---

## Development Workflow

### Branches

| Branch    | Purpose                                                  |
| --------- | -------------------------------------------------------- |
| `main`    | Production — deployed automatically via Cloudflare Pages |
| `develop` | Integration — merge features here first                  |
| `feat/*`  | Feature work                                             |
| `fix/*`   | Bug fixes                                                |

### Workflow

1. Create a branch from `develop`: `git checkout -b feat/my-feature`
2. Make changes, commit with conventional commits (`feat:`, `fix:`, etc.)
3. Push the branch and open a PR to `develop`
4. Merge strategy:
   - **Small fixes** (typo, one-liner, simple bug): squash or rebase for linear history
   - **Major features** (multi-commit, architectural): regular merge to preserve history
5. When ready to release, open a PR from `develop` → `main` and merge with regular merge

**Never commit directly to `main`.** Branch protection requires all changes go through PRs.

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
