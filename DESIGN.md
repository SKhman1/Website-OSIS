# OSIS SMK Diponegoro 01 design foundation

Voice: Indonesian, clear, friendly, formal enough for a school organization.
Audience: students, school staff, and visitors. Primary jobs: understand OSIS,
find the approved 2026/2027 roster, follow activities, and eventually send an aspiration.

## Shared system

- One locally served variable font: Manrope, with weights defining hierarchy.
- Brighter orange `#ff9f43` is the primary token, inspired by the supplied logo.
- Orange text uses `#a84508` on light backgrounds; bright orange buttons use dark text.
- White canvas, green-neutral text/surfaces, pale orange identity panel.
- All colors, spacing, widths, and radii are centralized in `src/styles/global.css`.
- A 4px-based spacing scale; constrained reading widths; content-led layouts.
- No framework runtime in the browser. CSS and a small TypeScript motion module.
- Native mobile navigation with `details`; visible keyboard focus; reduced motion.
- The navbar and footer pair the supplied OSIS and 2026/2027 cabinet logos.
- Original artwork remains unchanged; CSS frames the cabinet logo's transparent margin.
- Purbaya is a user-requested temporary photo, explicitly labelled as an example.
- Do not invent student names, school policies, dates, or activity statistics.

## Motion and sections

Motion direction follows [LottieFiles Motion Design](https://github.com/LottieFiles/motion-design-skill):
Corporate personality with one easing curve, 160/320/560ms timing tokens,
small vertical reveals, staggered hero entry, responsive hover/press feedback,
and a brief ambient orbit entrance. No continuous loops or animation libraries.

Homepage sequence: 01 hero, 02 statistics, 03 about, 04 vision/mission,
05 leadership and departments, 06 programs, 07 activities, 08 aspirations. Other public pages have numbered,
labelled semantic sections with their own heading relationships.

Statistics contain explicitly labelled preview values until verified data is set
in `src/content/site.ts`. A one-shot viewport-triggered sequence scrambles digits,
then settles them from left to right onto ascending counts. Accessible text is
static; changing digits are hidden from screen readers. Fixed-width numerals
prevent horizontal layout shift. Reduced motion skips the sequence entirely.

All content stays visible without JS. Motion stops on hidden/unloaded pages,
and native cross-document view transitions gracefully fall back to normal
navigation. No SPA router, scroll interception, or React dependency is needed.

## Sekbid directory

Ten photo cards live at `/sekbid` in a balanced two-column desktop gallery and
one column on mobile. Numbered anchor links jump directly to any team. The
homepage previews four cards with links to their anchors in the full directory.
No autoplay carousel, gesture-only navigation, or additional JS is needed.

Cards reuse the orange tokens, Manrope, spacing scale, and motion timings.
Real photos use an 8:5 crop, reserved dimensions, lazy loading, and descriptive
alt text. All ten currently use the supplied Purbaya cutout as a labelled example.
Names and descriptions remain stubs; no student faces or roles are invented.
Interactive preview cards have keyboard focus, hover/press feedback, and reduced
motion support. The directory's information cards do not pretend to be buttons.

## Leadership hierarchy

Homepage section 05 stacks a teacher-advisor area, four student leadership roles,
and four department previews. `/anggota` follows the same hierarchy. Ketua,
Wakil Ketua, Sekretaris, and Bendahara each have a separate card. Student/staff
names remain unset until supplied; the Purbaya photographs are explicit examples.
The advisor uses the newly supplied sitting photograph. Four-column desktop
rows wrap into two on tablets and one on small phones. All card headings follow
the surrounding section hierarchy and reuse the same image, spacing, and motion
tokens. The ten-card `/sekbid` directory remains complete.

## Developer joke

`boobnavbar`, `bumassbar`, and `fucknutcard` are cosmetic alias classes on semantic
components. Descriptive class names remain alongside them for maintenance.
The console warning is a joke and self-XSS reminder, not an access control.
Do not add debugger loops, DevTools detection, disabled keyboard shortcuts,
blocked context menus, or suppressed logs.


## Notification island

A dark capsule appears only for a real client event or approved activity within
its finite start/end window. Empty configuration leaves the navbar untouched.
Desktop keeps the full school identity, all navigation links, and the aspiration
button. The capsule uses the spare slot between identity and navigation; a narrow
slot switches to an accessible icon. Active mobile notices add a second navbar
row. No automatic static message or permanent preview placeholder appears.

The compact preview scrolls rightwards only if its text overflows. Hover/focus
pauses it; reduced motion uses ellipsis with readable detail on click. Desktop
opens a white card below the navbar, aligned to the trigger and clamped to the
viewport. Mobile opens a white modal bottom sheet, with rounded corners, handle,
dim backdrop, readable title/message, and an optional orange activity button.
Sheets fit content up to 75dvh and scroll internally. Swipe is limited to the
handle; buttons and Escape remain available. Closing returns to the preview.

Timing follows the official LottieFiles Motion Design skill: calm corporate
character, `cubic-bezier(.2, 0, 0, 1)` entrances, `.3, 0, 1, 1` exits; preview
240ms, desktop card 320ms, mobile sheet 360ms, close 220ms. Content follows by
60ms with a subtle 8px reveal. Reduced motion replaces movement with an 80ms fade.
Native dialog controls focus/inert state on mobile; desktop leaves menus usable.
Animation uses transform/opacity and responds to interrupted inputs and resize.
Source: https://github.com/LottieFiles/motion-design-skill/tree/main/skills/motion-design

## School-photo hero

Lead with Vimsati Natta Darsa and explicitly label OSIS SMK Diponegoro 01.
Pair the typography with the real school photo, an understated term chip,
and a readable campus caption. The two-column desktop layout stacks on mobile.
Responsive WebP sizes, eager hero loading, shared spacing, and the existing
orange palette keep the page lightweight and consistent.


## Profile pages and program detail

Named core profiles and each department have a static detail URL. Photo preview,
breadcrumbs, numbered sections, orange cadence pills, and result documentation
share one layout. Program explanations use native accessible disclosures with
subtle transform/opacity entry. The main vision/mission appears on the homepage;
individual and department pages focus on people, planned work, and real results.
Plans never appear as completed work. Missing rosters/results use honest empty
states. Source and cadence decisions are recorded in CONTENT-SOURCES.md.

## Identity settings and social motion

Cabinet name, logo, academic year and verified section 02 counts come from the
published CMS document. A null count keeps its example label; 0 is an exact count,
without a plus suffix. Updated counts retain the matrix entrance when in view.
Footer contacts use Gmail, Instagram and TikTok SVG logos, keyboard focus and
responsive wrapping. Corporate motion follows the LottieFiles skill: small
2px card lift, secondary icon/arrow movement, pale orange surface response,
100ms press and 240ms settling, with movement disabled for reduced motion.
