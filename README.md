# OSIS SMK Diponegoro 01 website

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

The supplied Ketua/Wakil presentation provides the main vision and mission on
slide 2, shown on the homepage only. Four named core profiles and 12 distinct
program plans come from the three supplied presentations. Department names,
additional member rosters, and completed results remain empty until supplied.
`CONTENT-SOURCES.md` records the source mapping and owner cadence correction.
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
runtime; they never submit to the real Google Form. On 3 October 2026, a separate
production browser test received a confirmed Apps Script receipt for one response
labelled `UJI INTEGRASI — bukan aspirasi siswa`, with OSIS and Other categories.
Production submission is now enabled. The owner can inspect that test response
in the private Google Forms Responses tab.

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


## Notification island

`src/components/NotificationIsland.astro` and `src/scripts/notifications.ts`
provide a compact capsule inside the sticky navbar on every page. Long previews
scroll rightwards with a seamless duplicate that is hidden from screen readers.
Click opens a fluid detail card anchored to the capsule. On narrow screens, the
capsule occupies a second row inside the same navbar. Escape or clicking outside
collapses the card; Close dismisses it. The menu stays available while notices show.

Confirmed aspiration receipts remain for at least 12 seconds, extended to cover
a complete text loop. Hover, keyboard focus, and a hidden browser tab pause the
timer and scrolling. Expanded receipts stay open until collapsed or dismissed.
The inline form receipt remains available afterwards. Student messages never
appear in notifications.

Add approved notices to `src/content/announcements.ts` with a unique `id`,
`kind` (`live`, `event`, or `info`), `title`, and `message`. Optional `href`
and `linkLabel` provide a normal link; `startsAt`/`endsAt` use ISO timestamps
with a Jakarta offset (`+07:00`). Empty configuration renders no notification.
The browser checks schedule boundaries once a minute without network polling.
New content requires rebuilding/redeploying. Approved notices start compact and
stay until dismissed or their schedule ends. Dismissed IDs last for that browser
tab session. Success receipts take priority and restore the active notice later.
Other site code can import `notify()` to use the same component.

Motion uses transform/opacity and supports interruption. Reduced motion disables
morphing and scrolling, with full text still available in the expanded card.
Opening the navigation menu hides the capsule; moving keyboard focus to an
obstructed control collapses the detail card.


## People, departments, and work

Core profile pages are `/anggota/ketua`, `/anggota/wakil-ketua`,
`/anggota/sekretaris`, and `/anggota/bendahara`. The teacher has a prepared page
at `/anggota/pembina-osis`. Each of the ten departments has a page at
`/sekbid/sekbid-01` through `/sekbid/sekbid-10`. Directory/home cards link to
these static pages, with shared photo previews, numbered sections, program
details, and a results area. Detail pages keep the shared notification island.

Edit `src/content/site.ts` for identities, introductions, department `memberIds`,
`programIds`, and `results`. Add additional named member profiles to `members`;
the member route generates their pages automatically. Keep stable unique IDs.
Edit `src/content/work.ts` for program descriptions, cadence, goals, and steps.
Programs referenced by departments/profiles resolve from `allPrograms`.
A result requires `id`, `title`, `description`, and an ISO `date`; optional
`photo`/`photoAlt` can add approved documentation. Leave results empty until
actual reports are supplied. Publication requires build and redeployment.


## School identity and hero

The brand is OSIS SMK Diponegoro 01, with cabinet name Vimsati Natta Darsa.
The homepage uses the supplied school photo in `src/assets/school/school.jpg`;
Astro generates responsive WebP variants. The original campus photograph is
kept unchanged and the caption explicitly identifies SMK Diponegoro 01.
The aspiration security widget uses its supported compact size to fit narrow
screens without clipping.
