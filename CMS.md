# Native content management

VND Console uses Python/Qt Widgets for a native desktop UI and HTTPS JSON APIs
implemented in TypeScript on Cloudflare Pages Functions. D1 holds separate draft
and published documents, accounts, hashed sessions, revision history, and small
WebP assets. Aspirations remain in the existing Google Forms integration and are
not exposed to this content API or desktop application.

## Deployment and initial content

`wrangler.jsonc` binds `CMS_DB` to `vnd-smkdipo1-content`. Migrations live under
`migrations/cms`, separate from the older local aspiration database scaffold.

```sh
npx wrangler d1 migrations apply vnd-smkdipo1-content --remote
npm run build:pages
npx tsx scripts/seed-cms.ts
npx wrangler d1 execute vnd-smkdipo1-content --remote --file data/cms-seed.sql
npx wrangler pages deploy dist-pages --project-name vnd-smkdipo1 --branch main
```

Seed SQL uses `INSERT OR IGNORE`. Subsequent builds/deployments do not replace
staff edits. The published D1 document is authoritative for managed content;
`src/content/site.ts` and `src/content/work.ts` are initial seed/static fallback.
Existing static HTML remains readable if the API is unavailable or JS disabled,
but may show older seed content. New member/advisor routes use a shared profile
shell populated by public JSON, so those profiles require JavaScript. Metadata
and social previews of existing static pages remain based on the build fallback.
This is a deliberate limitation of the current static-page/runtime-content model.

Core IDs and department IDs/numbers remain fixed. Newly published adviser/member
profiles resolve through a Pages Function without generating a new build.
Public JSON caches for 15 seconds and visible pages poll every 15 seconds;
background tabs pause and refresh upon return.

## Authentication

Daily account creation is owner-invitation only; there is no public registration,
default password, or anonymous bootstrap API. The GUI does not provision accounts
or carry infrastructure credentials. `scripts/cms-owner.py` is a separate
Wrangler-authorized bootstrap/recovery tool with explicit database selection.
Bootstrap refuses nonempty account tables. Cloudflare/domain changes remain the
infrastructure custodian's responsibility; a panel owner has no Cloudflare rights.

Owner login requires MFA. An unenrolled owner receives only a 10-minute enrollment
session, with no draft/media/account access. First activation additionally needs a
hashed one-use 24-hour activation code from the infrastructure custodian or a valid
owner invitation. Enrollment verifies the current password and TOTP, replaces the
password, and invalidates prior sessions. TOTP secrets use account-bound AES-256-GCM
with server-only `CMS_MFA_KEY` (32 random bytes as 64 hex characters). Ten hashed
one-use recovery codes are provided once. Time steps and recovery codes are consumed
atomically; a reused factor is rejected. See `SECURITY.md` for setup and handover.

Invitations are random 32-byte codes stored only as hashes, valid 24 hours, single
use, and bound to the issuing owner's active account/epoch. The server assigns role
and username. Account/invitation management requires password and a fresh MFA
factor. Disabling an account revokes all sessions and outstanding invitations. The
last enabled owner with active MFA is protected within the write statement.

Passwords use scrypt N=32768, r=8, p=3, salt=16 bytes, key=32 bytes and constant-time
comparison. These parameters follow the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
The deployed Workers native crypto implementation was tested with real login.
Minimum new password length is 15 characters; maximum is 128.

Opaque session tokens contain 32 random bytes. Only SHA-256 token hashes are
stored in D1. Tokens expire after one hour and are kept only in GUI memory.
Password changes/reset increment an account epoch and revoke every session.
Login limits are 30 attempts/IP and 10 attempts/username per 15 minutes;
authenticated writes are limited to 120/minute/account. HTTPS is required except
localhost development. The desktop never follows HTTP redirects with credentials.

Admin endpoints reject browser Origin/Sec-Fetch-Site headers and provide no CORS
permission. This discourages browser use; it is **not** an authentication boundary:
headers and client binaries can be changed. Authorization is enforced by the
server's password, session, and account role checks on every request.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/content` | Public | Published content only |
| `GET/HEAD /api/media/[id].webp` | Public if referenced by published content | Photo; authenticated draft preview also allowed |
| `POST /api/manage/login` | Password; owner also MFA | Create full or restricted enrollment session |
| `POST /api/manage/logout` | Session | Revoke this session |
| `GET/PUT /api/manage/content` | Owner/editor | Load/save draft |
| `POST /api/manage/media` | Owner/editor | Upload bounded still WebP |
| `GET /api/manage/history` | Owner/editor | Revision metadata |
| `POST /api/manage/publish` | Owner | Publish entire saved draft |
| `POST /api/manage/restore` | Owner | Restore revision as draft |
| `POST /api/manage/password` | Current password + session; owner also fresh MFA | Rotate password/revoke sessions |
| `GET /api/manage/security` | Session | MFA status |
| `POST /api/manage/mfa/begin`, `/confirm` | Unenrolled owner + password + activation grant | Enable MFA and rotate password |
| `POST /api/manage/invitations/accept` | Valid one-use invitation | Create the assigned account |
| `GET/POST /api/manage/invitations`, `POST /revoke` | Owner; writes require reauthentication | List/create/revoke invitations |
| `GET /api/manage/accounts` | Owner with MFA | Account metadata only |
| `POST /api/manage/accounts/status`, `/revoke-sessions` | Owner + reauthentication | Enable/disable accounts or revoke sessions |
| `GET /api/manage/audit` | Owner with MFA | Access audit metadata |

Draft writes/publication/restore use an expected version and transactional batch.
A stale write returns 409 instead of overwriting another editor's changes. Draft
and published states are separate. Fifty revisions are retained; restore does
not immediately republish. Strict schema validation rejects unknown fields,
external image URLs, missing references, malformed dates, unsorted/out-of-window rundown
slots, or removal of required roles/bidang. Parallel slots are supported. Dynamic website rendering uses text
nodes and DOM elements, never HTML supplied by editors.

## Photos and rundown

R2 is not enabled on this account, so the initial implementation stores up to
200 WebP blobs in D1, each up to 1 MB. Atomic insertion enforces the quota. No
public listing exists, and unreferenced/draft-only photos return 404 publicly.
Public images are no-store to avoid a cache retaining an unpublished photo.
Asset garbage collection and cross-store migration are owner maintenance tasks;
replacing a photo currently retains the older upload for history recovery.

The native importer decodes/re-encodes images, removes metadata and limits size.
The server also checks MIME, byte size, RIFF structure, declared dimensions,
single-frame format, and allowed chunks according to Google's
[WebP container specification](https://developers.google.com/speed/webp/docs/riff_container).
The server container check is not a full pixel decoder; native normalization
performs the actual decode. SVG/HTML and arbitrary chunks are not accepted.

An optional `CMS_MEDIA` R2 adapter exists but is not bound or deployed. Activating
R2 requires explicitly enabling that Cloudflare product, creating a private
bucket, migrating existing D1 assets, and configuring the binding before use.
Do not simply add the binding while older assets remain in D1.

XLSX imports support the supplied multi-sheet, multi-day rundown preset and
the original four-column format. Limits: 2 MB compressed, 20 MB expanded,
20 sheets, 2000 physical rows / 64 columns per sheet, 100,000 stored cells,
100 days, 200 sessions per day. XML is inspected before allocation; oversized
merges, macros, external links and encryption are rejected. Rundown-sheet formulas
are rejected; unrelated sheets are ignored and never evaluated. Only normalized
schedule rows are uploaded, never workbooks or private committee/contact sheets.

Optional `endNextDay` on events/rows allows up to 24 hours; empty row `end` means
a timestamp milestone. Optional `speaker`/`coordinator` preserve public credits.
Rows remain sorted by start, with parallel sessions allowed. The public panel
shows all currently scheduled sessions, upcoming/gap/finished states and a
responsive day selector. Finite session windows drive the navbar notice; a
milestone or gap produces no live notice. The browser uses explicit WIB timestamps
and pauses updates while hidden. This indicates the published schedule, not a
server-confirmed live attendance state. See the desktop README for reuse.

## Verification

```sh
npm run check
npm test
npm run build:pages
desktop-admin/.venv/Scripts/python -m unittest discover -s desktop-admin -p test_admin.py -v
```

GUI tests use offscreen Qt and the built seed JSON. `scripts/cms-integration.ts`
tests a disposable **local** D1 fixture served at 127.0.0.1:8791: roles, private
draft/media, CAS conflicts, publication, profile routing, revision restore,
password rotation, logout, and throttling. It never targets a remote database
or Google Forms. Provision local qa-owner/qa-editor accounts with the test
password in that file and clear the local throttle fixture before running. The
unenrolled QA owner also needs a local-only activation grant for the integration
fixture (`f` repeated 64 characters); never apply that fixture to production.

`scripts/cms-remote-check.py [deployment URL]` creates a disposable remote editor,
tests login/read restrictions/logout, then removes it in `finally`. It never
publishes content or submits aspirations. Run only with the owner's existing
Wrangler authorization. Windows packaging and frozen startup have been tested;
macOS/Linux packaging remains unverified.

GUI worker results pass through retained QObject receivers with explicit queued
slots on the main thread, following [Qt thread affinity guidance](https://doc.qt.io/qtforpython-6/tutorials/basictutorial/signals_and_slots.html#thread-affinity).
`VND-Console.exe --self-test` also exercises the packaged GUI's actual HTTP login,
content refresh, history, logout, rejected credentials, and retry against a
disposable loopback server; no real passwords or settings are used. This covers
the asynchronous callback crash that startup-only checks previously missed.
`scripts/cms-gui-remote-check.py` tests GUI login/read/logout against Cloudflare
with a temporary editor and removes it afterward, without publishing content.

## Editable cabinet identity and statistics

CMS schema 2 stores `identity` (cabinetName, term, logo, logoAlt) and three nullable
integer statistics (members, programs, activities). Existing schema 1 documents
and revisions are normalized on read with original identity defaults; their
approved people, programs, visions and events are preserved. Legacy GUI writes
are rejected with an upgrade message so old clients cannot reset new settings.
No remote seed replacement or account migration is required.
Cabinet logos use the existing authenticated media upload, draft privacy and
publication checks. Zero is valid; null remains explicitly labelled preview data.
Social contacts are lightweight local SVGs from Simple Icons (CC0):
https://github.com/simple-icons/simple-icons; no third-party embed or tracking script.

`identity.favicon` is optional: absent/null follows the cabinet logo. A custom
favicon must use the same validated local image/media paths as other photographs.
It participates in media existence and draft/public access checks. Older schema-2
GUI saves that omit this field preserve its current draft setting; explicit null
resets it. `/api/favicon` redirects only to the published icon/logo, with no-store
and a static `/favicon.svg` fallback when CMS is unavailable. Public polling also
refreshes the browser link after publication; no deploy is required for changes.

## Flexible Excel and optional Groq mapping

The desktop importer retains the existing exact presets. Flexible import selects
one visible sheet and a bounded range (200 rows × 20 columns); it recognizes common
header aliases, supports manual column mapping, and stores local coordinate presets
without cell contents. The workbook never reaches Cloudflare/Groq. Formulas in
the selected area, macros, external links and oversized ZIP/XML content are rejected.

`POST /api/manage/agenda-ai` requires an active native owner/editor session and
full owner MFA when applicable. Browser-origin requests remain rejected. The body
is limited to 32 KB and the selected cell payload to 24,000 characters / 500 per
cell. Users inspect a masked preview and explicitly choose AI assistance. Identified
phone/email text is masked on both client and server; masking is not a guarantee
that every kind of private data is detected. Select only public rundown content.

The sole provider URL is Groq chat completions; `GROQ_API_KEY` is a Production secret.
The model is `openai/gpt-oss-20b`, low reasoning effort, strict JSON schema, maximum
3,000 completion tokens, 25-second timeout, no tools and no automatic retries or
larger-model escalation. AI produces source coordinates, not rewritten activities
or inferred dates/times. Unknown metadata must be completed in the editable preview.
Local validation rejects missing/invented references, duplicate columns, invalid
rows/times and oversized sessions before anything enters a draft. Cell text is
untrusted data; the AI route has no content mutation or publication capability.

Server quotas allow 10 attempts/account/hour and 100 total/day using atomic D1
counters. Errors never echo upstream prompts, credentials or provider responses.
Prompts/results are not stored in CMS; provider retention is controlled separately
through Groq Data Controls. Revocation is checked again before returning a result.
Manual import remains available without Groq. The GUI key is never embedded in
source, browser assets, local settings or executable builds.

`scripts/agenda-ai-remote-check.py https://vnd-smkdipo1.pages.dev` verifies real Groq
with synthetic cells and a disposable editor removed in finally. It uses existing
custodian Wrangler authorization and never publishes or submits aspirations.

## Department chair and member input

Each department has one optional `chairId` and a separate `memberIds` list.
Both refer to people in the member group; a chair cannot also occur in that
same field's member list. Existing documents without chairId normalize to null.
Native pickers display names and program titles, create/edit references inside
modal Qt forms, and generate internal IDs. Results and photo references remain
unchanged when assigning chairs. Public field profiles render chair and members
under separate subheadings with normal links to their individual profiles.
