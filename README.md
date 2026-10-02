# OSIS Dipo 1 website

Phase-one skeleton for SMK Diponegoro 1 Jakarta's OSIS website, period 2026/2027.

## Stack

- TypeScript for shared frontend types, server endpoints, and database schema.
- Astro: static public pages, a local Node API, and Cloudflare Pages Functions.
- Plain CSS: design tokens and responsive layout, without a UI framework runtime.
- SQLite/libSQL + Drizzle: versioned SQL migrations and typed database access.
- Manrope variable font, self-hosted by the build.

## Develop

Use a Node release supported by the installed Astro version.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
npm start
```

The dev URL is http://localhost:4321. Production `npm start` runs the built Node
server. Do not use `astro preview` as a production server.

## Content and design

- `src/content/site.ts`: school identity, approved members, visi/misi, programs, activities.
- `src/styles/global.css`: shared design tokens and components.
- `src/components` and `src/layouts`: reusable site structure.
- `src/scripts/motion.ts`: hero/section reveals and viewport-triggered matrix counters.
- `DESIGN.md`: visual direction and boundaries.
- `src/pages`: homepage, member directory, Aspirasi preview, and 404.
- `src/server/routes/aspirasi.ts`: local Node API route injected by the Astro config.
- `functions/api/aspirasi.ts`: Cloudflare Pages API using the shared response handler.

No roster or policy content was provided, so these sections show honest empty
states. The temporary typographic logo and orange token need official assets.
Nixxie has no artwork yet. The console warning references its name only.

The homepage now has eight numbered sections with section 02 reserved for
statistics. Demo numbers are visibly marked as examples. Set a statistic's
`value` in `src/content/site.ts` only after verification; `null` retains the
example label and preview value. Buttons have hover/press feedback, hero content
enters in sequence, and later sections reveal on scroll. The motion layer uses
CSS, IntersectionObserver, and Web Animations without a third-party runtime.
Reduced motion presents final values immediately, and disabling JS keeps content
readable. Native view transitions add page navigation motion where supported.

## Database

Copy `.env.example` to `.env`, then run:

```sh
npm run db:migrate
```

The checked-in migration creates the aspirations table, indexes, and constraints.
For schema changes, edit `src/server/db/schema.ts`, run `npm run db:generate`,
review the SQL, and apply migrations. Never commit credentials or database files.

Local development uses `file:./data/osis.db`. For serverless hosting such as
Vercel, use persistent remote libSQL (for example Turso) through `DATABASE_URL`
and `DATABASE_AUTH_TOKEN`, and select the matching Astro deployment adapter.
A local SQLite file is not durable storage on ephemeral serverless instances.
The Cloudflare phase-one deployment needs no database binding: submissions remain
closed. Local database files are excluded from Git and the public build.

SQLite suits this school site's expected workload. Higher sustained write
concurrency may justify PostgreSQL later; that needs a schema/driver migration,
not just changing the URL. Keep database code in the server module boundary.

## Native aspirations: next phase

The form is disabled and `/api/aspirasi` returns HTTP 503 on POST. Other methods
return 405. The scaffold cannot accept, store, or publicly list submissions.
The database connection is lazy; building public pages requires no credentials.

Before enabling submissions, implement server validation and request-size limits,
same-origin protection, persistent abuse controls, an agreed privacy/retention
policy, and authenticated staff review. Do not promise anonymity without agreeing
how server/platform logs and optional contact data will be handled.
Test direct requests independently of the browser form. Never trust disabled
fields, hidden controls, class names, or a console warning as authorization.

## Cloudflare Pages deployment

Live site: https://vnd-smkdipo1.pages.dev/
Private source repository: https://github.com/SKhman1/Website-OSIS

The `pages.dev` target uses static HTML from `dist-pages/` and a small Pages
Function at `/api/aspirasi`. It does not deploy the Node server or local database.
The local Node workflow above continues to use `dist/`.

```sh
npm run build:pages
npm run preview:pages
```

The Pages preview is http://127.0.0.1:8788. For the first deployment, authenticate
with Cloudflare and create a Direct Upload project:

```sh
npx wrangler login
npx wrangler pages project create vnd-smkdipo1 --production-branch main
npm run deploy:pages
```

The actual domain is returned by Cloudflare after deployment. The project name
can receive a suffix if its domain is already taken. Adjust `wrangler.jsonc` and
the deploy script if a different project name is selected.

Direct Upload publishes this local build; pushing GitHub commits does not deploy
automatically. A later GitHub Actions workflow can use a scoped Cloudflare Pages
API token stored in GitHub Secrets. Do not put tokens in code or `.env.example`.

Cloudflare's Astro adapter targets Workers in current Astro releases. This Pages
setup keeps the public site static and lets Pages Functions handle the future
form. Before enabling persistence, choose a Cloudflare-compatible remote libSQL
driver or implement a D1 binding and migration; a local SQLite file cannot be
used as persistent storage in Pages Functions.

## Seksi bidang content

`src/content/site.ts` exports ten `departments` with stable IDs. Replace each
stub name and description with approved content, then set `photo` to a local
asset URL such as `/images/sekbid/sekbid-01.webp` and `photoAlt` to a meaningful
description. Store approved photos in `public/images/sekbid/`. Prefer optimized
WebP/AVIF assets and an 8:5 composition for the gallery.

The full grid lives at `/sekbid`. Three preview cards on the homepage link to
the first three teams via URL anchors; all ten remain available in the gallery.
No carousel dependency or social-media embed is loaded. Research limitations
and public sources are documented in `SOCIAL-RESEARCH.md`.

## Developer Easter egg

Requested alias classes (`fucknutcard`, `bumassbar`, `boobnavbar`) sit beside
descriptive classes. One console warning asks people not to tamper or paste
untrusted code. DevTools remains available and real diagnostic logs still work.
