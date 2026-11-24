/**
 * The tail-light streak: a ribbon that follows the path the bike has taken,
 * fading out behind it.
 */
import * as THREE from 'three';

const SEGMENTS = 28;
const trailFade = (i: number) => Math.pow(1 - i / SEGMENTS, 2.6) * 0.9;

export class Trail {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private history: { dist: number; x: number }[] = [];
  private geo = new THREE.BufferGeometry();

  constructor(color: number) {
    const verts = (SEGMENTS + 1) * 2;
    this.positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const c = new THREE.Color(color);
    const index: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const fade = trailFade(i);
      for (let s = 0; s < 2; s++) {
        colors.set([c.r * fade, c.g * fade, c.b * fade], (i * 2 + s) * 3);
      }
      if (i < SEGMENTS) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  setColor(color: number): void {
    const c = new THREE.Color(color);
    const colors = this.geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) {
      const fade = trailFade(i);
      for (let s = 0; s < 2; s++) colors.setXYZ(i * 2 + s, c.r * fade, c.g * fade, c.b * fade);
    }
    colors.needsUpdate = true;
  }

  reset(): void {
    this.history.length = 0;
  }

  /**
   * @param dist   distance travelled
   * @param x,y,z  where the tail light is now
   * @param width  width of the light
   * @param length how long the streak is, in metres
   */
  update(dist: number, x: number, y: number, z: number, width: number, length: number): void {
    this.history.push({ dist, x });
    while (this.history.length > 2 && this.history[1].dist < dist - length - 2) this.history.shift();

    const half = width / 2;
    let h = this.history.length - 1;
    for (let i = 0; i <= SEGMENTS; i++) {
      const back = (i / SEGMENTS) * length;
      const target = dist - back;
      while (h > 0 && this.history[h - 1].dist >= target) h--;
      // Interpolate between the two samples either side of the target distance.
      const a = this.history[Math.max(0, h - 1)];
      const b = this.history[h];
      const span = b.dist - a.dist;
      const k = span > 1e-6 ? THREE.MathUtils.clamp((target - a.dist) / span, 0, 1) : 1;
      const px = a.x + (b.x - a.x) * k;
      const taper = 1 - (i / SEGMENTS) * 0.75;
      const o = i * 6;
      this.positions[o] = px - half * taper;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z + back;
      this.positions[o + 3] = px + half * taper;
      this.positions[o + 4] = y;
      this.positions[o + 5] = z + back;
    }
    this.geo.getAttribute('position').needsUpdate = true;
  }
}
