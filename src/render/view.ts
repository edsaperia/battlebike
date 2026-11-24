/**
 * Draws the simulation. It reads the state and listens to events; it never
 * changes the rules. Swap anything in here without touching src/sim.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SimEvent, SimState } from '../sim/sim';
import type { Tuning } from '../sim/tuning';
import { generateBike, type Bike } from './bike';
import { Fires } from './fires';
import { Trail } from './trail';
import { makeGroundGlow, palette, World } from './world';

export const look = {
  bloomStrength: 0.55,
  bloomRadius: 0.55,
  bloomThreshold: 0.9,
  exposure: 1.0,
  trailLength: 4.5,
  shake: 1,
};

export class View {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 900);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private world: World;
  private fires: Fires;
  private trail: Trail;
  private bike!: Bike;
  private bikeRoot = new THREE.Group();
  private headBeam = new THREE.SpotLight(0xfff0d8, 520, 80, 0.5, 0.75, 1.4);
  private tailGlow = new THREE.PointLight(0xff1a2e, 5, 7, 1.6);
  private underGlow: THREE.Mesh;
  private beamPool: THREE.Mesh;
  private shake = 0;
  private fovKick = 0;
  private crashTime = -1;
  private crashSide = 1;
  private lastX = 0;
  private lean = 0;
  private camX = 0;
  private frameCount = 0;
  private frameTime = 0;

  constructor(canvas: HTMLCanvasElement, private t: Tuning, bikeSeed: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = look.exposure;

    this.scene.background = new THREE.Color(palette.night);
    this.scene.fog = new THREE.Fog(palette.haze, 60, 330);

    this.scene.add(new THREE.HemisphereLight(0x3d3a9a, 0x140a12, 0.8));

    this.world = new World(t);
    this.scene.add(this.world.group);
    this.fires = new Fires(this.world.glowTex);
    this.scene.add(this.fires.group);

    this.trail = new Trail(0xff1a2e);
    this.scene.add(this.trail.mesh);

    this.scene.add(this.bikeRoot);
    this.scene.add(this.headBeam, this.headBeam.target, this.tailGlow);
    this.underGlow = makeGroundGlow(this.world.glowTex, palette.cyan, 2.2, 4.0, 0.4);
    this.beamPool = makeGroundGlow(this.world.glowTex, 0xfff0d8, 5, 16, 0.1);
    this.scene.add(this.underGlow, this.beamPool);
    this.setBike(bikeSeed);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), look.bloomStrength, look.bloomRadius, look.bloomThreshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setBike(seed: number): void {
    if (this.bike) {
      this.bikeRoot.remove(this.bike.group);
      this.bike.dispose();
    }
    this.bike = generateBike(seed);
    this.bikeRoot.add(this.bike.group);
    this.trail.setColor(this.bike.spec.tailColor);
    this.tailGlow.color.setHex(this.bike.spec.tailColor);
    const under = this.underGlow.material as THREE.MeshBasicMaterial;
    under.color.setHex(this.bike.spec.neonColor).multiplyScalar(0.4);
    this.underGlow.visible = this.bike.spec.underglow;
  }

  get bikeSeed(): number {
    return this.bike.spec.seed;
  }

  reset(): void {
    this.crashTime = -1;
    this.shake = 0;
    this.lean = 0;
    this.trail.reset();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** If the device can't hold a smooth frame rate, render at a lower resolution. */
  private adaptQuality(dt: number): void {
    this.frameCount++;
    this.frameTime += dt;
    if (this.frameCount < 90) return;
    const average = this.frameTime / this.frameCount;
    this.frameCount = 0;
    this.frameTime = 0;
    const ratio = this.renderer.getPixelRatio();
    if (average > 1 / 45 && ratio > 1) {
      this.renderer.setPixelRatio(Math.max(1, ratio - 0.5));
      this.resize();
    }
  }

  private laneToX = (lane: number): number =>
    (lane - (this.t.laneCount - 1) / 2) * this.t.laneWidth;

  handle(events: readonly SimEvent[], state: SimState): void {
    for (const e of events) {
      if (e.type === 'edgeBump') this.shake = Math.max(this.shake, 0.12);
      else if (e.type === 'nearMiss') {
        this.shake = Math.max(this.shake, 0.1);
        this.fovKick = Math.max(this.fovKick, 1.5);
      } else if (e.type === 'crash') {
        this.shake = 0.9;
        this.crashTime = state.time;
        this.crashSide = e.obstacle.lane >= state.laneX ? -1 : 1;
      }
    }
  }

  /** @param alpha how far we are between the last two simulation steps, 0..1 */
  render(state: SimState, alpha: number, dt: number): void {
    const dist = state.prevDist + (state.dist - state.prevDist) * alpha;
    const laneX = state.prevLaneX + (state.laneX - state.prevLaneX) * alpha;
    const x = this.laneToX(laneX);

    this.bloom.strength = look.bloomStrength;
    this.bloom.radius = look.bloomRadius;
    this.bloom.threshold = look.bloomThreshold;
    this.renderer.toneMappingExposure = look.exposure;

    this.world.update(dist);
    this.fires.update(state.obstacles, dist, this.laneToX, dt);

    // --- Bike ---------------------------------------------------------------
    const lateralSpeed = dt > 0 ? (x - this.lastX) / dt : 0;
    this.lastX = x;
    const targetLean = THREE.MathUtils.clamp(-lateralSpeed * 0.022, -0.6, 0.6);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 14);

    this.bikeRoot.position.set(x, 0, 0);
    if (this.crashTime >= 0) {
      const since = state.time - this.crashTime;
      const tip = Math.min(1, since / 0.35);
      this.bikeRoot.rotation.set(0, this.crashSide * tip * 0.9, -this.crashSide * tip * 1.35);
      this.bikeRoot.position.y = 0.15 * tip;
    } else {
      this.bikeRoot.rotation.set(0, this.lean * 0.35, this.lean);
    }
    for (let i = 0; i < 2; i++) {
      this.bike.wheels[i].rotation.z -= (state.speed * dt) / this.bike.wheelRadii[i];
    }

    // --- Bike lights --------------------------------------------------------
    const alive = this.crashTime < 0;
    const head = this.bike.headLight;
    this.headBeam.position.set(x + head.x, head.y + 0.1, head.z);
    this.headBeam.target.position.set(x + this.lean * -6, 0, head.z - 34);
    this.headBeam.intensity = alive ? 520 : 150;
    this.beamPool.position.set(x, 0.035, head.z - 9);
    this.beamPool.visible = alive;
    const tail = this.bike.tailLight;
    this.tailGlow.position.set(x, tail.y, tail.z + 0.5);
    this.underGlow.position.set(x, 0.03, 0);
    const streak = alive ? look.trailLength * (0.5 + state.speed / this.t.maxSpeed) : 0.01;
    this.trail.mesh.visible = alive;
    this.trail.update(dist, x, tail.y, tail.z + 0.05, this.bike.tailWidth * 0.7, streak);

    // --- Camera -------------------------------------------------------------
    // Tall phone screens get a higher, further camera so all lanes stay in view.
    const tall = 1 - THREE.MathUtils.clamp((this.camera.aspect - 0.5) / 0.9, 0, 1);
    const speedK = THREE.MathUtils.clamp(
      (state.speed - this.t.startSpeed) / (this.t.maxSpeed - this.t.startSpeed), 0, 1);
    this.camX += (x - this.camX) * Math.min(1, dt * 9);
    const follow = THREE.MathUtils.lerp(0.6, 0.72, tall);
    const camY = THREE.MathUtils.lerp(2.7, 4.6, tall);
    const camZ = THREE.MathUtils.lerp(6.0, 9.0, tall) - speedK * 0.6;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const s = this.shake * this.shake * look.shake;
    const sx = (Math.random() - 0.5) * s;
    const sy = (Math.random() - 0.5) * s;
    this.camera.position.set(this.camX * follow + sx, camY + sy, camZ);
    this.camera.lookAt(this.camX * (follow + 0.14), THREE.MathUtils.lerp(1.5, 2.0, tall), -16);
    this.camera.rotation.z += -this.lean * 0.06;
    this.fovKick = Math.max(0, this.fovKick - dt * 6);
    const fov = THREE.MathUtils.lerp(62, 80, tall) + speedK * 9 + this.fovKick;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.composer.render(dt);
    this.adaptQuality(dt);
  }
}
