// ============================================================
// Three.js scene — faithful recreation of unveil.fr
// Perspective camera (FOV 5), glass-shader panels in a wrapped
// carousel, scroll + drag drive positions, raycaster hover slides
// the panel out, click opens the project detail overlay.
//
// Faithful to the source site:
//  - tiles = ALL project visuals (170), shuffled per load
//    (source: randomTiles: true)
//  - wheel → scroll.current += deltaY/20 (source virtual-scroll
//    formula, no page scrolling, body overflow hidden)
//  - panel layout: x = wrap(-F, F, (i-J)*G), z = -x*aspect*1.5,
//    rotation.y = -PI/6, visible only within z ∈ (-12.5, 12.5)
//
// Performance notes:
//  - 512px webp (~30KB each) → fast local loading
//  - only visible panels are raycast / rendered
//  - one TextureLoader instance reuses the decoded image for the
//    blurred canvas texture
// ============================================================
import * as THREE from "three";
import gsap from "gsap";
import { TILES, TILE_COUNT, type TileData } from "./data-tiles";
import { GLASS_VERTEX, GLASS_FRAGMENT } from "./shaders";

// ---- shared mutable state (plain objects, framework-free) ----
export const win = { w: window.innerWidth, h: window.innerHeight };
export const mouse = { x: 1000, y: -1000 };
export const pointer = { x: 0, y: 0, moved: false };
export const drag = { x: 0, y: 0, active: false };
export const scroll = { current: 0, previous: 0 };
// camPan drives the entrance pan. Source site sets -20, but its entrance
// plays mostly behind the preloader, so users only ever perceive a small
// roll + zoom. We mirror that *perceived* motion: small roll, quick,
// while the camera swoop provides the zoom.
export const camPan = { x: -2 };
export const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export type TileLike = {
  project: TileData;
  mesh: THREE.Object3D;      // raycaster target
  imageGroup: THREE.Group;   // slides out on hover
  setHover(h: boolean): void;
};

let hoveredTile: TileLike | null = null;
const hoverListeners: Array<(t: TileLike | null) => void> = [];
export function onHoverChange(fn: (t: TileLike | null) => void): void {
  hoverListeners.push(fn);
}
export function getHoveredTile(): TileLike | null {
  return hoveredTile;
}

let clickListeners: Array<(t: TileLike) => void> = [];
export function onTileClick(fn: (t: TileLike) => void): void {
  clickListeners.push(fn);
}

// ---- renderer / cameras / scene ----
const container = document.getElementById("app")!;
export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("scene-canvas") as HTMLCanvasElement,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(win.w, win.h);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();

const orthoCamera = new THREE.OrthographicCamera(-win.w / 2, win.w / 2, win.h / 2, -win.h / 2, 0.1, 1000);
orthoCamera.position.set(0, 0, 0);

const perspectiveCamera = new THREE.PerspectiveCamera(5, win.w / win.h, 0.1, 1000);
perspectiveCamera.position.set(0, 100 / 7.5, 35);
perspectiveCamera.lookAt(0, 0, 0);

// ---- layout constants (from source) ----
const G = 0.375;
const F = (TILE_COUNT * G) / 2;
const VIS_RANGE = 12.5;

// ---- randomTiles: shuffle the pool per load (source behaviour) ----
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const tileData = shuffle(TILES);

// ---- blur source ----
// Frosted edge: a build-time gaussian-blurred webp (scripts/optimize-tiles.cjs,
// σ≈13 ≈ old runtime canvas blur(40px)) is loaded per tile — zero canvas work
// on the main thread. Path derived from the original src:
//   img/tiles/x.webp → img/tiles-blur/x.webp
function blurSrcOf(src: string): string {
  return src.replace("img/tiles/", "img/tiles-blur/");
}

// ---- tiles ----
const tiles: TileLike[] = [];
const hoverMeshes: THREE.Mesh[] = [];
let tilesReady = 0;
const totalTiles = TILE_COUNT;
const readyListeners: Array<() => void> = [];
export function whenReady(fn: () => void): void {
  if (tilesReady >= totalTiles) {
    fn();
  } else {
    readyListeners.push(fn);
  }
}

export function getTiles(): TileLike[] {
  return tiles;
}

// ---- load progress for the preloader ----
const progressListeners: Array<(pct: number) => void> = [];
export function onLoadProgress(fn: (pct: number) => void): void {
  progressListeners.push(fn);
}
function reportProgress(): void {
  const pct = Math.round((tilesReady / totalTiles) * 100);
  progressListeners.slice(0).forEach((fn) => fn(pct));
}

// GSAP-style wrap: wrap(min, max, value) → value wrapped into [min, max)
function wrap(min: number, max: number, value: number): number {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

// single shared TextureLoader — its internal Image is reused for blur
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("");

function buildTile(project: TileData, index: number): void {
  // group hierarchy: v (tile) > w (image holder) > A (image mesh); v > J (hover mesh)
  const v = new THREE.Group();
  const w = new THREE.Group();
  v.add(w);

  // Both textures load in parallel; the tile only completes when BOTH are in.
  let imageTexture: THREE.Texture | null = null;
  let blurTexture: THREE.Texture | null = null;
  let failed = false;
  const failCount = (): void => {
    if (failed) return;
    failed = true;
    // still count it so the preloader cannot hang forever
    tilesReady++;
    reportProgress();
    if (tilesReady === totalTiles) {
      readyListeners.splice(0).forEach((fn) => fn());
    }
  };

  const finish = (): void => {
    if (!imageTexture || !blurTexture) return;
    try {
      const img = imageTexture.image as HTMLImageElement;
      const be = img.naturalHeight / img.naturalWidth;
      const fe = 1 - (be - 1) * 0.5;
      // 0.8 = user-requested shrink by 1/5
      let W = 1.5 * be * fe * 0.8;
      let H = 1.5 * fe * 0.8;

      // Source uses a BoxGeometry with 0.0175 thickness bound to ONE
      // ShaderMaterial (A = new rn(q, D)) — all 6 faces render the glass
      // shader. No frosted-black side faces: a side material projected a
      // dark outline around every panel under the tilted camera.
      // Edge colour therefore comes 100% from mix(image, blur) and follows
      // the artwork (dark art → dark edge, light art → light edge).
      // Thickness halved to 0.008 so the side faces don't rasterise into
      // a visible aliased sliver under the tilted camera.
      const geometry = new THREE.BoxGeometry(H, W, 0.008, 1, 1, 1);

      const material = new THREE.ShaderMaterial({
        vertexShader: GLASS_VERTEX,
        fragmentShader: GLASS_FRAGMENT,
        uniforms: {
          uBlurTexture: { value: blurTexture },
          uImageTexture: { value: imageTexture },
          uImageSize: { value: new THREE.Vector2(img.naturalWidth, img.naturalHeight) },
          uMeshSize: { value: new THREE.Vector2(H, W) },
          uSaturation: { value: 1 }
        },
        transparent: true
      });

      const A = new THREE.Mesh(geometry, material);
      A.position.x = -(H - 1.5) / 2;

      const J = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0, transparent: true, depthWrite: false })
      );
      J.scale.x = 1.5;
      J.visible = true;

      w.add(A);
      v.add(J);
      scene.add(v);

      const tile: TileLike = {
        project,
        mesh: J,
        imageGroup: w,
        setHover(h) {
          if (canHover) {
            gsap.to(w.position, { x: h ? 0.325 : -0.325, y: h ? -0.1 : 0, ease: "expo.out", duration: 0.5 });
          } else {
            gsap.to(w.position, { x: h ? 2 / 3 : 0, y: h ? -0.1 : 0, ease: "expo.out", duration: 0.5 });
          }
        }
      };

      (J as THREE.Mesh & { userTile?: TileLike }).userTile = tile;
      hoverMeshes.push(J);
      tiles.push(tile);
      tilesReady++;
      reportProgress();
      if (tilesReady === totalTiles) {
        readyListeners.splice(0).forEach((fn) => fn());
      }
    } catch (err) {
      console.error("[unveil] tile build failed for", project.src, err);
      failCount();
    }
  };

  const onImage = (t: THREE.Texture): void => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    imageTexture = t;
    finish();
  };
  const onBlur = (t: THREE.Texture): void => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    blurTexture = t;
    finish();
  };

  textureLoader.load(project.src, onImage, undefined, (err) => {
    console.error("[unveil] image failed to load:", project.src, err);
    failCount();
  });
  // Static blur webp — if it ever 404s, degrade to the sharp image (edge
  // frost disappears but the panel still renders; no hard failure).
  textureLoader.load(blurSrcOf(project.src), onBlur, undefined, (err) => {
    console.error("[unveil] blur failed to load:", blurSrcOf(project.src), err);
    blurTexture = imageTexture;
    finish();
  });
}

tileData.forEach((p, i) => buildTile(p, i));

// ---- raycaster hover (only visible panels) ----
const raycaster = new THREE.Raycaster();

function pickHovered(): TileLike | null {
  if (!perspectiveCamera) return null;
  raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), perspectiveCamera);
  const hits = raycaster
    .intersectObjects(hoverMeshes, false)
    .map((h) => (h.object as THREE.Mesh & { userTile?: TileLike }).userTile)
    .filter((t): t is TileLike => !!t && !!t.mesh.visible);

  if (hits.length) {
    // topmost = closest to camera (smallest distance)
    return hits[0];
  }
  return null;
}

// ---- virtual scroll (source formula: current += deltaY/20) ----
// The page never scrolls (body overflow hidden). Wheel events are
// intercepted and converted directly into carousel motion.
function onWheel(e: WheelEvent): void {
  // source virtual-scroll: current -= (deltaY+deltaX)/20
  // wheel down (deltaY>0) → current decreases → J decreases → x grows
  // → panels move right (same direction as unveil.fr)
  scroll.current -= (e.deltaY + e.deltaX) / 20;
}
window.addEventListener("wheel", onWheel, { passive: true });

// keyboard (source virtual-scroll: arrows / space)
const KEY_STEP = 120;
function onKeyDown(e: KeyboardEvent): void {
  let dy = 0;
  switch (e.keyCode) {
    case 37: // left
    case 38: // up
      dy = -KEY_STEP; // panels move left (same as wheel up)
      break;
    case 39: // right
    case 40: // down
      dy = KEY_STEP; // panels move right (same as wheel down)
      break;
    case 32: // space
      dy = (e.shiftKey ? -1 : 1) * window.innerHeight;
      break;
    default:
      return;
  }
  scroll.current -= dy / 20;
}
window.addEventListener("keydown", onKeyDown);

// ---- drag to pan ----
let dragPointerId = -1;
let dragStartX = 0;
let dragStartY = 0;
let movedPixels = 0;
let holdTimer: number | null = null;

function onPointerDown(e: PointerEvent): void {
  const target = e.target as Element | null;
  if (target && typeof target.closest === "function") {
    if (target.closest("a, button, .detail, .index-overlay, #index-page")) return;
  }
  dragPointerId = e.pointerId;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  movedPixels = 0;
  holdTimer = window.setTimeout(() => {
    drag.active = true;
  }, 150);
}

function onPointerMove(e: PointerEvent): void {
  if (dragPointerId !== e.pointerId) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  movedPixels = Math.max(movedPixels, Math.abs(dx), Math.abs(dy));
  if (movedPixels > 4) {
    drag.x = dx;
    drag.y = dy;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }
}

function onPointerUp(e: PointerEvent): void {
  if (dragPointerId !== e.pointerId) return;
  dragPointerId = -1;
  const wasDrag = drag.active;
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  drag.active = false;
  drag.x = 0;
  drag.y = 0;

  // quick tap on a hovered tile → open detail
  if (!wasDrag && movedPixels <= 6) {
    const t = getHoveredTile();
    if (t) {
      clickListeners.forEach((fn) => fn(t));
    }
  }
}

container.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);

// ---- window mouse tracking ----
window.addEventListener("pointermove", (e) => {
  if (dragPointerId === -1) {
    mouse.x = (e.clientX / win.w) * 2 - 1;
    mouse.y = -(e.clientY / win.h) * 2 + 1;
    pointer.moved = true;
  }
});

window.addEventListener("pointerleave", () => {
  mouse.x = 1000;
  mouse.y = -1000;
});

// ---- resize ----
let entered = false;
function onResize(): void {
  win.w = window.innerWidth;
  win.h = window.innerHeight;
  renderer.setSize(win.w, win.h);
  const aspect = win.w / win.h;
  orthoCamera.left = -win.w / 2;
  orthoCamera.right = win.w / 2;
  orthoCamera.top = win.h / 2;
  orthoCamera.bottom = -win.h / 2;
  orthoCamera.updateProjectionMatrix();
  perspectiveCamera.aspect = aspect;
  perspectiveCamera.updateProjectionMatrix();
  if (!entered) {
    if (aspect < 1) perspectiveCamera.position.set(0, 100 / 7.5, 55);
    else perspectiveCamera.position.set(0, 100 / 7.5, 35);
    perspectiveCamera.lookAt(0, 0, 0);
  }
}
window.addEventListener("resize", onResize);

// ---- entrance animations ----
let dragDrift = 0;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function startEntrance(): void {
  entered = true;
  // small roll (perceived as "小滚动" on the source, which runs most of
  // its -20 pan behind the preloader)
  if (reducedMotion) {
    camPan.x = 0;
  } else {
    gsap.to(camPan, { x: 0, ease: "expo.out", duration: 0.8 });
  }
  // camera swoop: zoom z only — the tilt (y = 100/7.5) is KEPT. The source
  // keeps its downward-tilted camera (verified by pixel measurement of its
  // video: panels project with ±200px vertical spread = diagonal cascade).
  // Tweaking y to 0 made every panel project onto one horizontal line
  // ("横着的") — that was the visible mismatch.
  const targetZ = win.w < 640 ? 35 : 30;
  if (reducedMotion) {
    perspectiveCamera.position.set(0, 100 / 7.5, targetZ);
    perspectiveCamera.lookAt(0, 0, 0);
  } else {
    gsap.to(perspectiveCamera.position, {
      x: 0,
      y: 100 / 7.5,
      z: targetZ,
      ease: "expo.inOut",
      duration: 1.25,
      onUpdate: () => perspectiveCamera.lookAt(0, 0, 0),
    });
  }
}

// ---- main loop ----
export function tick(time: number): void {
  dragDrift += (drag.x - dragDrift) * 0.1;
  scroll.previous += (scroll.current - scroll.previous) * 0.15;

  const aspect = win.w / win.h;
  const q = canHover ? 100 : 50;
  const J = scroll.previous / 25 - dragDrift / q + camPan.x;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const v = t.mesh.parent!;
    const fe = i - J;
    v.position.x = wrap(-F, F, fe * G);
    // Source (node0.js): v.position.y = 0 — all panels sit on the same
    // horizontal line; the "diagonal" look comes purely from
    // rotation.y=-PI/6 and z=-x*aspect*1.5 (depth → perspective scale).
    // Adding a y component would change the scroll axis — do NOT.
    v.position.y = 0;
    v.position.z = aspect < 1 ? -v.position.x * 6 : -v.position.x * aspect * 1.5;
    v.rotation.x = 0;
    v.rotation.y = -Math.PI / 6;
    v.visible = v.position.z < VIS_RANGE && v.position.z > -VIS_RANGE;
    t.mesh.visible = v.visible;
  }

  // hover raycast (only when not dragging)
  if (canHover && !drag.active && pointer.moved && !tilesBusy) {
    const hit = pickHovered();
    if (hit !== hoveredTile) {
      if (hoveredTile) hoveredTile.setHover(false);
      hoveredTile = hit;
      if (hoveredTile) hoveredTile.setHover(true);
      hoverListeners.forEach((fn) => fn(hit));
    }
  }

  renderer.render(scene, perspectiveCamera);

  // ---- debug hook (dev only) ----
  if (import.meta.env.DEV && (window as any).__debugEnable) {
    (window as any).__debug = {
      tilesReady,
      tiles: tiles.length,
      camPan: camPan.x,
      scrollPrev: scroll.previous,
      scrollCur: scroll.current,
      camera: perspectiveCamera.position.toArray(),
      entered,
      hovered: hoveredTile?.project.title ?? null,
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      panel0: (() => {
        const t = tiles[0];
        if (!t) return null;
        const v = t.mesh.parent!;
        return { x: +v.position.x.toFixed(3), z: +v.position.z.toFixed(3), rotY: +v.rotation.y.toFixed(3), vis: v.visible };
      })(),
      panel1: (() => {
        const t = tiles[1];
        if (!t) return null;
        const v = t.mesh.parent!;
        return { x: +v.position.x.toFixed(3), z: +v.position.z.toFixed(3), rotY: +v.rotation.y.toFixed(3), vis: v.visible };
      })()
    };
  }
}

let tilesBusy = false;
export function setTilesBusy(b: boolean): void {
  tilesBusy = b;
}
