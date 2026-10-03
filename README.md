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
- `src/pages`: homepage, member directory, native Aspirasi form (closed until configured), and 404.
- `src/server/routes/aspirasi.ts`: local Node API route injected by the Astro config.
- `functions/api/aspirasi.ts`: Cloudflare Pages API using the shared response handler.

The supplied presentation provides the vision on slide 2 and the single mission
on slide 3; these are reproduced in `src/content/site.ts`. The roster, official
department names, and descriptions still show explicit empty states/stubs.
The supplied OSIS and 2026/2027 cabinet logos appear together in the navbar and
footer. `src/assets/` preserves the original PNG files; Astro emits optimized
WebP images for the public build. CSS frames the cabinet logo's transparent
margin without changing its artwork. The primary orange is now `#ff9f43`;
small orange text retains a darker shade for readable contrast.

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
The Cloudflare deployment needs no database binding for the Google Forms flow. Local database files are excluded from Git and the public build.

SQLite suits this school site's expected workload. Higher sustained write
concurrency may justify PostgreSQL later; that needs a schema/driver migration,
not just changing the URL. Keep database code in the server module boundary.

## Native aspirations with Google Forms

Students fill the native OSIS form at `/aspirasi`; the server forwards validated
submissions to a signed Google Apps Script bridge. Staff review responses in
Google Forms or its private linked Sheet. There is no public response-reading
endpoint and no database or bot is required for this integration.

The respondent form is https://forms.gle/oX6GDK8YqjM5HfzW7. Its verified fields
are multiple checkbox categories (including Other), optional title, and required
message. The frontend uses the existing typography, orange tokens, and motion.

Submission remains **closed by default** until the owner deploys the Apps Script,
sets server secrets and Turnstile keys, and enables both build/runtime flags.
Read `integrations/google-forms/SETUP.md` for the exact owner setup, deployment,
privacy settings, manual end-to-end checks, and limitations.

The shared API enforces method/origin/content type, bounded body reads, field
validation, honeypot, and server-side Turnstile verification. Server-to-Google
requests are HMAC-signed. The script limits daily writes and remembers retry IDs
for 24 hours; ambiguous writes remain pending for owner review rather than
blindly creating another response. Failed submissions preserve browser inputs.
No sensitive request bodies or upstream responses are logged or returned.

Unit/integration tests use an injected HTTP transport and a mocked Apps Script
runtime; they never submit to the real Google Form. A real end-to-end test still
requires owner authorization/setup and working Google/Turnstile credentials.

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
setup keeps the public site static and uses Pages Functions for the Google Forms
submission bridge. Google Forms stores the responses; the old SQLite scaffold
is not used by this flow.

## Seksi bidang content

`src/content/site.ts` exports ten `departments` with stable IDs. Replace each
stub name and description with approved content, then set `photo` to a local
asset URL such as `/images/sekbid/sekbid-01.webp` and `photoAlt` to a meaningful
description. Store approved photos in `public/images/sekbid/`. Prefer optimized
WebP/AVIF assets and an 8:5 composition for the gallery.

All ten cards currently use the user-supplied Purbaya example photo, labelled
as a placeholder. Imported images can also be stored in `src/assets/` for
Astro optimization. Set `photoIsPlaceholder: false` when supplying real team
photos, and provide a matching `photoAlt` description.

The full grid lives at `/sekbid`. Four preview cards on the homepage link to
the first four teams via URL anchors; all ten remain available in the gallery.
No carousel dependency or social-media embed is loaded. Research limitations
and public sources are documented in `SOCIAL-RESEARCH.md`.

Current aspirations setup and deferred WhatsApp work are recorded in `ROADMAP.md`.

## Leadership content

`src/content/site.ts` exports `advisors` and `coreLeadership`. Both the homepage
and `/anggota` stack teacher advisors above Ketua, Wakil Ketua, Sekretaris, and
Bendahara, followed by four department previews and a link to the full directory.
Fill each leadership entry's `name` with approved content and replace its photo
and alt text; set `photoIsPlaceholder` to false for real portraits.

## Developer Easter egg

Requested alias classes (`fucknutcard`, `bumassbar`, `boobnavbar`) sit beside
descriptive classes. One console warning asks people not to tamper or paste
untrusted code. DevTools remains available and real diagnostic logs still work.
