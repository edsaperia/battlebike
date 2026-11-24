/**
 * Oil-barrel fires. A pool of barrels is reused as obstacles come and go, and
 * a handful of real lights follow whichever fires are closest to the bike.
 */
import * as THREE from 'three';
import type { Obstacle } from '../sim/sim';
import { makeGroundGlow, palette } from './world';

const FIRE_LIGHTS = 3;

const flameVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    float y = vUv.y;
    float x = (vUv.x - 0.5) * 2.0;
    float n = fbm(vec2(vUv.x * 3.0 + uSeed, y * 2.6 - uTime * 2.4));
    float sway = (fbm(vec2(uSeed * 3.1, y * 1.5 - uTime * 1.3)) - 0.5) * 0.9 * y;
    float width = mix(0.95, 0.1, pow(y, 1.1));
    float body = 1.0 - smoothstep(width * 0.35, width, abs(x + sway));
    float heat = body * (n * 1.5 + 0.25) * (1.0 - y * 0.85);
    heat = smoothstep(0.1, 0.75, heat * 1.5);
    vec3 col = mix(vec3(0.85, 0.08, 0.0), vec3(1.0, 0.42, 0.04), heat);
    col += vec3(0.25, 0.22, 0.05) * smoothstep(0.8, 1.0, heat) * (1.0 - y);
    gl_FragColor = vec4(col * heat * 0.8, heat);
  }
`;

interface Fire {
  group: THREE.Group;
  flame: THREE.ShaderMaterial;
  glow: THREE.Sprite;
  pool: THREE.Mesh;
  phase: number;
}

export class Fires {
  readonly group = new THREE.Group();
  private pool: Fire[] = [];
  private live = new Map<number, Fire>();
  private lights: THREE.PointLight[] = [];
  private time = { value: 0 };

  private barrelGeo = new THREE.CylinderGeometry(0.44, 0.4, 1.05, 14, 1, true);
  private rimGeo = new THREE.TorusGeometry(0.44, 0.03, 5, 14);
  private emberGeo = new THREE.CircleGeometry(0.42, 14);
  private flameGeo = new THREE.PlaneGeometry(1.7, 2.0);
  private barrelMat = new THREE.MeshStandardMaterial({
    color: 0x3a1d12,
    roughness: 0.85,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  private rimMat = new THREE.MeshStandardMaterial({ color: 0x1c1a1d, roughness: 0.6, metalness: 0.7 });
  private emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.4, 0.06).multiplyScalar(1.6) });
  private glowMat: THREE.SpriteMaterial;

  constructor(private glowTex: THREE.Texture) {
    this.flameGeo.translate(0, 1.0, 0);
    this.glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(palette.fire).multiplyScalar(0.16),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    for (let i = 0; i < FIRE_LIGHTS; i++) {
      const light = new THREE.PointLight(palette.fire, 0, 30, 1.7);
      this.lights.push(light);
      this.group.add(light);
    }
  }

  private make(): Fire {
    const group = new THREE.Group();
    const barrel = new THREE.Mesh(this.barrelGeo, this.barrelMat);
    barrel.position.y = 0.525;
    group.add(barrel);
    for (const y of [0.3, 0.72, 1.05]) {
      const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = y;
      group.add(rim);
    }
    const embers = new THREE.Mesh(this.emberGeo, this.emberMat);
    embers.rotation.x = -Math.PI / 2;
    embers.position.y = 0.92;
    group.add(embers);

    const flame = new THREE.ShaderMaterial({
      vertexShader: flameVertex,
      fragmentShader: flameFragment,
      uniforms: { uTime: this.time, uSeed: { value: Math.random() * 50 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Two crossed sheets, so the flame has volume from any angle.
    for (const rot of [0, Math.PI / 2]) {
      const sheet = new THREE.Mesh(this.flameGeo, flame);
      sheet.rotation.y = rot;
      sheet.position.y = 0.85;
      sheet.renderOrder = 2;
      group.add(sheet);
    }
    const glow = new THREE.Sprite(this.glowMat);
    glow.position.y = 1.7;
    glow.scale.setScalar(5);
    group.add(glow);
    const pool = makeGroundGlow(this.glowTex, palette.fire, 8, 8, 0.28);
    group.add(pool);

    this.group.add(group);
    return { group, flame, glow, pool, phase: Math.random() * 10 };
  }

  /** Match the pool of barrels to the obstacles the simulation currently has. */
  update(obstacles: readonly Obstacle[], dist: number, laneToX: (lane: number) => number, dt: number): void {
    this.time.value += dt;
    const t = this.time.value;

    const seen = new Set<number>();
    for (const o of obstacles) {
      seen.add(o.id);
      let fire = this.live.get(o.id);
      if (!fire) {
        fire = this.pool.pop() ?? this.make();
        fire.group.visible = true;
        this.live.set(o.id, fire);
      }
      fire.group.position.set(laneToX(o.lane), 0, -(o.d - dist));
      const flicker = 0.85 + 0.15 * Math.sin(t * 13 + fire.phase) * Math.sin(t * 7.3 + fire.phase * 2);
      fire.glow.scale.setScalar(5 * flicker);
      fire.pool.scale.setScalar(flicker);
    }
    for (const [id, fire] of this.live) {
      if (!seen.has(id)) {
        fire.group.visible = false;
        this.pool.push(fire);
        this.live.delete(id);
      }
    }

    // Real lights go to the fires nearest the bike.
    const nearest = [...this.live.values()]
      .filter((f) => f.group.position.z < 8 && f.group.position.z > -90)
      .sort((a, b) => Math.abs(a.group.position.z) - Math.abs(b.group.position.z));
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const fire = nearest[i];
      if (!fire) {
        light.intensity = 0;
        continue;
      }
      const z = fire.group.position.z;
      light.position.set(fire.group.position.x, 2.6, z);
      const near = 1 - THREE.MathUtils.smoothstep(Math.abs(z), 45, 90);
      const flicker = 0.8 + 0.2 * Math.sin(t * 17 + fire.phase) * Math.sin(t * 9.1 + fire.phase);
      light.intensity = 55 * near * flicker;
    }
  }
}
