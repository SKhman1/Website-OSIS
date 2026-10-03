import type { Announcement } from '../content/announcements';

const kinds = new Set(['live', 'event', 'info']);

/** Only complete, approved notices within a finite activity window are public. */
export function activeAnnouncement(notices: Announcement[], dismissed: ReadonlySet<string>, now = Date.now()) {
  return notices.find(item => item && kinds.has(item.kind) && typeof item.id === 'string' && item.id.trim() &&
    typeof item.title === 'string' && item.title.trim() && typeof item.message === 'string' && item.message.trim() &&
    !dismissed.has(item.id) && !!item.startsAt && !!item.endsAt && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now);
}
