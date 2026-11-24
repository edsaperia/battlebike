/**
 * Garage: a contact sheet of generated bikes, for working on the generator.
 * Open garage.html (add ?seed=123 to start from a particular bike).
 */
import * as THREE from 'three';
import { generateBike, type Bike } from './render/bike';

const canvas = document.getElementById('garage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0812);
scene.add(new THREE.HemisphereLight(0x8a80c0, 0x1a1020, 1.6));
const key = new THREE.DirectionalLight(0xfff0e0, 2.2);
key.position.set(3, 6, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff2bd6, 1.2);
rim.position.set(-4, 3, -5);
scene.add(rim);

const camera = new THREE.OrthographicCamera();
const COLS = 3;
const ROWS = 4;
const CELL_W = 3.6;
const CELL_H = 2.3;
let bikes: Bike[] = [];
let seed = Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 100000);

function populate(): void {
  for (const b of bikes) {
    scene.remove(b.group);
    b.dispose();
  }
  bikes = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const bike = generateBike(seed + i);
    bike.group.position.set(((i % COLS) - (COLS - 1) / 2) * CELL_W, -Math.floor(i / COLS) * CELL_H, 0);
    scene.add(bike.group);
    bikes.push(bike);
  }
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const sheetW = COLS * CELL_W;
  const sheetH = ROWS * CELL_H;
  const scale = Math.max(sheetW / w, sheetH / h);
  camera.left = (-w * scale) / 2;
  camera.right = (w * scale) / 2;
  camera.top = (h * scale) / 2;
  camera.bottom = (-h * scale) / 2;
  camera.near = -50;
  camera.far = 50;
  camera.position.set(0, -((ROWS - 1) * CELL_H) / 2 + 0.75, 10);
  camera.updateProjectionMatrix();
}

function next(): void {
  seed += COLS * ROWS;
  populate();
}
window.addEventListener('pointerdown', next);
window.addEventListener('keydown', next);
window.addEventListener('resize', resize);

populate();
resize();
renderer.setAnimationLoop((ms) => {
  // Slow turn, so each bike shows its side, back and front.
  const turn = Math.PI / 2 + ms * 0.0006;
  for (const b of bikes) b.group.rotation.y = turn;
  renderer.render(scene, camera);
});
