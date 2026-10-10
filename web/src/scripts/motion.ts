// Small, framework-free motion layer. Server-rendered content remains readable
// if JavaScript is unavailable. Native MPA navigation keeps lifecycle simple.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeAnimations = new Set<Animation>();
let revealObserver: IntersectionObserver | undefined;
let statsObserver: IntersectionObserver | undefined;
let counterFrame = 0;
let finishCounters: (() => void) | undefined;

function finishMotion() {
  revealObserver?.disconnect();
  statsObserver?.disconnect();
  cancelAnimationFrame(counterFrame);
  finishCounters?.();
  activeAnimations.forEach(animation => animation.cancel());
  activeAnimations.clear();
  document.querySelectorAll<HTMLElement>('[data-motion-state="pending"]').forEach(element => {
    element.dataset.motionState = 'done';
  });
}

function reveal(element: HTMLElement) {
  element.dataset.motionState = 'done';
  if (preference.matches || typeof element.animate !== 'function') return;
  const animation = element.animate([
    { opacity: 0, transform: 'translateY(18px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], {
    duration: element.dataset.motion === 'hero' ? 560 : 440,
    delay: Math.min(Number(element.dataset.delay) || 0, 400),
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    fill: 'backwards',
  });
  activeAnimations.add(animation);
  animation.finished.then(() => activeAnimations.delete(animation)).catch(() => activeAnimations.delete(animation));
}

function animateStatistics(group: HTMLElement) {
  if (group.dataset.counterState) return;
  group.dataset.counterState = 'running';
  const counters = Array.from(group.querySelectorAll<HTMLElement>('[data-counter]'));
  const startedAt = performance.now();
  const duration = 900;
  let previousUpdate = -Infinity;
  const finalValue = (element: HTMLElement) => String(Number(element.dataset.value)).padStart(2, '0');

  finishCounters = () => {
    counters.forEach(element => { element.textContent = finalValue(element); });
    group.dataset.counterState = 'done';
    group.classList.remove('is-decoding');
  };

  if (preference.matches) {
    finishCounters();
    return;
  }

  group.classList.add('is-decoding');
  // A single RAF drives all three counters. Text changes are capped at ~14fps,
  // fixed-width digits prevent layout shifts, and the sequence runs only once.
  const tick = (now: number) => {
    if (preference.matches || document.hidden) {
      finishCounters?.();
      return;
    }
    if (now - previousUpdate >= 70) {
      previousUpdate = now;
      counters.forEach((element, index) => {
        const progress = Math.max(0, Math.min(1, (now - startedAt - index * 140) / duration));
        if (progress === 0) return;
        const target = Number(element.dataset.value);
        const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
        const digits = String(value).padStart(finalValue(element).length, '0');
        // Matrix-like decode: unsettled digits scramble, then lock left to right
        // onto an ascending count. Screen readers get only the final SSR value.
        element.textContent = progress === 1 ? finalValue(element) : Array.from(digits, (digit, position) => {
          const lockAt = .25 + position / digits.length * .4;
          return progress >= lockAt ? digit : String(Math.floor(Math.random() * 10));
        }).join('');
      });
    }
    if (now - startedAt >= duration + (counters.length - 1) * 140) {
      finishCounters?.();
      return;
    }
    counterFrame = requestAnimationFrame(tick);
  };
  counterFrame = requestAnimationFrame(tick);
}

function initializeMotion() {
  if (preference.matches || !('IntersectionObserver' in window)) return;

  revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal(entry.target as HTMLElement);
      revealObserver?.unobserve(entry.target);
    });
  }, { threshold: .12 });

  document.querySelectorAll<HTMLElement>('[data-motion]').forEach(element => {
    if (element.dataset.motionState === 'done') return;
    if (element.dataset.motion === 'hero') {
      reveal(element);
    } else {
      element.dataset.motionState = 'pending';
      revealObserver?.observe(element);
    }
  });

  statsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const group = entry.target as HTMLElement;
      if (entry.isIntersecting) animateStatistics(group);
      else if (group.dataset.counterState === 'running') {
        cancelAnimationFrame(counterFrame);
        finishCounters?.();
      }
    });
  }, { threshold: .2 });
  document.querySelectorAll<HTMLElement>('[data-stats]').forEach(group => statsObserver?.observe(group));
}

initializeMotion();
preference.addEventListener('change', () => {
  if (preference.matches) finishMotion();
  else initializeMotion();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(counterFrame);
    finishCounters?.();
  }
});
window.addEventListener('pagehide', finishMotion);

// Close the native mobile menu after same-page navigation. No click interception
// for normal links, modified clicks, keyboard focus, or browser back/forward.
document.querySelector('.mobile-menu')?.addEventListener('click', event => {
  if ((event.target as HTMLElement).closest('a')) {
    document.querySelector<HTMLDetailsElement>('.mobile-menu')?.removeAttribute('open');
  }
});

// Published counts settle onto new values without replaying on every poll.
window.addEventListener('osis:statistics', () => {
  cancelAnimationFrame(counterFrame); finishCounters?.();
  document.querySelectorAll<HTMLElement>('[data-stats]').forEach(group => {
    const seen=Boolean(group.dataset.counterState);
    if(!seen)return;
    delete group.dataset.counterState;
    const rect=group.getBoundingClientRect();
    if(!preference.matches && rect.bottom>0 && rect.top<window.innerHeight)animateStatistics(group);
    else {group.dataset.counterState='done';group.querySelectorAll<HTMLElement>('[data-counter]').forEach(node=>node.textContent=String(Number(node.dataset.value)).padStart(2,'0'));}
  });
});
