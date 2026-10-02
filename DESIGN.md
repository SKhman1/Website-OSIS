# OSIS Dipo 1 design foundation

Voice: Indonesian, clear, friendly, formal enough for a school organization.
Audience: students, school staff, and visitors. Primary jobs: understand OSIS,
find the approved 2026/2027 roster, follow activities, and eventually send an aspiration.

## Shared system

- One locally served variable font: Manrope, with weights defining hierarchy.
- Orange `#c64e16` is a provisional brand token, pending the official logo/colors.
- White canvas, green-neutral text/surfaces, pale orange identity panel.
- All colors, spacing, widths, and radii are centralized in `src/styles/global.css`.
- A 4px-based spacing scale; constrained reading widths; content-led layouts.
- No framework runtime in the browser. CSS and a small TypeScript motion module.
- Native mobile navigation with `details`; visible keyboard focus; reduced motion.
- The typographic `d.` mark is temporary, not the official school logo.
- Nixxie artwork and approved photography will be added when supplied.
- Do not invent student names, school policies, dates, or activity statistics.

## Motion and sections

Motion direction follows [LottieFiles Motion Design](https://github.com/LottieFiles/motion-design-skill):
Corporate personality with one easing curve, 160/320/560ms timing tokens,
small vertical reveals, staggered hero entry, responsive hover/press feedback,
and a brief ambient orbit entrance. No continuous loops or animation libraries.

Homepage sequence: 01 hero, 02 statistics, 03 about, 04 vision/mission,
05 programs, 06 activities, 07 aspirations. Other public pages have numbered,
labelled semantic sections with their own heading relationships.

Statistics contain explicitly labelled preview values until verified data is set
in `src/content/site.ts`. A one-shot viewport-triggered sequence scrambles digits,
then settles them from left to right onto ascending counts. Accessible text is
static; changing digits are hidden from screen readers. Fixed-width numerals
prevent horizontal layout shift. Reduced motion skips the sequence entirely.

All content stays visible without JS. Motion stops on hidden/unloaded pages,
and native cross-document view transitions gracefully fall back to normal
navigation. No SPA router, scroll interception, or React dependency is needed.

## Developer joke

`boobnavbar`, `bumassbar`, and `fucknutcard` are cosmetic alias classes on semantic
components. Descriptive class names remain alongside them for maintenance.
The console warning is a joke and self-XSS reminder, not an access control.
Do not add debugger loops, DevTools detection, disabled keyboard shortcuts,
blocked context menus, or suppressed logs.
