# Battlebike

A lane-runner prototype: night highway, five lanes, a procedurally generated bike, and burning oil barrels to dodge.

Swipe left and right to change lanes (or use the arrow keys / A and D). Tap after a wipeout to ride again.

## Run it

```
npm install
npm run dev        # then open the address it prints (also works from a phone on the same wifi)
npm test           # rules tests, no browser needed
npm run build      # site in dist/ (game + garage)
npm run build:single   # one self-contained file: dist-single/index.html
```

Useful addresses while developing:

- `/#debug` (or press the backquote key) opens a panel of sliders for the rules and the look.
- `/?seed=3&bike=11` fixes the obstacle layout and the bike. `&skip=200` starts 200 m down the road.
- `/garage.html` shows a turning contact sheet of generated bikes. Tap for a new set.
- Press `B` in the game, or the New bike button, for a different bike.

## How it's organised

The rules and the drawing are kept apart, so either can change without disturbing the other.

```
src/sim/       The rules. Plain data, fixed 60 Hz step, seeded randomness. No Three.js, no DOM.
  sim.ts         state, step(), intents in, events out
  tuning.ts      every gameplay number
  rng.ts         seeded random numbers
src/input/     Keyboard and touch, turned into intents ("change lane left").
src/render/    Everything you see. Reads the state, listens to events, never changes the rules.
  view.ts        camera, bike lights, bloom, shake
  world.ts       road, barriers, streetlights, skyline
  bike.ts        bike generator: seed -> BikeSpec (data) -> model
  fires.ts       barrel fires
  trail.ts       tail-light streak
src/hud.ts     Distance, speed, banners.
src/main.ts    Wires it together.
test/          Rules tests (determinism, every row passable, crash behaviour).
```

Adding a mechanic usually means: a new intent in `src/input`, a rule and an event in `src/sim`, numbers in `tuning.ts`, and something in `src/render` that reacts to the event.

Lighting is deliberately cheap. Most light is faked with bright materials, soft additive patches on the road, and bloom. Only a few real lights exist (headlight, tail light, three streetlights, three fires) and they move to whatever is nearest the bike.
