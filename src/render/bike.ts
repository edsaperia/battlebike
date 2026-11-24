/**
 * Bike generator. A seed makes a BikeSpec (plain numbers and colours), and a
 * BikeSpec makes a model. Keeping the spec as data means bikes can later be
 * saved, edited, or given to rivals.
 */
import * as THREE from 'three';
import { chance, makeRng, pick, range } from '../sim/rng';

export type TailLightStyle = 'bar' | 'twin' | 'slit';

export interface BikeSpec {
  seed: number;
  wheelbase: number;
  rearRadius: number;
  rearWidth: number;
  frontRadius: number;
  frontWidth: number;
  bodyWidth: number;
  seatHeight: number;
  seatDip: number;
  tankHeight: number;
  cowlHeight: number;
  noseReach: number;
  noseDrop: number;
  tailLength: number;
  tailKick: number;
  belly: number;
  screen: boolean;
  sidePods: boolean;
  exhausts: number;
  spokes: number;
  tailLight: TailLightStyle;
  underglow: boolean;
  bodyColor: number;
  trimColor: number;
  neonColor: number;
  tailColor: number;
  jacketColor: number;
  helmetColor: number;
}

export interface Bike {
  spec: BikeSpec;
  group: THREE.Group;
  /** spin these around z to roll the wheels: [rear, front] */
  wheels: [THREE.Object3D, THREE.Object3D];
  wheelRadii: [number, number];
  /** positions in the bike's own space (forward is -z) */
  tailLight: THREE.Vector3;
  headLight: THREE.Vector3;
  tailWidth: number;
  dispose(): void;
}

const NEONS = [0x00e5ff, 0xff2bd6, 0xffe14a, 0x7dff5a, 0xff6a1f, 0x9d7bff];
const TAILS = [0xff1a2e, 0xff1a2e, 0xff1a2e, 0xff3d00, 0xff2bd6];

function hsl(h: number, s: number, l: number): number {
  return new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l).getHex();
}

export function randomBikeSpec(seed: number): BikeSpec {
  const r = makeRng(seed * 2654435761);
  const hue = range(r, 0, 1);
  const dark = chance(r, 0.3);
  const rearRadius = range(r, 0.34, 0.46);
  const seatHeight = range(r, 0.6, 0.78);
  const tankHeight = seatHeight + range(r, 0.12, 0.28);
  return {
    seed,
    wheelbase: range(r, 1.6, 2.25),
    rearRadius,
    rearWidth: range(r, 0.26, 0.46),
    frontRadius: range(r, 0.31, 0.42),
    frontWidth: range(r, 0.15, 0.24),
    bodyWidth: range(r, 0.34, 0.5),
    seatHeight,
    seatDip: range(r, 0.02, 0.12),
    tankHeight,
    cowlHeight: tankHeight + range(r, -0.04, 0.2),
    noseReach: range(r, 0.0, 0.35),
    noseDrop: range(r, 0.15, 0.45),
    tailLength: range(r, 0.25, 0.7),
    tailKick: range(r, 0.0, 0.3),
    belly: range(r, 0.2, 0.32),
    screen: chance(r, 0.6),
    sidePods: chance(r, 0.5),
    exhausts: pick(r, [1, 1, 2]),
    spokes: pick(r, [3, 5, 6]),
    tailLight: pick(r, ['bar', 'twin', 'slit'] as const),
    underglow: chance(r, 0.65),
    bodyColor: dark ? hsl(hue, 0.25, 0.12) : hsl(hue, range(r, 0.7, 0.95), range(r, 0.34, 0.5)),
    trimColor: hsl(hue + range(r, 0.4, 0.6), 0.2, range(r, 0.1, 0.22)),
    neonColor: pick(r, NEONS),
    tailColor: pick(r, TAILS),
    jacketColor: hsl(range(r, 0, 1), range(r, 0.4, 0.9), range(r, 0.25, 0.45)),
    helmetColor: hsl(range(r, 0, 1), range(r, 0.2, 0.9), range(r, 0.3, 0.6)),
  };
}

export function generateBike(seed: number): Bike {
  return buildBike(randomBikeSpec(seed));
}

/**
 * The model is built side-on in "profile space": x runs forward from the rear
 * axle, y is up, z is across the bike. It is then turned to face down the road.
 */
export function buildBike(spec: BikeSpec): Bike {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const std = (color: number, metalness: number, roughness: number) =>
    track(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const glow = (color: number, strength = 2.5) =>
    track(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength) }));

  const body = std(spec.bodyColor, 0.55, 0.32);
  const trim = std(spec.trimColor, 0.7, 0.4);
  const rubber = std(0x0b0b0e, 0.0, 0.85);
  const metal = std(0x8a8f9c, 0.9, 0.3);
  const jacket = std(spec.jacketColor, 0.1, 0.7);
  const helmet = std(spec.helmetColor, 0.4, 0.25);
  const leather = std(0x121218, 0.1, 0.6);
  const neon = glow(spec.neonColor, 2.2);
  const tail = glow(spec.tailColor, 2.2);
  const head = glow(0xfff2d0, 3);

  const profile = new THREE.Group();
  const wb = spec.wheelbase;

  const add = (mesh: THREE.Object3D, parent: THREE.Object3D = profile) => {
    parent.add(mesh);
    return mesh;
  };

  /** A flat side-on outline given thickness across the bike. */
  const slab = (pts: [number, number][], width: number, mat: THREE.Material, bevel = 0.03) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const geo = track(
      new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.01, width - bevel * 2),
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        steps: 1,
      }),
    );
    geo.translate(0, 0, -(width - bevel * 2) / 2);
    return new THREE.Mesh(geo, mat);
  };

  /** A rod between two points. */
  const rod = (a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, sides = 8) => {
    const len = a.distanceTo(b);
    const geo = track(new THREE.CylinderGeometry(radius, radius, len, sides));
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };

  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

  // --- Wheels ---------------------------------------------------------------
  const makeWheel = (radius: number, width: number, x: number) => {
    const spin = new THREE.Group();
    spin.position.set(x, radius, 0);
    const tyreGeo = track(new THREE.CylinderGeometry(radius, radius, width, 28));
    tyreGeo.rotateX(Math.PI / 2);
    spin.add(new THREE.Mesh(tyreGeo, rubber));
    const hubGeo = track(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 24));
    hubGeo.rotateX(Math.PI / 2);
    spin.add(new THREE.Mesh(hubGeo, trim));
    const ringGeo = track(new THREE.TorusGeometry(radius * 0.66, 0.018, 6, 32));
    const spokeGeo = track(new THREE.BoxGeometry(radius * 1.2, 0.035, 0.012));
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, neon);
      ring.position.z = side * (width / 2 + 0.012);
      spin.add(ring);
      for (let i = 0; i < spec.spokes; i++) {
        const spoke = new THREE.Mesh(spokeGeo, metal);
        spoke.position.z = side * (width / 2 + 0.016);
        spoke.rotation.z = (i / spec.spokes) * Math.PI;
        spin.add(spoke);
      }
    }
    add(spin);
    return spin;
  };
  const rearWheel = makeWheel(spec.rearRadius, spec.rearWidth, 0);
  const frontWheel = makeWheel(spec.frontRadius, spec.frontWidth, wb);

  // --- Body -----------------------------------------------------------------
  const seatY = spec.seatHeight;
  const tailTipX = -spec.tailLength;
  const tailTipY = seatY + spec.tailKick;
  const headX = wb * 0.74;

  add(
    slab(
      [
        [tailTipX, tailTipY],
        [0.05, seatY + 0.02],
        [wb * 0.36, seatY - spec.seatDip],
        [wb * 0.56, spec.tankHeight],
        [headX, spec.tankHeight - 0.02],
        [headX + 0.1, seatY - 0.12],
        [wb * 0.7, spec.belly + 0.06],
        [wb * 0.3, spec.belly],
        [0.12, spec.belly + 0.16],
        [tailTipX * 0.55, tailTipY - 0.16],
      ],
      spec.bodyWidth,
      body,
    ),
  );

  // Engine block showing under the body.
  const engineGeo = track(new THREE.BoxGeometry(wb * 0.34, 0.3, spec.bodyWidth * 0.82));
  const engine = new THREE.Mesh(engineGeo, trim);
  engine.position.set(wb * 0.48, spec.belly + 0.1, 0);
  add(engine);

  // Front cowl around the headstock.
  const noseX = wb * 0.98 + spec.noseReach;
  const noseY = spec.cowlHeight - spec.noseDrop;
  add(
    slab(
      [
        [wb * 0.58, spec.tankHeight + 0.01],
        [headX + 0.02, spec.cowlHeight + 0.04],
        [noseX - 0.12, noseY + 0.14],
        [noseX, noseY],
        [noseX - 0.1, noseY - 0.13],
        [headX + 0.06, seatY - 0.06],
      ],
      spec.bodyWidth * 1.12,
      body,
      0.04,
    ),
  );

  if (spec.screen) {
    const screenMat = track(
      new THREE.MeshStandardMaterial({
        color: spec.neonColor,
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.35,
        emissive: spec.neonColor,
        emissiveIntensity: 0.25,
      }),
    );
    add(
      slab(
        [
          [headX - 0.02, spec.cowlHeight + 0.03],
          [headX + 0.1, spec.cowlHeight + 0.26],
          [headX + 0.16, spec.cowlHeight + 0.25],
          [noseX - 0.18, noseY + 0.15],
        ],
        spec.bodyWidth * 0.9,
        screenMat,
        0,
      ),
    );
  }

  if (spec.sidePods) {
    for (const side of [-1, 1]) {
      const pod = slab(
        [
          [wb * 0.3, spec.belly + 0.02],
          [wb * 0.42, seatY - 0.1],
          [wb * 0.74, seatY - 0.16],
          [wb * 0.82, spec.belly + 0.14],
          [wb * 0.7, spec.belly - 0.02],
        ],
        0.09,
        body,
        0.02,
      );
      pod.position.z = side * (spec.bodyWidth / 2 + 0.03);
      add(pod);
    }
  }

  // Seat pad.
  add(
    slab(
      [
        [0.02, seatY + 0.03],
        [wb * 0.36, seatY - spec.seatDip + 0.01],
        [wb * 0.4, seatY - spec.seatDip + 0.06],
        [0.0, seatY + 0.09],
      ],
      spec.bodyWidth * 0.8,
      leather,
      0.015,
    ),
  );

  // Swingarm and forks.
  for (const side of [-1, 1]) {
    const zr = side * (spec.rearWidth / 2 + 0.04);
    add(rod(v(0, spec.rearRadius, zr), v(wb * 0.36, spec.belly + 0.12, zr * 0.8), 0.035, metal));
    const zf = side * (spec.frontWidth / 2 + 0.035);
    add(rod(v(wb, spec.frontRadius, zf), v(headX + 0.03, spec.tankHeight + 0.05, zf), 0.03, metal));
  }

  // Front mudguard.
  const guardGeo = track(
    new THREE.TorusGeometry(spec.frontRadius + 0.04, 0.03, 6, 16, Math.PI * 0.55),
  );
  const guard = new THREE.Mesh(guardGeo, body);
  guard.scale.z = (spec.frontWidth + 0.06) / 0.06;
  guard.position.set(wb, spec.frontRadius, 0);
  guard.rotation.z = Math.PI * 0.28;
  add(guard);

  // Handlebars.
  const barY = spec.tankHeight + 0.12;
  const barX = headX - 0.04;
  const barHalf = spec.bodyWidth / 2 + 0.14;
  add(rod(v(barX, barY, -barHalf), v(barX, barY, barHalf), 0.018, metal, 6));
  add(rod(v(headX + 0.03, spec.tankHeight + 0.02, 0), v(barX, barY, 0), 0.025, metal, 6));

  // Exhausts.
  const pipeTip = track(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 10));
  for (let i = 0; i < spec.exhausts; i++) {
    for (const side of [-1, 1]) {
      const z = side * (spec.bodyWidth / 2 + 0.07);
      const y = spec.belly + 0.12 + i * 0.1;
      const endX = -spec.rearRadius * 0.5 - i * 0.08;
      const endY = y + 0.1 + spec.tailKick * 0.4;
      add(rod(v(wb * 0.42, y, z * 0.85), v(endX, endY, z), 0.038, metal, 10));
      const tip = new THREE.Mesh(pipeTip, glow(0xff5a1f, 1.6));
      tip.position.set(endX - 0.005, endY, z);
      tip.quaternion.setFromUnitVectors(
        v(0, 1, 0),
        v(endX - wb * 0.42, endY - y, z * 0.15).normalize(),
      );
      add(tip);
    }
  }

  // --- Lights ---------------------------------------------------------------
  const tailW = spec.bodyWidth * (spec.tailLight === 'slit' ? 1.0 : 0.82);
  const tailPos = v(tailTipX - 0.012, tailTipY - 0.08, 0);
  if (spec.tailLight === 'twin') {
    const lampGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14));
    lampGeo.rotateZ(Math.PI / 2);
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lampGeo, tail);
      lamp.position.copy(tailPos).setZ(side * tailW * 0.3);
      add(lamp);
    }
  } else {
    const h = spec.tailLight === 'slit' ? 0.03 : 0.075;
    const barGeo = track(new THREE.BoxGeometry(0.03, h, tailW));
    const bar = new THREE.Mesh(barGeo, tail);
    bar.position.copy(tailPos);
    add(bar);
  }

  const headGeo = track(new THREE.BoxGeometry(0.04, 0.09, spec.bodyWidth * 0.6));
  const headLamp = new THREE.Mesh(headGeo, head);
  headLamp.position.set(noseX - 0.03, noseY + 0.01, 0);
  add(headLamp);

  if (spec.underglow) {
    const stripGeo = track(new THREE.BoxGeometry(wb * 0.5, 0.02, 0.03));
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(stripGeo, neon);
      strip.position.set(wb * 0.5, spec.belly - 0.02, side * spec.bodyWidth * 0.36);
      add(strip);
    }
  }
  // A neon pinstripe along the tail.
  add(
    rod(
      v(tailTipX + 0.04, tailTipY - 0.02, spec.bodyWidth / 2 + 0.005),
      v(wb * 0.3, seatY - spec.seatDip - 0.06, spec.bodyWidth / 2 + 0.005),
      0.012,
      neon,
      5,
    ),
  );
  add(
    rod(
      v(tailTipX + 0.04, tailTipY - 0.02, -spec.bodyWidth / 2 - 0.005),
      v(wb * 0.3, seatY - spec.seatDip - 0.06, -spec.bodyWidth / 2 - 0.005),
      0.012,
      neon,
      5,
    ),
  );

  // --- Rider ----------------------------------------------------------------
  const hip = v(wb * 0.2, seatY + 0.1, 0);
  const shoulder = v(wb * 0.2 + 0.36, seatY + 0.6, 0);
  const torso = rod(hip, shoulder, 0.17, jacket, 10);
  torso.scale.z = 1.25;
  add(torso);
  const headGeo2 = track(new THREE.SphereGeometry(0.15, 16, 12));
  const headMesh = new THREE.Mesh(headGeo2, helmet);
  headMesh.position.set(shoulder.x + 0.1, shoulder.y + 0.17, 0);
  headMesh.scale.set(1.12, 1, 0.95);
  add(headMesh);
  const visorGeo = track(new THREE.SphereGeometry(0.152, 12, 8, -0.9, 1.8, 1.1, 0.75));
  const visor = new THREE.Mesh(visorGeo, std(0x05060a, 0.9, 0.1));
  visor.position.copy(headMesh.position);
  visor.rotation.y = Math.PI / 2;
  add(visor);
  for (const side of [-1, 1]) {
    const sh = v(shoulder.x - 0.04, shoulder.y - 0.06, side * 0.2);
    const elbow = v((sh.x + barX) / 2, (sh.y + barY) / 2 - 0.06, side * (barHalf + 0.02));
    const hand = v(barX, barY, side * (barHalf - 0.04));
    add(rod(sh, elbow, 0.055, jacket, 6));
    add(rod(elbow, hand, 0.045, jacket, 6));
    const hp = v(hip.x + 0.04, hip.y - 0.06, side * 0.12);
    const knee = v(wb * 0.5, seatY - 0.02, side * (spec.bodyWidth / 2 + 0.07));
    const foot = v(wb * 0.34, spec.belly + 0.06, side * (spec.bodyWidth / 2 + 0.09));
    add(rod(hp, knee, 0.075, leather, 6));
    add(rod(knee, foot, 0.06, leather, 6));
  }

  // --- Turn to face down the road (forward is -z) and centre it --------------
  profile.position.x = -wb / 2;
  const facing = new THREE.Group();
  facing.add(profile);
  facing.rotation.y = Math.PI / 2;
  const group = new THREE.Group();
  group.add(facing);

  const toBikeSpace = (p: THREE.Vector3) => new THREE.Vector3(p.z, p.y, -(p.x - wb / 2));

  return {
    spec,
    group,
    wheels: [rearWheel, frontWheel],
    wheelRadii: [spec.rearRadius, spec.frontRadius],
    tailLight: toBikeSpace(tailPos),
    headLight: toBikeSpace(v(noseX, noseY, 0)),
    tailWidth: tailW,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
