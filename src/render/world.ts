/**
 * The scenery: road, barriers, streetlights, skyline and sky. Nothing here
 * affects the rules. The bike stays at z = 0 and the world slides past it.
 */
import * as THREE from 'three';
import { makeRng, pick, range, chance } from '../sim/rng';
import type { Tuning } from '../sim/tuning';

export const palette = {
  night: 0x08040f,
  haze: 0x1a0a2a,
  sodium: 0xffa040,
  cyan: 0x00e5ff,
  magenta: 0xff2bd6,
  fire: 0xff7a1a,
};

const ROAD_TILE = 12; // metres of road covered by one texture repeat
const ROAD_AHEAD = 340;
const ROAD_BEHIND = 30;
const LAMP_SPACING = 34;
const LAMP_COUNT = 10;
const LAMP_HEIGHT = 7.5;
const STREET_LIGHTS = 3;

/** Soft round blob used for every fake pool of light and glow. */
export function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A flat additive patch of light lying on the road. */
export function makeGroundGlow(tex: THREE.Texture, color: number, w: number, l: number, strength = 1) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(color).multiplyScalar(strength),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  return mesh;
}

function makeRoadTexture(laneCount: number): THREE.Texture {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#17161c';
  g.fillRect(0, 0, w, h);
  // Asphalt grain.
  const r = makeRng(7);
  for (let i = 0; i < 9000; i++) {
    const s = range(r, 0, 1);
    g.fillStyle = `rgba(${s > 0.5 ? 255 : 0},${s > 0.5 ? 255 : 0},${s > 0.5 ? 255 : 0},${range(r, 0.02, 0.07)})`;
    g.fillRect(range(r, 0, w), range(r, 0, h), range(r, 1, 3), range(r, 1, 4));
  }
  // Worn tyre lines down the middle of each lane.
  const margin = 28; // pixels of shoulder each side
  const laneW = (w - margin * 2) / laneCount;
  for (let i = 0; i < laneCount; i++) {
    const x = margin + laneW * (i + 0.5);
    const grad = g.createLinearGradient(x - laneW * 0.3, 0, x + laneW * 0.3, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - laneW * 0.3, 0, laneW * 0.6, h);
  }
  // Dashed lane lines: one dash per tile.
  g.fillStyle = '#d9d2b8';
  for (let i = 1; i < laneCount; i++) {
    const x = margin + laneW * i;
    g.fillRect(x - 3, h * 0.12, 6, h * 0.36);
  }
  // Solid edge lines.
  g.fillStyle = '#e8c15a';
  g.fillRect(margin - 4, 0, 7, h);
  g.fillRect(w - margin - 3, 0, 7, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeWindowTexture(seed: number): THREE.Texture {
  const cols = 20;
  const rows = 56;
  const cell = 6;
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  const g = c.getContext('2d')!;
  g.fillStyle = '#06040b';
  g.fillRect(0, 0, c.width, c.height);
  const r = makeRng(seed);
  const tints = ['#ffc98a', '#9fe8ff', '#ff7ad9', '#fff1c4', '#8f7bff'];
  const tint = pick(r, tints);
  for (let y = 0; y < rows; y++) {
    const floorLit = chance(r, 0.75);
    for (let x = 0; x < cols; x++) {
      if (!floorLit || !chance(r, 0.38)) continue;
      g.fillStyle = chance(r, 0.85) ? tint : pick(r, tints);
      g.globalAlpha = range(r, 0.35, 1);
      g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 3);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeSkyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05030a');
  grad.addColorStop(0.55, '#0d0618');
  grad.addColorStop(0.82, '#3a0f3f');
  grad.addColorStop(0.94, '#a02a55');
  grad.addColorStop(1, '#ff7a4a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Position of a repeating thing: slides toward the camera, then wraps far ahead. */
function wrapZ(index: number, spacing: number, count: number, dist: number, behind: number): number {
  const span = spacing * count;
  const rel = (((index * spacing - dist) % span) + span) % span;
  return behind - rel;
}

export class World {
  readonly group = new THREE.Group();
  readonly glowTex = makeGlowTexture();
  private roadTex: THREE.Texture;
  private roadLength = ROAD_AHEAD + ROAD_BEHIND;
  private lamps: THREE.Group[] = [];
  private streetLights: THREE.PointLight[] = [];
  private buildings: { mesh: THREE.Mesh; index: number }[] = [];
  private buildingSpacing = 26;
  private buildingCount = 16;
  readonly roadHalfWidth: number;

  constructor(t: Tuning) {
    const roadWidth = t.laneCount * t.laneWidth;
    // The texture has a small shoulder each side of the lanes.
    const texMargin = 28 / 1024;
    const fullWidth = roadWidth / (1 - texMargin * 2);
    this.roadHalfWidth = fullWidth / 2;

    // Road.
    this.roadTex = makeRoadTexture(t.laneCount);
    this.roadTex.repeat.set(1, this.roadLength / ROAD_TILE);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(fullWidth, this.roadLength),
      new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.55, metalness: 0.1 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -(this.roadLength / 2 - ROAD_BEHIND);
    this.group.add(road);

    // Ground beyond the barriers.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, this.roadLength),
      new THREE.MeshBasicMaterial({ color: 0x040208 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, road.position.z);
    this.group.add(ground);

    // Barriers with a neon strip each side.
    const barrierGeo = new THREE.BoxGeometry(0.5, 1.0, this.roadLength);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x2a2833, roughness: 0.8 });
    const stripGeo = new THREE.BoxGeometry(0.06, 0.1, this.roadLength);
    for (const side of [-1, 1]) {
      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set(side * (this.roadHalfWidth + 0.25), 0.5, road.position.z);
      this.group.add(barrier);
      const color = new THREE.Color(side < 0 ? palette.cyan : palette.magenta).multiplyScalar(1.6);
      const strip = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color }));
      strip.position.set(side * (this.roadHalfWidth - 0.02), 0.8, road.position.z);
      this.group.add(strip);
      const wash = makeGroundGlow(this.glowTex, side < 0 ? palette.cyan : palette.magenta, 5, this.roadLength, 0.16);
      wash.position.set(side * this.roadHalfWidth, 0.02, road.position.z);
      this.group.add(wash);
    }

    // Streetlights: bright lamp heads and painted pools of light. Only a few
    // real lights exist, and they hop between the nearest lamps.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x30303a, roughness: 0.6, metalness: 0.6 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, LAMP_HEIGHT, 6);
    const armGeo = new THREE.BoxGeometry(3.2, 0.12, 0.12);
    const headGeo = new THREE.BoxGeometry(1.1, 0.12, 0.34);
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.sodium).multiplyScalar(4) });
    const haloMat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: new THREE.Color(palette.sodium).multiplyScalar(0.55),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    for (let i = 0; i < LAMP_COUNT; i++) {
      const pair = new THREE.Group();
      for (const side of [-1, 1]) {
        const x = side * (this.roadHalfWidth + 0.7);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, LAMP_HEIGHT / 2, 0);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(x - side * 1.5, LAMP_HEIGHT, 0);
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(x - side * 2.9, LAMP_HEIGHT - 0.1, 0);
        const halo = new THREE.Sprite(haloMat);
        halo.position.copy(head.position);
        halo.scale.setScalar(5);
        const pool = makeGroundGlow(this.glowTex, palette.sodium, 11, 18, 0.26);
        pool.position.set(x - side * 3.4, 0.04, 0);
        pair.add(pole, arm, head, halo, pool);
      }
      this.lamps.push(pair);
      this.group.add(pair);
    }
    for (let i = 0; i < STREET_LIGHTS; i++) {
      const light = new THREE.PointLight(palette.sodium, 0, 46, 1.6);
      this.streetLights.push(light);
      this.group.add(light);
    }

    // Skyline: lit-window boxes either side, recycled as they pass.
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const windowMats = [11, 23, 37, 51, 68].map(
      (seed) => new THREE.MeshBasicMaterial({ map: makeWindowTexture(seed), fog: true }),
    );
    const r = makeRng(99);
    for (let i = 0; i < this.buildingCount; i++) {
      for (const side of [-1, 1]) {
        const w = range(r, 14, 24);
        const d = range(r, 14, 24);
        const h = range(r, 18, 80) * (chance(r, 0.2) ? 1.7 : 1);
        const mesh = new THREE.Mesh(boxGeo, pick(r, windowMats));
        mesh.scale.set(w, h, d);
        mesh.position.x = side * (this.roadHalfWidth + 16 + w / 2 + range(r, 0, 30));
        this.buildings.push({ mesh, index: i });
        this.group.add(mesh);
      }
    }

    // Sky glow on the horizon.
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 420),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), fog: false, depthWrite: false }),
    );
    sky.position.set(0, 190, -520);
    sky.renderOrder = -10;
    this.group.add(sky);
  }

  update(dist: number): void {
    // Scroll the road markings.
    this.roadTex.offset.y = (dist / ROAD_TILE) % 1;

    for (let i = 0; i < this.lamps.length; i++) {
      this.lamps[i].position.z = wrapZ(i, LAMP_SPACING, LAMP_COUNT, dist, LAMP_SPACING);
    }

    // Give the real lights to the lamps nearest the bike, fading in and out so
    // nothing pops when a light moves on.
    const lampSpan = LAMP_SPACING * STREET_LIGHTS;
    for (let i = 0; i < STREET_LIGHTS; i++) {
      const light = this.streetLights[i];
      const z = wrapZ(i, LAMP_SPACING, STREET_LIGHTS, dist, LAMP_SPACING);
      light.position.set(0, LAMP_HEIGHT - 1, z);
      const fadeIn = THREE.MathUtils.smoothstep(z, LAMP_SPACING - lampSpan, LAMP_SPACING - lampSpan + 26);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(z, LAMP_SPACING - 16, LAMP_SPACING);
      light.intensity = 85 * fadeIn * fadeOut;
    }

    for (const b of this.buildings) {
      b.mesh.position.z = wrapZ(b.index, this.buildingSpacing, this.buildingCount, dist, 60);
    }
  }
}
