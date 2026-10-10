import type { Announcement } from '../content/announcements';
import { activeAnnouncement } from '../lib/announcements';

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

/** Call only after a real event, such as a confirmed aspiration receipt. */
export function notify(notification: Notification) {
  window.dispatchEvent(new CustomEvent<Notification>('osis:notification', { detail: notification }));
}

const host = document.querySelector<HTMLElement>('[data-notification-island]');
if (host) initialize(host);

function initialize(host: HTMLElement) {
  const shell = host.querySelector<HTMLElement>('[data-island-shell]')!;
  const title = host.querySelector<HTMLElement>('[data-island-title]')!;
  const textWindow = host.querySelector<HTMLElement>('[data-island-window]')!;
  const track = host.querySelector<HTMLElement>('[data-island-track]')!;
  const copy = host.querySelector<HTMLElement>('[data-island-copy]')!;
  const icon = host.querySelector<HTMLElement>('[data-island-icon]')!;
  const toggle = host.querySelector<HTMLButtonElement>('[data-island-toggle]')!;
  const dismissButton = host.querySelector<HTMLButtonElement>('[data-island-dismiss]')!;
  const panel = host.querySelector<HTMLDialogElement>('[data-island-panel]')!;
  const panelIcon = panel.querySelector<HTMLElement>('[data-island-panel-icon]')!;
  const label = panel.querySelector<HTMLElement>('[data-island-label]')!;
  const detailTitle = panel.querySelector<HTMLElement>('[data-island-detail-title]')!;
  const message = panel.querySelector<HTMLElement>('[data-island-message]')!;
  const link = panel.querySelector<HTMLAnchorElement>('[data-island-link]')!;
  const close = panel.querySelector<HTMLButtonElement>('[data-island-close]')!;
  const done = panel.querySelector<HTMLButtonElement>('[data-island-done]')!;
  const handle = panel.querySelector<HTMLButtonElement>('[data-island-handle]')!;
  const body = panel.querySelector<HTMLElement>('[data-island-body]')!;
  const header = host.closest<HTMLElement>('.site-header')!;
  const announcer = document.querySelector<HTMLElement>('[data-island-announcer]')!;
  const menu = header.querySelector<HTMLDetailsElement>('details.mobile-menu');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 1200px)');
  const labels = { success: 'Aspirasi diterima', live: 'Sedang berlangsung', event: 'Agenda OSIS', info: 'Kabar OSIS' };
  const dismissed = new Set<string>();
  let approved: Announcement[] = [];
  try { const data = JSON.parse(host.dataset.announcements || '[]'); approved = Array.isArray(data) ? data : []; } catch { /* No notices. */ }
  try { (JSON.parse(sessionStorage.getItem('osis-dismissed-notices') || '[]') as string[]).forEach(id => dismissed.add(id)); } catch { /* Optional storage. */ }
  // Desktop popover and mobile top-layer sheet share one accessible dialog.
  document.body.append(panel);
  let current: Notification | undefined;
  let scheduled = false;
  const queue: Notification[] = [];
  let previewAnimation: Animation | undefined;
  let panelAnimation: Animation | undefined;
  let contentAnimation: Animation | undefined;
  let iconAnimation: Animation | undefined;
  let marquee: Animation | undefined;
  let tickerFrame = 0;
  let timer = 0;
  let deadline = 0;
  let remaining = 0;
  let timerAction: (() => void) | undefined;
  let receiptTimerNeeded = false;
  let hovering = false;
  let revision = 0;
  let detailRevision = 0;
  let phase: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  let drag: { id: number; start: number; time: number; y: number } | undefined;
  let suppressHandleClick = false;

  function motion(element: HTMLElement, frames: Keyframe[], duration: number, exit = false) {
    return element.animate(reduced.matches ? [{ opacity: 0 }, { opacity: 1 }] : frames,
      { duration: reduced.matches ? 80 : duration, easing: exit ? 'cubic-bezier(.3, 0, 1, 1)' : 'cubic-bezier(.2, 0, 0, 1)' });
  }
  function isPaused() {
    return document.hidden || hovering || !!menu?.open || phase !== 'closed' || shell.contains(document.activeElement);
  }
  function pauseTimer() {
    if (!timer) return;
    clearTimeout(timer); timer = 0;
    remaining = Math.max(0, deadline - performance.now());
  }
  function resumeTimer() {
    if (timer || !timerAction || isPaused()) return;
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
  function pauseMarquee() { marquee?.pause(); }
  function resumeMarquee() { if (!reduced.matches && !isPaused()) marquee?.play(); }
  function startMarquee() {
    marquee?.cancel(); marquee = undefined; copy.hidden = true;
    if (!current || host.hidden || phase !== 'closed') return;
    const visible = textWindow.getClientRects().length > 0 && textWindow.clientWidth > 0;
    const period = title.scrollWidth + 48;
    const duration = Math.max(10000, period / 32 * 1000);
    if (visible && title.scrollWidth > textWindow.clientWidth + 2 && !reduced.matches) {
      copy.hidden = false;
      // A second accessible-hidden copy keeps the requested rightward ticker seamless.
      marquee = track.animate([{ transform: `translateX(${-period}px)` }, { transform: 'translateX(0)' }],
        { duration, delay: 1000, iterations: Infinity, easing: 'linear' });
      if (isPaused()) pauseMarquee();
    }
    if (receiptTimerNeeded && !scheduled) {
      receiptTimerNeeded = false;
      schedule(() => { void dismiss(false); }, Math.max(12000, current.duration || 0, visible && !reduced.matches ? duration + 2500 : 0));
    }
  }
  function updateTicker() {
    cancelAnimationFrame(tickerFrame);
    tickerFrame = requestAnimationFrame(startMarquee);
  }
  function positionPanel() {
    if (!panel.open || mobile.matches) return;
    const anchor = shell.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const width = document.documentElement.clientWidth;
    const left = Math.max(16, Math.min(anchor.left + anchor.width / 2 - panelWidth / 2, width - panelWidth - 16));
    const top = header.getBoundingClientRect().bottom + 10;
    panel.style.setProperty('--notification-left', `${left}px`);
    panel.style.setProperty('--notification-top', `${top}px`);
  }
  function finishPanel() {
    detailRevision++;
    panelAnimation?.cancel(); contentAnimation?.cancel(); iconAnimation?.cancel();
    panel.style.transform = '';
    panel.close();
    panel.dataset.state = 'closed';
    phase = 'closed'; drag = undefined;
    delete document.documentElement.dataset.notificationModal;
    toggle.setAttribute('aria-expanded', 'false');
  }
  async function openDetails() {
    if (!current || phase === 'open' || phase === 'opening') return;
    const version = ++detailRevision;
    const before = phase === 'closing' ? panel.getBoundingClientRect() : shell.getBoundingClientRect();
    panelAnimation?.cancel(); contentAnimation?.cancel(); iconAnimation?.cancel();
    panel.style.transform = '';
    phase = 'opening'; panel.dataset.state = 'opening';
    toggle.setAttribute('aria-expanded', 'true');
    pauseTimer(); pauseMarquee();
    if (!panel.open) {
      if (mobile.matches) { document.documentElement.dataset.notificationModal = 'true'; panel.showModal(); }
      else panel.show();
    }
    positionPanel();
    const after = panel.getBoundingClientRect();
    const x = before.left + before.width / 2 - after.left - after.width / 2;
    const y = before.top - after.top;
    const frames = mobile.matches ? [
      { transform: 'translateY(calc(100% + 24px))', opacity: 1 },
      { transform: 'translateY(28%)', opacity: 1, offset: .45 },
      { transform: 'translateY(0)', opacity: 1 },
    ] : [
      { transform: `translate(${x}px, ${y}px) scale(${before.width / after.width}, ${before.height / after.height})`, opacity: .35 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ];
    panelAnimation = motion(panel, frames, mobile.matches ? 360 : 320);
    if (!reduced.matches) {
      contentAnimation = body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 220, delay: 60, fill: 'backwards', easing: 'cubic-bezier(.2, 0, 0, 1)' });
      iconAnimation = panelIcon.animate([{ transform: 'scale(.88)' }, { transform: 'scale(1)' }],
        { duration: 200, delay: 40, fill: 'backwards', easing: 'cubic-bezier(.2, 0, 0, 1)' });
    }
    close.focus({ preventScroll: true });
    try { await panelAnimation.finished; } catch { /* Interrupted. */ }
    if (version === detailRevision) { phase = 'open'; panel.dataset.state = 'open'; }
  }
  async function closeDetails(restoreFocus = true) {
    if (!panel.open || phase === 'closing') return;
    const version = ++detailRevision;
    const start = getComputedStyle(panel).transform;
    panelAnimation?.cancel(); contentAnimation?.cancel(); iconAnimation?.cancel();
    phase = 'closing'; panel.dataset.state = 'closing';
    const before = panel.getBoundingClientRect();
    const anchor = shell.getBoundingClientRect();
    const x = anchor.left + anchor.width / 2 - before.left - before.width / 2;
    const y = anchor.top - before.top;
    panelAnimation = panel.animate(reduced.matches ? [{ opacity: 1 }, { opacity: 0 }] : [
      { transform: start === 'none' ? panel.style.transform || 'translate(0, 0) scale(1)' : start, opacity: 1 },
      { transform: mobile.matches ? 'translateY(calc(100% + 24px))' : `translate(${x}px, ${y}px) scale(${anchor.width / before.width}, ${anchor.height / before.height})`, opacity: mobile.matches ? 1 : 0 },
    ], { duration: reduced.matches ? 80 : 220, easing: 'cubic-bezier(.3, 0, 1, 1)' });
    try { await panelAnimation.finished; } catch { /* Interrupted. */ }
    if (version !== detailRevision) return;
    finishPanel();
    if (restoreFocus && !host.hidden) toggle.focus({ preventScroll: true });
    updateTicker(); resumeTimer();
  }
  function activeNotice() { return activeAnnouncement(approved, dismissed); }
  function safeHref(value?: string) {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.origin);
      return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === location.protocol) ? url.href : undefined;
    } catch { return undefined; }
  }
  function show(item: Notification, fromSchedule = false) {
    revision++;
    schedule();
    if (panel.open) finishPanel();
    previewAnimation?.cancel();
    current = item; scheduled = fromSchedule; receiptTimerNeeded = !fromSchedule;
    host.hidden = false;
    header.dataset.islandActive = 'true';
    document.documentElement.dataset.islandActive = 'true';
    shell.dataset.kind = item.kind;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `${labels[item.kind]}. ${item.title} ${item.message} Buka detail notifikasi`);
    label.textContent = labels[item.kind];
    title.textContent = `${item.title} — ${item.message}`;
    copy.textContent = title.textContent; copy.hidden = true;
    detailTitle.textContent = item.title;
    message.textContent = item.message;
    const glyph = item.kind === 'success' ? '✓' : item.kind === 'live' ? '●' : item.kind === 'event' ? '↗' : 'i';
    icon.textContent = glyph; panelIcon.textContent = glyph;
    const href = safeHref(item.href);
    link.hidden = !href;
    if (href) {
      link.href = href;
      link.replaceChildren(document.createTextNode(item.linkLabel || 'Lihat kegiatan'), Object.assign(document.createElement('span'), { textContent: ' ↗' }));
      link.lastElementChild?.setAttribute('aria-hidden', 'true');
    } else link.removeAttribute('href');
    announcer.textContent = item.announce === false ? '' : `${labels[item.kind]}. ${item.title} ${item.message}`;
    previewAnimation = motion(shell, [{ transform: 'translateY(-8px) scale(.96)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], 240);
    updateTicker();
  }
  async function dismiss(remember: boolean) {
    if (!current) return;
    const version = ++revision;
    const focusedInside = shell.contains(document.activeElement) || panel.contains(document.activeElement);
    if (remember && scheduled) {
      dismissed.add(current.id);
      try { sessionStorage.setItem('osis-dismissed-notices', JSON.stringify([...dismissed])); } catch { /* Optional. */ }
    }
    schedule();
    if (panel.open) finishPanel();
    previewAnimation?.cancel();
    previewAnimation = shell.animate(reduced.matches ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(-8px) scale(.96)', opacity: 0 }],
      { duration: reduced.matches ? 80 : 180, easing: 'cubic-bezier(.3, 0, 1, 1)' });
    try { await previewAnimation.finished; } catch { /* Interrupted. */ }
    if (version !== revision) return;
    marquee?.cancel();
    current = undefined; host.hidden = true; scheduled = false;
    delete header.dataset.islandActive;
    delete document.documentElement.dataset.islandActive;
    const queued = queue.shift();
    const active = activeNotice();
    if (queued) show(queued);
    else if (active) show(active, true);
    if (focusedInside) {
      if (current) toggle.focus({ preventScroll: true });
      else header.querySelector<HTMLAnchorElement>('.brand')?.focus({ preventScroll: true });
    }
  }
  window.addEventListener('osis:notification', event => {
    const item = (event as CustomEvent<Notification>).detail;
    if (!item || !Object.hasOwn(labels, item.kind) || !item.id || !item.title || !item.message) return;
    if (!current || item.kind === 'success') show(item);
    else if (current.id !== item.id && !queue.some(entry => entry.id === item.id)) queue.push(item);
  });
  toggle.addEventListener('click', () => { if (phase === 'closed' || phase === 'closing') void openDetails(); else void closeDetails(); });
  dismissButton.addEventListener('click', () => { void dismiss(true); });
  close.addEventListener('click', () => { void closeDetails(); });
  done.addEventListener('click', () => { void closeDetails(); });
  panel.addEventListener('cancel', event => { event.preventDefault(); void closeDetails(); });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); void closeDetails(); }
  });
  shell.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); if (panel.open) void closeDetails(); else void dismiss(true); }
  });
  shell.addEventListener('pointerenter', () => { hovering = true; pauseTimer(); pauseMarquee(); });
  shell.addEventListener('pointerleave', () => { hovering = false; resumeTimer(); resumeMarquee(); });
  shell.addEventListener('focusin', () => { pauseTimer(); pauseMarquee(); });
  shell.addEventListener('focusout', () => { queueMicrotask(() => { resumeTimer(); resumeMarquee(); }); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseTimer(); pauseMarquee(); }
    else { refresh(); scheduleBoundary(); resumeTimer(); resumeMarquee(); }
  });
  document.addEventListener('focusin', event => {
    // A desktop popover yields to every other control, including navbar links.
    if (!mobile.matches && panel.open && !panel.contains(event.target as Node) && !shell.contains(event.target as Node)) void closeDetails(false);
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.open || panel.contains(event.target as Node) || shell.contains(event.target as Node)) return;
    void closeDetails(false);
  });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void closeDetails();
  });
  menu?.addEventListener('toggle', () => {
    if (menu.open && panel.open) void closeDetails(false);
    host.classList.toggle('island-menu-clear', menu.open);
    if (menu.open) { pauseTimer(); pauseMarquee(); }
    else { resumeTimer(); resumeMarquee(); }
  });
  handle.addEventListener('click', () => { if (!suppressHandleClick) void closeDetails(); });
  handle.addEventListener('pointerdown', event => {
    if (!mobile.matches || phase !== 'open' || !event.isPrimary || event.button !== 0) return;
    panelAnimation?.cancel();
    drag = { id: event.pointerId, start: event.clientY, time: performance.now(), y: 0 };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.y = Math.max(0, event.clientY - drag.start);
    if (!reduced.matches) panel.style.transform = `translateY(${drag.y}px)`;
  });
  function finishDrag(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const gesture = drag; drag = undefined;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    suppressHandleClick = gesture.y > 5;
    window.setTimeout(() => { suppressHandleClick = false; }, 0);
    const velocity = gesture.y / Math.max(1, performance.now() - gesture.time);
    if (event.type !== 'pointercancel' && (gesture.y > 64 || (gesture.y > 15 && velocity > .55))) void closeDetails();
    else {
      const transform = panel.style.transform || 'translateY(0)'; panel.style.transform = '';
      if (!reduced.matches) panelAnimation = motion(panel, [{ transform }, { transform: 'translateY(0)' }], 220);
    }
  }
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
  reduced.addEventListener('change', () => {
    previewAnimation?.cancel();
    [panelAnimation, contentAnimation, iconAnimation].forEach(item => { if (item?.playState === 'running') item.finish(); });
    updateTicker();
  });
  mobile.addEventListener('change', () => {
    if (!panel.open) return;
    finishPanel();
    void openDetails();
  });
  new ResizeObserver(() => { positionPanel(); updateTicker(); }).observe(host);
  new ResizeObserver(updateTicker).observe(textWindow);
  window.addEventListener('resize', positionPanel);
  window.addEventListener('scroll', positionPanel, { passive: true });
  function refresh() {
    const active = activeNotice();
    if (!current && active) show(active, true);
    else if (current && scheduled && active?.id !== current.id) void dismiss(false);
  }
  refresh();
  let boundaryTimer = 0;
  function scheduleBoundary() {
    clearTimeout(boundaryTimer);
    const now = Date.now();
    const next = approved.flatMap(item => item ? [Date.parse(item.startsAt), Date.parse(item.endsAt)] : []).filter(time => time > now).sort((a, b) => a - b)[0];
    if (next) boundaryTimer = window.setTimeout(() => { refresh(); scheduleBoundary(); }, Math.min(next - now + 10, 2147483647));
  }
  scheduleBoundary();
  window.addEventListener('osis:announcements', event => {
    const items = (event as CustomEvent<Announcement[]>).detail;
    if (Array.isArray(items)) { approved = items; refresh(); scheduleBoundary(); }
  });
  window.addEventListener('pagehide', () => { pauseTimer(); pauseMarquee(); previewAnimation?.cancel(); cancelAnimationFrame(tickerFrame); });
  window.addEventListener('pageshow', () => { resumeTimer(); resumeMarquee(); refresh(); scheduleBoundary(); });
}
