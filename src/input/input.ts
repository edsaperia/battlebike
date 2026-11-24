/**
 * Input devices turn into intents here. The simulation never sees a key or a
 * finger, so new control schemes are new files in this folder.
 */
import type { Intent } from '../sim/sim';

export class IntentQueue {
  private queue: Intent[] = [];
  /** Called for any press or tap, whatever it means (used for "tap to restart"). */
  onAnyPress: (() => void) | null = null;

  push(intent: Intent): void {
    this.queue.push(intent);
  }

  drain(): Intent[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }
}

export function attachKeyboard(q: IntentQueue): void {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') q.push({ type: 'lane', dir: -1 });
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') q.push({ type: 'lane', dir: 1 });
    else if (e.key === ' ' || e.key === 'Enter') q.onAnyPress?.();
  });
}

/**
 * Swipe left or right to change lane. A long swipe keeps going: every
 * `threshold` pixels of travel is another lane.
 */
export function attachSwipe(q: IntentQueue, el: HTMLElement, threshold = 26): void {
  let active: number | null = null;
  let originX = 0;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    originX = e.clientX;
    moved = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not every pointer can be captured; swipes still work without it */
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    const dx = e.clientX - originX;
    if (Math.abs(dx) >= threshold) {
      q.push({ type: 'lane', dir: dx > 0 ? 1 : -1 });
      originX = e.clientX;
      moved = true;
    }
  });

  const end = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    if (!moved) q.onAnyPress?.();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
