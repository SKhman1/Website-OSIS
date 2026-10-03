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

Account creation/reset is an owner-PC operation through authorized Wrangler.
There is no registration API, initial default password, or anonymous bootstrap
endpoint. `desktop-admin/provision.py` writes a salted verifier using a temporary
SQL file and deletes that file afterward. Do not upload Wrangler credentials
or the project environment files with the application package.

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
| `POST /api/manage/login` | Password | Create expiring session |
| `POST /api/manage/logout` | Session | Revoke this session |
| `GET/PUT /api/manage/content` | Owner/editor | Load/save draft |
| `POST /api/manage/media` | Owner/editor | Upload bounded still WebP |
| `GET /api/manage/history` | Owner/editor | Revision metadata |
| `POST /api/manage/publish` | Owner | Publish entire saved draft |
| `POST /api/manage/restore` | Owner | Restore revision as draft |
| `POST /api/manage/password` | Current password + session | Rotate password/revoke sessions |

Draft writes/publication/restore use an expected version and transactional batch.
A stale write returns 409 instead of overwriting another editor's changes. Draft
and published states are separate. Fifty revisions are retained; restore does
not immediately republish. Strict schema validation rejects unknown fields,
external image URLs, missing references, malformed dates, overlapping rundown
slots, or removal of required roles/bidang. Dynamic website rendering uses text
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

XLSX imports are bounded to 2 MB, 20 MB expanded ZIP content, 200 rows and one
sheet. Macro/external-link/encrypted archives and formulas are rejected.
`defusedxml` protects workbook XML parsing. The server accepts only normalized
rundown rows, never workbooks, macros, or formulas. See the desktop README for
the four-column format and workflow.

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
password in that file and clear the local throttle fixture before running.

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

## Department chair and member input

Each department has one optional `chairId` and a separate `memberIds` list.
Both refer to people in the member group; a chair cannot also occur in that
same field's member list. Existing documents without chairId normalize to null.
Native pickers display names and program titles, create/edit references inside
modal Qt forms, and generate internal IDs. Results and photo references remain
unchanged when assigning chairs. Public field profiles render chair and members
under separate subheadings with normal links to their individual profiles.
