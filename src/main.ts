// ============================================================
// UNVEIL® — entry point
// ============================================================
import "./style.css";
import * as scene from "./scene";
import { fadeInChrome, finishPreloader, onRoute, applyRoute } from "./ui";
import { PROJECTS } from "./data";
import type { TileLike } from "./scene";

// DEBUG flag: only in dev builds (skips per-frame debug object in production)
if (import.meta.env.DEV) (window as any).__debugEnable = true;

// Expose tiles for the index overlay (detail lookup)
scene.whenReady(() => {
  window.__tiles = scene.getTiles();
  if (import.meta.env.DEV) (window as any).__scroll = scene.scroll;
});

// Hash routing: #/ home, #/index
onRoute((route) => {
  applyRoute(route);
});

// Single rAF loop drives the 3D scene (scroll is driven by wheel events
// inside scene.ts using the source site's virtual-scroll formula)
function loop(time: number): void {
  scene.tick(time);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Entrance: when every image is decoded → hide preloader → carousel
// slides into place, camera swoops, chrome fades in.
scene.onLoadProgress((pct) => {
  // (preloader number updated inside ui)
});
scene.whenReady(() => {
  finishPreloader(() => {
    scene.startEntrance();
    fadeInChrome();
  });
});

// Refs used by UI
declare global {
  interface Window {
    __tiles?: TileLike[];
    __projects?: typeof PROJECTS;
  }
}
window.__projects = PROJECTS;
