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

The homepage now has seven numbered sections with section 02 reserved for
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

## Native desktop content management

VND Console manages live people, photos, programs, results, events/rundowns, and visi/misi with password login. See [desktop setup and usage](desktop-admin/README.md) and [CMS architecture](CMS.md). The source-content instructions below describe the initial seed and static fallback; use the GUI to update the published D1 content.

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

The full grid lives at `/anggota/seksi-bidang`. Four preview cards on the homepage
open individual team profiles; all ten remain available in the gallery.
No carousel dependency or social-media embed is loaded. Research limitations
and public sources are documented in `SOCIAL-RESEARCH.md`.

Current aspirations setup and deferred WhatsApp work are recorded in `ROADMAP.md`.

## Leadership content

`src/content/site.ts` exports `advisors` and `coreLeadership`. The homepage stacks
teacher advisors above the four core roles, followed by department previews.
`/anggota` lists only Ketua, Wakil Ketua, Sekretaris, and Bendahara;
`/anggota/pembina` lists all supplied advisors. Add advisors to the array with
stable unique IDs; their directory cards and nested profiles generate automatically.
The current advisor entry is a placeholder, not a confirmed complete staff list.
Fill each leadership entry's `name` with approved content and replace its photo
and alt text; set `photoIsPlaceholder` to false for real portraits.

## Developer Easter egg

Requested alias classes (`fucknutcard`, `bumassbar`, `boobnavbar`) sit beside
descriptive classes. One console warning asks people not to tamper or paste
untrusted code. DevTools remains available and real diagnostic logs still work.


## Notification island

`src/components/NotificationIsland.astro` and `src/scripts/notifications.ts`
render nothing until a real client event or approved active announcement exists.
The desktop capsule occupies only the spare slot between the school identity and
navigation. Navigation and the aspiration button remain visible and usable.
If that slot is narrow, the capsule becomes an accessible icon trigger. On mobile,
only an active notification adds a compact second row inside the sticky navbar.
There is no empty capsule, placeholder notice, or automatic welcome message.

Long previews scroll rightwards with a seamless, aria-hidden second copy. Hover,
keyboard focus, a hidden tab, and open details pause the ticker and receipt timer.
Reduced motion disables scrolling. Confirmed receipts persist for at least 12
seconds, extended to cover one text loop; the inline form receipt remains after
preview dismissal. Notifications never include student response content.

Click opens one shared native dialog: a white anchored popover below the desktop
navbar, or a white bottom sheet with a dim backdrop on mobile. Desktop navigation
remains interactive; mobile uses native modal focus containment and scroll lock.
Close, Escape, outside click, or a downward swipe on the sheet handle closes
only the details. Focus returns to the preview unless another control was chosen.
The preview's dismiss button hides the notification. The handle also works as a
normal button, so gestures are never required. Modal mode adapts during resize.

Add only real approved activities to `src/content/announcements.ts`, with unique
`id`, `kind` (`live`, `event`, or `info`), `title`, `message`, and REQUIRED ISO
`startsAt` / `endsAt` timestamps, using `+07:00` for Jakarta. Undated banners,
empty content, future activities, expired activities, and dismissed IDs stay
hidden. Empty configuration produces no preview on page load. Optional `href`
and `linkLabel` attach a normal activity link. Schedule boundaries use local
timers and refresh on visibility changes; there is no polling or backend feed.
Managed activities are now supplied by the native CMS without rebuilding. Client code may call
`notify()` only after an actual event, such as the API's confirmed form receipt.
Success receipts take priority, then restore a still-active approved notice.

Motion follows the LottieFiles Motion Design skill with CSS/Web Animations API:
preview entry 240ms, desktop detail entry 320ms, sheet entry 360ms, and detail
exit 220ms. Content follows by 60ms, and icon feedback settles independently.
Only transform/opacity animate. Interrupted opens/closes and reduced motion are
supported. The skill guides timing and choreography; no Lottie runtime is loaded.


## People, departments, and work

The homepage has seven numbered sections. Section 6, **Kabar dari OSIS**, is the
home for announced event agendas and future rundowns; section 7 is aspirations.
Work programs appear within leadership profiles rather than a separate homepage
section. No example event schedules are published as real activities.

Core profile pages are `/anggota/ketua`, `/anggota/wakil-ketua`,
`/anggota/sekretaris`, and `/anggota/bendahara`. Advisor profiles use
`/anggota/pembina/[id]`, currently `/anggota/pembina/pembina-osis`.
Each of the ten departments has a page at `/anggota/seksi-bidang/sekbid-01`
through `/anggota/seksi-bidang/sekbid-10`. Directory/home cards link to
these static pages, with shared photo previews, numbered sections, program
details, and a results area. Detail pages keep the shared notification island.

Navbar links **Kepengurusan** and **Seksi Bidang** go to `/#kepengurusan`
and `/#seksi-bidang` on the homepage. Section buttons open the corresponding
directories. The old `#sekbid` bookmark remains supported. Pages redirects in
`public/_redirects` permanently forward `/sekbid`, its ten existing profiles,
`/seksi-bidang`, and `/anggota/pembina-osis` to the new hierarchy; local Astro
redirects mirror these in `config/redirects.mjs`.

Edit `src/content/site.ts` for identities, introductions, department `memberIds`,
`programIds`, and `results`. Add additional named member profiles to `members`;
the member route generates their pages automatically. Keep stable unique IDs.
Edit `src/content/work.ts` for program descriptions, cadence, goals, and steps.
Programs referenced by departments/profiles resolve from `allPrograms`.
A result requires `id`, `title`, `description`, and an ISO `date`; optional
`photo`/`photoAlt` can add approved documentation. Leave results empty until
actual reports are supplied. These files provide the initial seed/static fallback. Live publication now uses VND Console and D1 without rebuilding.


## School identity and hero

The brand is OSIS SMK Diponegoro 01, with cabinet name Vimsati Natta Darsa.
The homepage uses the supplied school photo in `src/assets/school/school.jpg`;
Astro generates responsive WebP variants. The original campus photograph is
kept unchanged and the caption explicitly identifies SMK Diponegoro 01.
The aspiration security widget uses its supported compact size to fit narrow
screens without clipping.


## Control panel security and annual handover

The native GUI is login/invitation only. Panel owners use MFA and manage council
access; the infrastructure custodian alone controls Cloudflare/domain/configuration.
See [SECURITY.md](SECURITY.md) and [desktop-admin/README.md](desktop-admin/README.md).
Use `wrangler.example.jsonc` and your own URL/database/secrets for forks. This
change does not publish the private repository or grant hosting access to council
accounts. Build output is `desktop-admin/dist-secure/VND-Console/`.
