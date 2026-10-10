import assert from 'node:assert/strict';
import test from 'node:test';
import { activeAnnouncement } from '../src/lib/announcements';
import type { Announcement } from '../src/content/announcements';

const now = Date.parse('2026-10-03T12:00:00+07:00');
const active: Announcement = { id: 'rundown', kind: 'event', title: 'Rundown kegiatan', message: 'Agenda yang disetujui pengurus.',
  startsAt: '2026-10-03T11:00:00+07:00', endsAt: '2026-10-03T13:00:00+07:00' };
const dismissed = new Set<string>();

test('an empty activity list never creates a notification', () => {
  assert.equal(activeAnnouncement([], dismissed, now), undefined);
});
test('only an active approved window is visible, including its starting instant', () => {
  assert.equal(activeAnnouncement([active], dismissed, now), active);
  assert.equal(activeAnnouncement([active], dismissed, Date.parse(active.startsAt)), active);
});
test('future and expired activities are hidden, including their ending instant', () => {
  assert.equal(activeAnnouncement([active], dismissed, Date.parse(active.startsAt) - 1), undefined);
  assert.equal(activeAnnouncement([active], dismissed, Date.parse(active.endsAt)), undefined);
});
test('undated static banners, malformed dates, and empty content stay hidden', () => {
  for (const invalid of [
    { ...active, startsAt: undefined }, { ...active, endsAt: undefined },
    { ...active, startsAt: 'invalid' }, { ...active, endsAt: 'invalid' },
    { ...active, title: ' ' }, { ...active, message: '' },
  ]) assert.equal(activeAnnouncement([invalid as unknown as Announcement], dismissed, now), undefined);
});
test('dismissing one active activity still allows another approved activity', () => {
  const next = { ...active, id: 'next' };
  assert.equal(activeAnnouncement([active], new Set([active.id]), now), undefined);
  assert.equal(activeAnnouncement([active, next], new Set([active.id]), now), next);
});
