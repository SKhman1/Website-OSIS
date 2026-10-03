import type { Announcement } from '../content/announcements';

export interface Notification {
  id: string;
  kind: Announcement['kind'] | 'success';
  title: string;
  message: string;
  href?: string;
  linkLabel?: string;
  duration?: number;
  announce?: boolean;
}

/** One shared presentation for confirmed form receipts and approved notices. */
export function notify(notification: Notification) {
  window.dispatchEvent(new CustomEvent<Notification>('osis:notification', { detail: notification }));
}

const host = document.querySelector<HTMLElement>('[data-notification-island]');
if (host) initialize(host);

function initialize(host: HTMLElement) {
  const shell = host.querySelector<HTMLElement>('[data-island-shell]')!;
  const title = host.querySelector<HTMLElement>('[data-island-title]')!;
  const label = host.querySelector<HTMLElement>('[data-island-label]')!;
  const summary = host.querySelector<HTMLElement>('[data-island-summary]')!;
  const message = host.querySelector<HTMLElement>('[data-island-message]')!;
  const detail = host.querySelector<HTMLElement>('[data-island-detail]')!;
  const link = host.querySelector<HTMLAnchorElement>('[data-island-link]')!;
  const icon = host.querySelector<HTMLElement>('[data-island-icon]')!;
  const toggle = host.querySelector<HTMLButtonElement>('[data-island-toggle]')!;
  const close = host.querySelector<HTMLButtonElement>('[data-island-close]')!;
  const announcer = document.querySelector<HTMLElement>('[data-island-announcer]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const labels = { success: 'Aspirasi diterima', live: 'Sedang berlangsung', event: 'Agenda OSIS', info: 'Kabar OSIS' };
  const dismissed = new Set<string>();
  let approved: Announcement[] = [];
  try { approved = JSON.parse(host.dataset.announcements || '[]'); } catch { /* No notices. */ }
  try { (JSON.parse(sessionStorage.getItem('osis-dismissed-notices') || '[]') as string[]).forEach(id => dismissed.add(id)); } catch { /* Storage may be disabled. */ }
  let current: Notification | undefined;
  const queue: Notification[] = [];
  let animation: Animation | undefined;
  let timer = 0;
  let deadline = 0;
  let remaining = 0;
  let timerAction: (() => void) | undefined;
  let hovering = false;
  let revision = 0;

  function animate(frames: Keyframe[], duration = 480) {
    animation?.cancel();
    if (reduced.matches) return;
    animation = shell.animate(frames, { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }
  function pauseTimer() {
    if (!timer) return;
    clearTimeout(timer); timer = 0;
    remaining = Math.max(0, deadline - performance.now());
  }
  function resumeTimer() {
    if (timer || !timerAction || document.hidden || hovering || shell.contains(document.activeElement)) return;
    deadline = performance.now() + remaining;
    timer = window.setTimeout(() => {
      timer = 0;
      const action = timerAction; timerAction = undefined;
      action?.();
    }, remaining);
  }
  function schedule(action?: () => void, delay = 0) {
    clearTimeout(timer); timer = 0;
    timerAction = action; remaining = delay;
    resumeTimer();
  }
  function expand(expanded: boolean) {
    if (!current || shell.dataset.expanded === String(expanded)) return;
    animation?.cancel();
    const before = shell.getBoundingClientRect();
    shell.dataset.expanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    detail.hidden = !expanded;
    summary.hidden = expanded;
    const after = shell.getBoundingClientRect();
    // FLIP: commit the layout once, then animate compositor transforms only.
    animate([
      { transform: `scale(${before.width / after.width}, ${before.height / after.height})` },
      { transform: 'scale(1.012, 1.025)', offset: .7 },
      { transform: 'scale(1, 1)' },
    ], 440);
  }
  function activeNotice() {
    const now = Date.now();
    return approved.find(item => !dismissed.has(item.id) &&
      (!item.startsAt || Date.parse(item.startsAt) <= now) &&
      (!item.endsAt || Date.parse(item.endsAt) > now));
  }
  function safeHref(value?: string) {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.origin);
      return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === location.protocol) ? url.href : undefined;
    } catch { return undefined; }
  }
  function show(item: Notification) {
    revision++;
    animation?.cancel();
    current = item;
    host.hidden = false;
    host.classList.remove('island-focus-clear');
    shell.dataset.kind = item.kind;
    shell.dataset.expanded = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    label.textContent = labels[item.kind];
    title.textContent = item.title;
    summary.textContent = labels[item.kind];
    summary.hidden = true;
    message.textContent = item.message;
    detail.hidden = false;
    icon.textContent = item.kind === 'success' ? '✓' : item.kind === 'live' ? '●' : item.kind === 'event' ? '↗' : 'i';
    const href = safeHref(item.href);
    link.hidden = !href;
    if (href) {
      link.href = href;
      link.replaceChildren(document.createTextNode(item.linkLabel || 'Lihat kegiatan'), Object.assign(document.createElement('span'), { textContent: ' ↗' }));
      link.lastElementChild?.setAttribute('aria-hidden', 'true');
    } else link.removeAttribute('href');
    document.documentElement.dataset.islandActive = 'true';
    announcer.textContent = item.announce === false ? '' : `${labels[item.kind]}. ${item.title}. ${item.message}`;
    animate([
      { transform: 'translateY(-12px) scale(.82, .6)', opacity: 0 },
      { transform: 'translateY(0) scale(1.02, 1.035)', opacity: 1, offset: .72 },
      { transform: 'translateY(0) scale(1, 1)', opacity: 1 },
    ], 560);
    schedule(item.kind === 'success' ? () => dismiss(false) : () => expand(false), item.kind === 'success' ? Math.max(10000, item.duration || 12000) : 6500);
  }
  async function dismiss(remember: boolean) {
    if (!current) return;
    const version = ++revision;
    const focusedInside = shell.contains(document.activeElement);
    if (remember && current.kind !== 'success') {
      dismissed.add(current.id);
      try { sessionStorage.setItem('osis-dismissed-notices', JSON.stringify([...dismissed])); } catch { /* Optional. */ }
    }
    schedule();
    animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(-8px) scale(.92, .78)', opacity: 0 }], 220);
    try { await animation?.finished; } catch { /* Interruptions are expected. */ }
    if (version !== revision) return;
    current = undefined; host.hidden = true;
    delete document.documentElement.dataset.islandActive;
    const next = queue.shift() || activeNotice();
    if (next) show(next);
    if (focusedInside) {
      if (next) toggle.focus({ preventScroll: true });
      else document.querySelector<HTMLAnchorElement>('.site-header .brand')?.focus({ preventScroll: true });
    }
  }
  window.addEventListener('osis:notification', event => {
    const item = (event as CustomEvent<Notification>).detail;
    if (!item || !labels[item.kind] || !item.id || !item.title || !item.message) return;
    if (!current || item.kind === 'success') show(item);
    else if (!queue.some(entry => entry.id === item.id)) queue.push(item);
  });
  toggle.addEventListener('click', () => { schedule(); expand(shell.dataset.expanded !== 'true'); });
  close.addEventListener('click', () => { void dismiss(true); });
  shell.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); void dismiss(true); }
  });
  shell.addEventListener('pointerenter', () => { hovering = true; pauseTimer(); });
  shell.addEventListener('pointerleave', () => { hovering = false; resumeTimer(); });
  shell.addEventListener('focusin', pauseTimer);
  shell.addEventListener('focusout', () => { queueMicrotask(resumeTimer); });
  document.addEventListener('visibilitychange', () => document.hidden ? pauseTimer() : resumeTimer());
  document.addEventListener('focusin', event => {
    host.classList.remove('island-focus-clear');
    if (host.hidden || shell.contains(event.target as Node) || !(event.target instanceof HTMLElement)) return;
    const focus = event.target.getBoundingClientRect();
    const island = shell.getBoundingClientRect();
    if (focus.bottom > island.top && focus.top < island.bottom && focus.right > island.left && focus.left < island.right) {
      host.classList.add('island-focus-clear');
    }
  });
  document.querySelector('details.mobile-menu')?.addEventListener('toggle', event => {
    host.classList.toggle('island-menu-clear', (event.target as HTMLDetailsElement).open);
  });
  reduced.addEventListener('change', () => { if (reduced.matches) animation?.cancel(); });
  function refresh() {
    const active = activeNotice();
    if (!current && active) show(active);
    else if (current && current.kind !== 'success' && approved.some(item => item.id === current!.id) && active?.id !== current.id) void dismiss(false);
  }
  refresh();
  if (approved.length) window.setInterval(refresh, 60000);
  window.addEventListener('pagehide', () => { pauseTimer(); animation?.cancel(); });
  window.addEventListener('pageshow', () => { resumeTimer(); refresh(); });
  // The interval has no network requests; only published schedule boundaries.
}
