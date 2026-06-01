# AGENTS.md

This file defines project rules for AI coding agents working on this repository.

The project is a tactile, desk-themed personal blog. The site is primarily static, SEO-safe, and content-driven, with one highly interactive homepage/card-reading interface and a small serverless backend for comments, admin moderation, and mail notifications.

Follow this document unless the user explicitly overrides it.

---

# 1. Project Summary

## 1.1 Product concept

This is a personal blog / essay site.

The homepage is not a conventional post list. It is an interactive “writing desk” interface:

- The viewport shows a stylized desk surface from above.
- Blog posts appear as physical paper/article cards scattered across the desk.
- Cards are arranged in a horizontally scrollable rail.
- One card is focused at a time.
- Non-focused cards may rotate slightly and appear casually scattered.
- The focused card should be emphasized through alignment, clarity, contrast, and shadow, not by becoming much larger.
- Clicking the focused card expands it into a full article sheet.
- Clicking a non-focused card should focus it first.
- The article expansion should feel like the card becoming the article, not like a hard page transition.
- The About page appears as a special business/name card.

The visual direction is:

```text
tactile
editorial
warm
paper-like
desk-like
material but not photorealistic
CSS-achievable
````

Avoid:

```text
generic minimalism
flat card grids
overly realistic 3D
Three.js/WebGL dependency for v1
heavy skeuomorphic decoration
```

---

# 2. Core Stack

Use this stack unless explicitly changed:

```text
Package manager: pnpm
Site framework: Astro
Content: Astro Content Collections + MDX
Interactive UI: React island
Animation: Framer Motion / Motion
Styling: Tailwind + custom CSS
Backend: Hono
Runtime: Cloudflare Workers
Static hosting: Cloudflare Pages
Database: Cloudflare D1
Spam protection: Cloudflare Turnstile
Admin protection: Cloudflare Access preferred
Mail: provider adapter, not hardcoded
```

## 2.1 Important architectural split

Keep the project split into four conceptual planes:

```text
Astro owns content and routes.
React owns the desk interaction.
Hono owns dynamic APIs.
Cloudflare owns deployment/runtime primitives.
```

Do not blur this boundary without a strong reason.

---

# 3. Non-Negotiable Architecture Rules

## 3.1 Articles must remain static and SEO-safe

Article routes must render real semantic HTML at build time.

Good:

```text
/[slug] or /posts/[slug]
  Astro-rendered page
  real title
  real metadata
  real <article>
  readable without JavaScript
```

Bad:

```text
/[slug]
  empty app shell
  article body loaded only after client JS
```

No-JS article reading must work.

## 3.2 The React desk app is progressive enhancement

The React island may create:

* horizontal card rail
* card focus state
* card-to-article expansion
* History API URL sync
* comments UI
* article partial loading

But the canonical article content still comes from Astro-rendered MDX.

## 3.3 Do not require Three.js for v1

The intended v1 visual effect should be achievable with:

```text
Tailwind
CSS variables
CSS gradients
SVG noise
pseudo-elements
box-shadow
2D transforms
Framer Motion layout animation
```

Do not add Three.js, WebGL, React Three Fiber, or shader-based rendering unless explicitly requested.

## 3.4 MDX is the source of truth

MDX files are the source of truth for article content.

Do not duplicate long article bodies in JSON manually.

For in-app article expansion, prefer fetching Astro-rendered HTML partials over serializing MDX body into JSON.

---

# 4. Routing Strategy

The project should support configurable route modes.

Do not hardcode article URLs throughout the codebase. Always use route helper functions.

## 4.1 Route modes

Supported route modes should include:

```ts
type PostRouteMode = "flat" | "prefixed";
```

Examples:

```text
flat:
  /on-slowness

prefixed:
  /posts/on-slowness
```

Default preference: `flat`.

## 4.2 Locale route modes

The project may support multilingual versions of the same article.

Supported locale route modes should include:

```ts
type LocaleRouteMode =
  | "flat-default-lang"
  | "prefixed-all"
  | "prefixed-non-default";
```

Recommended default:

```text
default language:
  /on-slowness

non-default languages:
  /zh-Hans/slow-in-fast-world
  /ja/slowness-in-fast-world
```

Avoid `flat-all` for multilingual content because it creates avoidable slug collisions.

## 4.3 Reserved slugs

Flat routes require reserved slugs.

Maintain a central reserved slug list.

Example:

```ts
export const RESERVED_SLUGS = new Set([
  "about",
  "admin",
  "api",
  "partials",
  "data",
  "rss.xml",
  "sitemap.xml",
  "feed",
  "tags",
  "archive",
  "search",
  "assets",
  "robots.txt",
]);
```

Build should fail if any MDX post uses a reserved slug.

## 4.4 Route helper example

Create route helpers similar to:

```ts
export function postPath(post: {
  slug: string;
  lang: string;
}): string {
  // Use routeConfig and i18nConfig.
}

export function postPartialPath(post: {
  slug: string;
  lang: string;
}): string {
  // Use routeConfig and i18nConfig.
}

export function aboutPath(lang?: string): string {
  // Return localized or default about path.
}
```

All links must use helpers. Do not manually write `/${slug}` or `/posts/${slug}` inside components.

---

# 5. Content Model

## 5.1 One MDX file per language version

Do not put multiple language versions inside one MDX file.

Use:

```text
src/content/posts/
├─ en/
│  └─ on-slowness.mdx
├─ zh-Hans/
│  └─ slow-in-fast-world.mdx
├─ zh-Hant/
│  └─ slow-in-fast-world.mdx
├─ ja/
│  └─ slowness-in-fast-world.mdx
└─ ko/
   └─ slowness-in-fast-world.mdx
```

Each file has its own `lang`, `slug`, title, description, and body.

## 5.2 Required frontmatter

Every post should include:

```yaml
title:
description:
date:
lang:
translationKey:
slug:
```

Recommended full frontmatter:

```yaml
title: On Slowness in a Fast World
description: A short essay about speed, attention, and deliberate work.
date: 2026-05-28
updated: 2026-05-28

lang: en
translationKey: on-slowness-in-a-fast-world
slug: on-slowness

draft: false
tags:
  - essays
  - attention

card:
  kind: article
  color: ivory
  variant: wide
  rotation: -0.8
  accent: brown
```

For translations:

```yaml
title: 在快速世界中保持缓慢
description: 一篇关于速度、注意力与有意识工作的短文。
date: 2026-05-28
updated: 2026-05-28

lang: zh-Hans
translationKey: on-slowness-in-a-fast-world
slug: slow-in-fast-world

translation:
  sourceLang: en
  status: human
```

## 5.3 Meaning of multilingual fields

```text
lang:
  Language tag of this specific file.

slug:
  URL segment of this specific language version.

translationKey:
  Stable cross-language identity shared by all translations.
```

Do not use `slug` as translation identity.

## 5.4 Language tags

Use BCP 47 language tags, not vague CJK grouping.

Preferred examples:

```text
en
en-US
zh-Hans
zh-Hant
zh-CN
zh-TW
ja
ja-JP
ko
ko-KR
```

Do not use a generic `cjk` language category.

## 5.5 About page

The About page is special.

It should have:

* a canonical static route
* a desk card representation
* a business/name-card visual style

The desk card should not look like a normal article card.

Example card metadata:

```yaml
card:
  kind: about
  variant: name-card
  color: warm-paper
```

---

# 6. SEO Requirements

## 6.1 Every article page must render metadata

Every article route must include:

```html
<title>...</title>
<meta name="description" content="...">
<link rel="canonical" href="...">
<article>
  <h1>...</h1>
  ...
</article>
```

## 6.2 Multilingual SEO

For translations, automatically group posts by `translationKey` and generate:

```html
<link rel="alternate" hreflang="en" href="...">
<link rel="alternate" hreflang="zh-Hans" href="...">
<link rel="alternate" hreflang="ja" href="...">
<link rel="alternate" hreflang="x-default" href="...">
```

Set the correct language:

```html
<html lang="zh-Hans">
```

or, where appropriate:

```html
<article lang="zh-Hans">
```

## 6.3 Sitemap and RSS

Generate:

```text
/sitemap.xml
/rss.xml
```

RSS should include canonical article URLs. If multilingual RSS becomes complex, start with default language only, then extend later.

---

# 7. Article Partials

## 7.1 Purpose

Article partials are used by the React desk app for seamless card-to-article expansion.

They are enhancement payloads, not canonical article pages.

Example routes:

```text
/partials/on-slowness
/zh-Hans/partials/slow-in-fast-world
```

or another route shape determined by route config.

## 7.2 Partial output

A partial should return rendered article inner HTML or a compact article fragment.

It should not include full document chrome:

```html
<article class="article-content" lang="en">
  <h1>...</h1>
  ...
</article>
```

No duplicated `<html>`, `<head>`, or global layout.

## 7.3 MDX complexity

If an MDX post uses interactive components, be careful with partial fetching.

Default rule:

```text
Static MDX components are fine.
Interactive MDX islands require explicit design.
Do not blindly inject arbitrary client-only MDX behavior through fetched HTML.
```

---

# 8. Desk UI Behavior

## 8.1 Core interaction rules

Use this behavior unless changed:

```text
click non-focused card:
  focus that card

click focused article card:
  expand into article

click About name card:
  expand into About sheet or navigate to About mode

ArrowLeft / ArrowRight:
  change focused card

Enter:
  open focused card

Escape:
  close article/about sheet

Browser Back from article mode:
  collapse article to desk when appropriate

Browser Forward:
  restore article mode when appropriate
```

## 8.2 Card sizing

Cards should be roughly the same size family.

The focused card should not become dramatically larger than other cards.

Emphasis should come from:

```text
near-straight rotation
higher text clarity
slightly stronger shadow
higher contrast
higher z-index
less cropping
```

Not from large scale.

## 8.3 Card shapes

Cards may vary slightly:

```text
wide article card
compact article card
name card
note card
```

But avoid extreme size differences in the main carousel.

## 8.4 Scattered effect

Non-focused cards may rotate slightly.

Reasonable rotation range:

```text
-5deg to +5deg
```

Focused card rotation should be near:

```text
-0.5deg to +0.5deg
```

Prefer deterministic rotations from frontmatter or a slug-based seed. Do not use unstable random rotations on each render.

## 8.5 Scroll behavior

The homepage may map vertical scroll or wheel input to horizontal card movement.

Avoid aggressive scroll-jacking.

Preferred:

```text
native-feeling wheel/trackpad behavior
horizontal rail state
snap-to-focused-card
clear keyboard fallback
touch-friendly mobile behavior
```

## 8.6 Mobile behavior

Mobile should simplify the layout.

Recommended mobile behavior:

```text
horizontal snap carousel
less rotation
fewer overlapping cards
larger tap targets
same article expansion model if stable
fallback to normal article route if needed
```

Do not force a complex desktop desk layout onto small screens.

---

# 9. Animation Rules

## 9.1 Use Framer Motion / Motion

Use Framer Motion for:

```text
shared layout transitions
card-to-article expansion
article sheet entry/exit
focus change animation
```

Typical pattern:

```tsx
<motion.article layoutId={`post-card-${post.translationKey}-${post.lang}`}>
  ...
</motion.article>
```

Expanded article:

```tsx
<motion.article layoutId={`post-card-${post.translationKey}-${post.lang}`}>
  ...
</motion.article>
```

## 9.2 Reduced motion

Always support reduced motion.

If the user prefers reduced motion:

```text
disable large transform animations
use opacity/fade or instant state changes
preserve navigation correctness
```

CSS:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto;
  }
}
```

React should also check reduced motion where needed.

## 9.3 URL sync

Opening a card should update the URL with `history.pushState`.

Closing via UI may return to `/` or language-specific home depending on route config.

Browser back should feel natural.

Do not break normal browser navigation.

---

# 10. Styling System

## 10.1 Tailwind usage

Use Tailwind for:

```text
layout
spacing
typographic scale
responsive utilities
admin dashboard UI
forms
basic article layout
```

Do not force every material effect into Tailwind utility classes.

Use custom CSS for:

```text
desk texture
paper texture
noise overlays
card shadows
card transforms
article sheet material
scroll rail
motion layout primitives
```

## 10.2 CSS file structure

Recommended:

```text
src/styles/
├─ global.css
├─ tokens.css
├─ fonts.css
├─ desk.css
├─ cards.css
├─ article.css
├─ mdx.css
└─ admin.css
```

## 10.3 Design tokens

Use CSS variables for design tokens:

```css
:root {
  --color-desk-base: #8a5f3e;
  --color-paper-ivory: #f2eadc;
  --color-paper-sand: #d9c5a5;
  --color-paper-olive: #6f7564;
  --color-paper-terracotta: #a15f3d;
  --color-ink: #231b16;
  --color-muted: #6f6258;
  --color-accent: #7a2f22;

  --shadow-card-rest: 0 12px 24px rgba(26, 16, 8, 0.18);
  --shadow-card-focus: 0 18px 38px rgba(26, 16, 8, 0.24);
}
```

## 10.4 Texture rules

Textures should be subtle.

Use:

```text
SVG feTurbulence
CSS gradients
small static WebP/PNG noise assets
pseudo-element overlays
```

Do not rely on large photorealistic images for the core UI.

Card paper texture should be built from:

```text
base color
+ subtle noise
+ faint directional fiber
+ soft edge treatment
+ CSS shadow
```

Desk texture should be:

```text
warm
low contrast
stylized
not noisy
not photorealistic
```

---

# 11. Font System

## 11.1 Chosen fonts

Primary fonts:

```text
Serif: Newsreader
Sans: Cabin
```

International fallback:

```text
Simplified Chinese: Noto Serif SC, Noto Sans SC
Traditional Chinese: Noto Serif TC, Noto Sans TC
Japanese: Noto Serif JP, Noto Sans JP
Korean: Noto Serif KR, Noto Sans KR
```

Do not use one generic CJK font variable.

## 11.2 CSS variables

Use language-specific variables.

Example:

```css
:root {
  --font-serif-latin: "Newsreader", "Noto Serif", serif;
  --font-sans-latin: "Cabin", "Noto Sans", system-ui, sans-serif;

  --font-serif-zh-hans: "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  --font-sans-zh-hans: "Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif;

  --font-serif-zh-hant: "Noto Serif TC", "Source Han Serif TC", "Songti TC", serif;
  --font-sans-zh-hant: "Noto Sans TC", "Source Han Sans TC", "PingFang TC", sans-serif;

  --font-serif-ja: "Noto Serif JP", "Source Han Serif JP", "Yu Mincho", serif;
  --font-sans-ja: "Noto Sans JP", "Source Han Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;

  --font-serif-ko: "Noto Serif KR", "Source Han Serif KR", serif;
  --font-sans-ko: "Noto Sans KR", "Source Han Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;

  --font-serif: var(--font-serif-latin);
  --font-sans: var(--font-sans-latin);
  --font-code: "Monaspace Argon", ui-monospace, monospace;
}

:lang(en) {
  --font-serif: var(--font-serif-latin);
  --font-sans: var(--font-sans-latin);
}

:lang(zh-Hans),
:lang(zh-CN),
:lang(zh-SG) {
  --font-serif: var(--font-serif-zh-hans);
  --font-sans: var(--font-sans-zh-hans);
}

:lang(zh-Hant),
:lang(zh-TW),
:lang(zh-HK),
:lang(zh-MO) {
  --font-serif: var(--font-serif-zh-hant);
  --font-sans: var(--font-sans-zh-hant);
}

:lang(ja),
:lang(ja-JP) {
  --font-serif: var(--font-serif-ja);
  --font-sans: var(--font-sans-ja);
}

:lang(ko),
:lang(ko-KR) {
  --font-serif: var(--font-serif-ko);
  --font-sans: var(--font-sans-ko);
}
```

## 11.3 Tailwind font mapping

Tailwind should reference active variables:

```ts
fontFamily: {
  sans: ["var(--font-sans)"],
  serif: ["var(--font-serif)"],
  mono: ["var(--font-code)"],
}
```

# 11.4 UI Strings Internationalization

All UI strings are centralized in `packages/config/src/ui/` and use type-safe keys.

## 11.4.1 Dictionary Structure

Each language has a flat dictionary with dot-separated keys:

```typescript
// packages/config/src/ui/en.ts
export const en: UIDictionary = {
  "nav.home": "Home",
  "nav.about": "About",
  "desk.readArticle": "Read article",
  "comment.submit": "Submit",
  // ...
};
```

Supported languages: `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`.

## 11.4.2 Usage in React Components

Import the `useI18n` hook and pass the `lang` prop:

```typescript
import { useI18n } from "../../hooks/useI18n";

interface MyComponentProps {
  lang?: string;
}

export default function MyComponent({ lang = "en" }: MyComponentProps) {
  const { t } = useI18n(lang);
  return <button>{t("comment.submit")}</button>;
}
```

## 11.4.3 Usage in Astro Pages

Pass the `lang` prop to React island components:

```astro
---
import MyComponent from "../components/MyComponent";
---

<MyComponent client:load lang="en" />
```

## 11.4.4 Adding New Strings

1. Add the key to `packages/config/src/ui/types.ts` in the `UIDictionary` interface
2. Add the English value to `packages/config/src/ui/en.ts`
3. Add translations to other language files (zh-Hans.ts, ja.ts, etc.)
4. Use in components with `t("your.new.key")`

## 11.4.5 Adding New Languages

1. Create `packages/config/src/ui/{lang}.ts`
2. Import and register it in `packages/config/src/ui.ts`
3. All components automatically support the new language

---

# 12. Backend Architecture

## 12.1 Hono owns dynamic behavior

Use Hono for:

```text
comments
comment moderation
admin API
mail notifications
newsletter subscription
unsubscribe endpoints
health checks
```

## 12.2 Database

Use Cloudflare D1 by default.

Keep schema migrations in the repo.

Recommended directory:

```text
migrations/
├─ 0001_comments.sql
├─ 0002_newsletter.sql
└─ 0003_admin_audit_log.sql
```

## 12.3 Validation

Use Zod for request validation.

Rules:

```text
Validate all incoming JSON.
Validate all query parameters.
Validate all route params.
Never trust client input.
Return structured errors.
```

Example response shape:

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

---

# 13. Comments System

## 13.1 Comment model

Recommended statuses:

```text
pending
approved
hidden
deleted
spam
```

Use soft deletion by default.

## 13.2 Minimal schema

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  lang TEXT,
  parent_id TEXT,
  author_name TEXT NOT NULL,
  author_email_hash TEXT,
  author_email_encrypted TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE INDEX idx_comments_slug_status_created
ON comments (slug, status, created_at);

CREATE INDEX idx_comments_status_created
ON comments (status, created_at);
```

## 13.3 Public API

```text
GET  /api/comments?slug=...
POST /api/comments
POST /api/comments/:id/report
```

Public `GET` returns only approved comments.

Public `POST` should:

```text
validate Turnstile
validate body
rate-limit
sanitize content
store as pending
notify admin
return success without exposing internal moderation detail
```

## 13.4 Admin API

```text
GET  /api/admin/comments?status=pending
POST /api/admin/comments/:id/approve
POST /api/admin/comments/:id/hide
POST /api/admin/comments/:id/delete
POST /api/admin/comments/:id/spam
POST /api/admin/comments/:id/reply
```

Admin endpoints must be protected.

Preferred protection:

```text
Cloudflare Access
```

Fallback:

```text
signed session cookie
admin password
strict CSRF protection
```

Do not build complex multi-user auth unless requested.

## 13.5 Comment rendering

Render comment text safely.

Do not render raw HTML from users.

Preferred:

```text
plain text
line breaks preserved
links auto-linked only after sanitization
```

Avoid Markdown comments in v1 unless explicitly needed.

---

# 14. Spam and Abuse Protection

Use layered protection:

```text
Cloudflare Turnstile
rate limiting
pending moderation
IP/user-agent hashing
honeypot field
max length limits
duplicate detection
manual moderation
```

Do not auto-publish comments in v1.

Recommended limits:

```text
author name: 1–80 chars
comment body: 1–4000 chars
max links: 2
```

Never store raw IP addresses unless explicitly required.

Prefer salted hashes.

---

# 15. Mail System

## 15.1 Provider-agnostic design

Do not hardcode Resend, Postmark, Mailgun, SES, or any provider directly into business logic.

Use a mail adapter interface:

```ts
export interface MailProvider {
  send(input: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<void>;
}
```

Implement providers behind adapters:

```text
ResendMailProvider
PostmarkMailProvider
MailgunMailProvider
SesMailProvider
CustomHttpMailProvider
```

## 15.2 Sending domain

The user may already use a custom domain with another mail service.

Prefer sending blog/system mail from a subdomain:

```text
comments@notify.example.com
newsletter@updates.example.com
bot@notify.example.com
```

Do not assume root-domain mail DNS can be changed freely.

## 15.3 Mail categories

Separate:

```text
admin notifications
comment reply notifications
newsletter emails
```

They have different unsubscribe semantics.

## 15.4 Admin notifications

Admin notifications do not need unsubscribe.

Example:

```text
New comment awaiting moderation
```

## 15.5 Comment reply notifications

Comment reply notifications need unsubscribe links.

Each mail should include:

```text
unsubscribe from this thread
unsubscribe from all comment notifications
```

## 15.6 Newsletter

Newsletter should be serverless in this project.

Use:

```text
Hono
D1 subscriber table
mail provider adapter
unsubscribe endpoint
admin send endpoint
```

Do not introduce listmonk, Keila, Mailcoach, or Mautic into v1. They are useful but not serverless in the intended deployment model.

## 15.7 Newsletter schema

```sql
CREATE TABLE newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email_encrypted TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  confirm_token TEXT,
  unsubscribe_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);
```

Recommended statuses:

```text
pending
active
unsubscribed
bounced
complained
```

## 15.8 Unsubscribe headers

Emails that need unsubscribe should include:

```text
List-Unsubscribe
List-Unsubscribe-Post
```

Also include a visible unsubscribe link in the email body.

---

# 16. Admin Dashboard

## 16.1 Admin scope

The admin dashboard should support:

```text
view pending comments
approve comments
hide comments
delete comments
mark spam
reply to comments
view recent approved comments
view reported comments
manage newsletter subscribers
send newsletter manually
view basic mail send logs
```

## 16.2 Admin route

Default route:

```text
/admin
```

Protect with Cloudflare Access if possible.

## 16.3 Admin UI implementation

Admin can be:

```text
Astro page
+ React island for dynamic table/forms
+ Hono API calls
```

Use Tailwind heavily here. The admin dashboard does not need the tactile desk visual system.

Admin should be plain, efficient, and reliable.

---

# 17. Security Rules

## 17.1 Never trust user input

Validate and sanitize:

```text
comment body
author name
email
slug
lang
admin actions
newsletter inputs
unsubscribe tokens
```

## 17.2 Secrets

Never commit:

```text
API keys
mail tokens
Turnstile secrets
D1 credentials
admin passwords
encryption keys
```

Use environment variables / Cloudflare secrets.

## 17.3 Email storage

Avoid storing raw email addresses.

Recommended:

```text
email_hash for lookup
email_encrypted for sending
```

Use stable normalized email before hashing.

## 17.4 CSRF

For admin mutation endpoints, use one of:

```text
Cloudflare Access + same-site cookies + origin checks
CSRF tokens if using custom auth
```

## 17.5 Content injection

Do not insert unsanitized HTML into the page.

Article partial HTML is trusted because it is generated from local MDX.

Comment HTML is not trusted.

---

# 18. Accessibility Requirements

The desk interface is unconventional. Accessibility must be conservative.

Required:

```text
semantic links for cards
keyboard navigation
visible focus states
Escape closes article overlay
Enter opens focused card
reduced-motion support
screen-reader-readable article content
sufficient color contrast
large enough tap targets
no keyboard traps
```

Cards should remain real links:

```html
<a href="/on-slowness">...</a>
```

React may intercept the click for enhanced animation, but the link must remain valid.

---

# 19. Performance Requirements

## 19.1 Static-first

The site should be fast without JavaScript.

Article pages should load as static HTML.

## 19.2 Hydration budget

Hydrate only what needs interactivity:

```text
DeskApp
Comment form/list
Admin dashboard
```

Do not hydrate the entire site.

## 19.3 Images and textures

Use:

```text
small SVG textures
small WebP/PNG noise assets
CSS gradients
optimized images
```

Avoid large photorealistic desk images as critical path assets.

## 19.4 Fonts

Use fontsource npm packages for self-hosted Latin fonts.

```text
@fontsource/newsreader
@fontsource/cabin
@fontsource/monaspace-argon
```

Be careful with CJK webfonts because they are large.

Prefer:

```text
Latin webfonts loaded via fontsource for default experience
language-specific font loading for localized pages
system fallback where appropriate
```

## 19.5 Search

Do not add search until content volume justifies it.

If needed later, use Pagefind.

---

# 20. Testing

## 20.1 Unit tests

Use Vitest for:

```text
route helpers
reserved slug validation
i18n grouping
frontmatter validation helpers
comment validation
mail adapter behavior
unsubscribe token logic
```

## 20.2 Browser tests

Use Playwright for:

```text
homepage desk loads
keyboard navigation works
focused card opens
article expands
browser back collapses/restores correctly
direct article route works without relying on homepage state
comment form validates
admin dashboard requires auth/protection
```

## 20.3 Build checks

Build should fail on:

```text
reserved slug collision
duplicate route collision
duplicate translationKey + lang pair
invalid lang tag
missing required frontmatter
invalid card config
draft post accidentally included in production
```

---

# 21. Suggested Repository Structure

Use a small pnpm monorepo.

The project should be split into:

```text
apps/web
  Astro static site, MDX, React DeskApp, Tailwind, Framer Motion

packages/config
  shared route config, i18n config, reserved slugs, site metadata

packages/schemas
  shared Zod schemas for comments, newsletter, API payloads

packages/types
  shared TypeScript types

packages/mail
  optional shared mail adapter interfaces/templates
```

Recommended structure:

```text
.
├─ AGENTS.md
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ migrations/
│  ├─ 0001_comments.sql
│  └─ 0002_newsletter.sql
├─ apps/
│  ├─ web/
│  │  ├─ package.json
│  │  ├─ astro.config.mjs
│  │  ├─ tailwind.config.ts
│  │  ├─ tsconfig.json
│  │  ├─ public/
│  │  │  ├─ textures/
│  │  │  └─ fonts/
│  │  └─ src/
│  │     ├─ content/
│  │     │  ├─ config.ts
│  │     │  └─ posts/
│  │     │     ├─ en/
│  │     │     ├─ zh-Hans/
│  │     │     ├─ zh-Hant/
│  │     │     ├─ ja/
│  │     │     └─ ko/
│  │     ├─ components/
│  │     │  ├─ desk/
│  │     │  │  ├─ DeskApp.tsx
│  │     │  │  ├─ DeskCard.tsx
│  │     │  │  ├─ DeskRail.tsx
│  │     │  │  ├─ ArticleSheet.tsx
│  │     │  │  └─ AboutCard.tsx
│  │     │  ├─ article/
│  │     │  ├─ comments/
│  │     │  ├─ admin/
│  │     │  └─ seo/
│  │     ├─ layouts/
│  │     ├─ pages/
│  │     │  ├─ index.astro
│  │     │  ├─ about.astro
│  │     │  ├─ admin.astro
│  │     │  ├─ rss.xml.ts
│  │     │  ├─ sitemap.xml.ts
│  │     │  ├─ [slug].astro
│  │     │  └─ partials/
│  │     │     └─ [slug].astro
│  │     └─ styles/
│  │        ├─ global.css
│  │        ├─ tokens.css
│  │        ├─ fonts.css
│  │        ├─ desk.css
│  │        ├─ cards.css
│  │        ├─ article.css
│  │        ├─ mdx.css
│  │        └─ admin.css
└─ packages/
   ├─ config/
   │  ├─ package.json
   │  └─ src/
   │     ├─ routes.ts
   │     ├─ i18n.ts
   │     ├─ fonts.ts
   │     └─ site.ts
   ├─ schemas/
   │  ├─ package.json
   │  └─ src/
   │     ├─ comment.ts
   │     ├─ newsletter.ts
   │     └─ api.ts
   ├─ types/
   │  ├─ package.json
   │  └─ src/
   │     ├─ content.ts
   │     ├─ comments.ts
   │     └─ api.ts
   └─ mail/
      ├─ package.json
      └─ src/
         ├─ provider.ts
         └─ templates/
```

Hono lives in Cloudflare Pages Functions:

```text
functions/api/[[path]].ts
  Hono app, served by Cloudflare Pages Functions
```

The default deployment model is:

```text
apps/web
  deploy to Cloudflare Pages (static site + API functions)

/api/*
  served by Pages Functions at functions/api/[[path]].ts
```



Also update the **Decisions Already Made** section with:

```md
Use a small pnpm monorepo.
Use `apps/web` for Astro.
Use `functions/api/` for Hono Pages Functions.
Use `packages/config`, `packages/schemas`, and `packages/types` for shared code.
Do not put the Hono backend inside the Astro app by default.
````

And add this near the commands section:

```md
Root `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root scripts:

```json
{
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "build:web": "pnpm --filter web build",
    "deploy:web": "pnpm --filter web deploy",
    "check": "pnpm -r check",
    "test": "pnpm -r test"
  }
}
```

---

# 22. Commands

Use pnpm.

Recommended scripts:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview",
    "check": "astro check && tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "wrangler d1 migrations apply DB",
    "db:migrate:local": "wrangler d1 migrations apply DB --local"
  }
}
```

Adjust names to actual Cloudflare binding names.

---

# 23. Coding Style

## 23.1 TypeScript

Use TypeScript strictly.

Avoid `any`.

If `any` is unavoidable, explain why in a code comment.

## 23.2 React

Use function components.

Keep DeskApp state explicit.

Recommended state shape:

```ts
type DeskMode =
  | { type: "desk" }
  | { type: "opening"; slug: string; lang: string }
  | { type: "article"; slug: string; lang: string }
  | { type: "closing"; slug: string; lang: string }
  | { type: "about"; lang?: string };
```

Do not scatter mode state across unrelated components.

## 23.3 Error handling

User-facing errors should be calm and specific.

API errors should use structured codes.

Example:

```ts
return c.json(
  {
    ok: false,
    error: {
      code: "INVALID_COMMENT_BODY",
      message: "Comment body is required.",
    },
  },
  400
);
```

## 23.4 Comments in code

Prefer comments that explain why, not what.

Good:

```ts
// Use translationKey instead of slug because localized slugs can differ.
```

Bad:

```ts
// Set variable to slug.
```

---

# 24. MDX Component Rules

Define a small approved MDX component set.

Recommended:

```text
Callout
Figure
ImageWithCaption
Aside
CodeBlock
FootnoteNote
MathBlock later if needed
```

Do not add arbitrary heavy interactive components to article MDX without considering:

```text
partial rendering
hydration
SEO
RSS output
mobile behavior
```

## 24.1 Code highlighting

Use Shiki at build time.

Avoid client-side syntax highlighting.

---

# 25. Visual Design Rules

## 25.1 General visual direction

The site should feel:

```text
warm
tactile
readable
editorial
slightly irregular
carefully composed
```

Not:

```text
flat SaaS dashboard
generic card grid
photorealistic 3D render
overdecorated scrapbook
```

## 25.2 Card design

Cards should have:

```text
muted paper colors
serif headline
sans metadata
subtle texture
soft but visible shadow
slight rotation variation
clear active/focused state
```

## 25.3 About card

About card should feel like:

```text
business card
name card
identity card
```

It should be smaller or differently proportioned, but still integrated into the desk rail.

## 25.4 Article sheet

Expanded article should feel like the card became a larger sheet.

It should preserve:

```text
paper material
typographic identity
desk context
route correctness
```

---

# 26. Decisions Already Made

Treat these as settled unless changed by the user:

```text
Use pnpm.
Use Astro.
Use MDX.
Use React island for desk.
Use Framer Motion / Motion for animation.
Use Tailwind.
Use Hono.
Use Cloudflare Pages for static site.
Use Cloudflare Worker for backend API.
Use D1 for comments/newsletter metadata.
Use provider-agnostic mail adapter.
Use Newsreader + Cabin.
Use language-specific Noto fallback.
Use configurable route strategy.
Use one MDX file per language version.
Use translationKey to group translations.
Use Astro-rendered article routes for SEO.
Use article partials for in-app expansion.
```

---

# 27. Decisions Still Open

When implementing, confirm or choose sensible defaults for:

```text
Exact route mode default.
Exact locale route mode default.
Whether about page is localized.
Mail provider adapter used first.
Whether Cloudflare Access is available.
Whether newsletter requires double opt-in.
Whether comments allow replies in v1.
Whether comments are plain text only.
Whether Pagefind is needed.
Whether analytics are used.
```

Default choices if not specified:

```text
route mode: flat
locale route mode: flat-default-lang
about page: localized later, default language first
mail provider: custom-http adapter placeholder
admin auth: Cloudflare Access
newsletter: double opt-in
comments: threaded replies allowed but shallow
comment body: plain text
search: defer
analytics: defer
```

---

# 28. What Not To Do

Do not:

```text
turn the whole site into a client-only SPA
make article pages depend on client JS
hardcode /posts routes everywhere
hardcode Resend or any mail provider into business logic
use generic CJK font variables
merge multiple article languages into one MDX file
store plain emails unnecessarily
auto-publish comments in v1
add Supabase unless D1 becomes insufficient
add Three.js for v1
add a full CMS before content workflow demands it
add search before there are enough posts
break browser Back/Forward behavior
remove semantic links from cards
```

---

# 29. Implementation Priority

Build in this order:

## Phase 1: Static foundation

```text
Astro setup
Tailwind setup
font variables
content collections
MDX schema
route config
reserved slug validation
static article pages
RSS
sitemap
```

## Phase 2: Desk homepage

```text
DeskApp island
card metadata
horizontal rail
focus detection
rotated cards
About name card
keyboard navigation
mobile fallback
```

## Phase 3: Article expansion

```text
Astro partials
card-to-article animation
History API sync
browser Back/Forward handling
direct article hydration mode
reduced-motion fallback
```

## Phase 4: Comments backend

```text
Hono Worker
D1 schema
Turnstile validation
comment submission
approved comment fetching
pending moderation
admin notification mail
```

## Phase 5: Admin dashboard

```text
Cloudflare Access protection
pending comments UI
approve/hide/delete/spam actions
reply support
basic audit trail
```

## Phase 6: Newsletter/mail

```text
mail adapter
subscriber table
double opt-in
unsubscribe endpoint
admin send endpoint
List-Unsubscribe headers
```

## Phase 7: Polish

```text
Pagefind if needed
analytics if needed
better texture assets
article typography refinement
performance profiling
e2e tests
```

---

# 30. Final Principle

Optimize for a static, durable, content-first site with one carefully designed interactive surface.

The correct architecture is:

```text
Static where content matters.
Interactive where the desk illusion matters.
Serverless where user input matters.
Configurable where future route/mail/i18n choices may change.
```
