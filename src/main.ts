/**
 * Wires the pieces together: input -> intents -> simulation -> events -> view.
 * The simulation runs on a fixed 60 Hz step; drawing runs as fast as the screen.
 */
import { Hud } from './hud';
import { attachKeyboard, attachSwipe, IntentQueue } from './input/input';
import { look, View } from './render/view';
import { createState, step, STEP, type SimState } from './sim/sim';
import { tuning } from './sim/tuning';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const newSeed = () => Math.floor(Math.random() * 100000);

const params = new URLSearchParams(location.search);
const view = new View(canvas, tuning, Number(params.get('bike')) || newSeed());
const hud = new Hud(() => {
  view.setBike(newSeed());
  hud.setBikeSeed(view.bikeSeed);
});
hud.setBikeSeed(view.bikeSeed);

let state: SimState = createState(Number(params.get('seed')) || newSeed());
let crashedAt = -1;
// For development: ?skip=200 starts the run 200 m down the road.
const skip = Number(params.get('skip')) || 0;
while (state.dist < skip) step(state, [], tuning);

const input = new IntentQueue();
attachKeyboard(input);
attachSwipe(input, canvas);
input.onAnyPress = () => {
  // A short pause after a crash, so a panicked swipe doesn't skip the result.
  if (!state.alive && state.time - crashedAt > 0.6) restart();
};

function restart(): void {
  state = createState(newSeed());
  crashedAt = -1;
  view.reset();
  input.drain();
  hud.showStart();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'b' || e.key === 'B') {
    view.setBike(newSeed());
    hud.setBikeSeed(view.bikeSeed);
  }
});

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    const events = step(state, input.drain(), tuning);
    view.handle(events, state);
    for (const e of events) {
      if (e.type === 'crash') {
        crashedAt = state.time;
        hud.showCrash(state.dist);
      }
    }
    acc -= STEP;
  }
  hud.update(state);
  view.render(state, acc / STEP, dt);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
});

hud.showStart();
requestAnimationFrame(frame);

// Handy in the browser console, and for automated checks.
(window as unknown as Record<string, unknown>).battlebike = {
  get state() {
    return state;
  },
  tuning,
  look,
};

// Debug panel: add #debug to the address, or press the backquote key.
let panelOpen = false;
async function openPanel(): Promise<void> {
  if (panelOpen) return;
  panelOpen = true;
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'Battlebike' });
  const rules = gui.addFolder('Rules');
  rules.add(tuning, 'startSpeed', 5, 60, 1);
  rules.add(tuning, 'maxSpeed', 20, 120, 1);
  rules.add(tuning, 'accel', 0, 4, 0.05);
  rules.add(tuning, 'laneChangeTime', 0.03, 0.4, 0.01);
  rules.add(tuning, 'rowGapSeconds', 0.4, 2.5, 0.05);
  rules.add(tuning, 'hitHalfLanes', 0.1, 0.6, 0.01);
  rules.add({ restart }, 'restart');
  const looks = gui.addFolder('Look');
  looks.add(look, 'bloomStrength', 0, 2, 0.05);
  looks.add(look, 'bloomRadius', 0, 1, 0.05);
  looks.add(look, 'bloomThreshold', 0, 1.5, 0.05);
  looks.add(look, 'exposure', 0.3, 2.5, 0.05);
  looks.add(look, 'trailLength', 0, 30, 0.5);
  looks.add(look, 'shake', 0, 3, 0.1);
}
if (location.hash === '#debug') void openPanel();
window.addEventListener('keydown', (e) => {
  if (e.key === '`') void openPanel();
});
