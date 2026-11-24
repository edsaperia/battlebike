/** On-screen readouts. Plain DOM, driven by state and events. */
import type { SimState } from './sim/sim';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private dist = el('dist').querySelector('b')!;
  private speed = el('speed').querySelector('b')!;
  private banner = el('banner');
  private bannerTitle = this.banner.querySelector('h1')!;
  private bannerText = this.banner.querySelector('p')!;
  private flash = el('flash');
  private seed = el('seed');
  private best = 0;
  private lastDist = -1;
  private lastSpeed = -1;

  constructor(onNewBike: () => void) {
    try {
      this.best = Number(localStorage.getItem('battlebike.best')) || 0;
    } catch {
      /* storage unavailable: play without a saved best */
    }
    const button = el<HTMLButtonElement>('newbike');
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('click', onNewBike);
  }

  setBikeSeed(seed: number): void {
    this.seed.textContent = `Bike #${seed}`;
  }

  showStart(): void {
    this.bannerTitle.textContent = '';
    this.bannerText.textContent = 'Swipe to change lanes';
    this.banner.classList.add('show');
    window.setTimeout(() => {
      if (this.bannerTitle.textContent === '') this.banner.classList.remove('show');
    }, 2600);
  }

  showCrash(metres: number): void {
    const m = Math.floor(metres);
    const isBest = m > this.best;
    if (isBest) {
      this.best = m;
      try {
        localStorage.setItem('battlebike.best', String(m));
      } catch {
        /* ignore */
      }
    }
    this.bannerTitle.textContent = 'WIPEOUT';
    this.bannerText.innerHTML = `${m} m${isBest ? ' · new best' : ` · best ${this.best} m`}<br>tap to ride again`;
    this.banner.classList.add('show');
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '0.75';
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity 0.6s';
      this.flash.style.opacity = '0';
    });
  }

  update(state: SimState): void {
    const d = Math.floor(state.dist);
    if (d !== this.lastDist) {
      this.dist.textContent = `${d} m`;
      this.lastDist = d;
    }
    const kmh = Math.round(state.speed * 3.6);
    if (kmh !== this.lastSpeed) {
      this.speed.textContent = `${kmh} km/h`;
      this.lastSpeed = kmh;
    }
  }
}
