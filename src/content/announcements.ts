export interface Announcement {
  id: string;
  kind: 'live' | 'event' | 'info';
  title: string;
  message: string;
  href?: string;
  linkLabel?: string;
  startsAt: string;
  endsAt: string;
}

// Add only approved announcements. Empty means no public island on page load.
// Every public notice requires startsAt and endsAt; outside that window it is hidden.
// Use ISO dates with +07:00 for Jakarta. Scheduling is checked in the browser.
// Example (leave disabled until real details are approved):
// { id: 'approved-event', kind: 'live', title: 'Actual event title',
//   message: 'Actual event details', href: '/#kegiatan',
//   startsAt: '2026-10-10T08:00:00+07:00', endsAt: '2026-10-10T12:00:00+07:00' }
export const announcements: Announcement[] = [];
