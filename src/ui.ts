// ============================================================
// DOM overlays — preloader, header, hover label, routing,
// index page (table + stage), project detail overlay
// ============================================================
import gsap from "gsap";
import { onHoverChange, onTileClick, onLoadProgress, setTilesBusy, type TileLike } from "./scene";
import { PROJECTS } from "./data";
import { ALL_PROJECTS } from "./data-full";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ============ preloader ============
const preloader = document.getElementById("preloader") as HTMLElement;
const preloaderPct = document.getElementById("preloader-pct") as HTMLElement;
let preloaderDone = false;

onLoadProgress((pct) => {
  if (preloaderPct) preloaderPct.textContent = pct + "%";
});

export function finishPreloader(onDone: () => void): void {
  if (preloaderDone) return;
  preloaderDone = true;
  if (preloaderPct) preloaderPct.textContent = "100%";
  // keep the number readable for a moment, then fade the curtain
  const hide = () => {
    if (reduced || !preloader) {
      preloader?.remove();
      onDone();
      return;
    }
    gsap.to(preloader, {
      opacity: 0,
      duration: 0.7,
      ease: "power1.inOut",
      onComplete: () => {
        preloader?.remove();
        onDone();
      }
    });
  };
  window.setTimeout(hide, 350);
}

// ============ entrance fade for chrome ============
export function fadeInChrome(): void {
  const els = document.querySelectorAll("#home [data-chrome]");
  if (reduced) {
    els.forEach((el) => (el as HTMLElement).style.opacity = "1");
    document.querySelectorAll("#home [data-chrome-raise]").forEach((el) => {
      (el as HTMLElement).style.transform = "translateY(0)";
    });
    return;
  }
  gsap.to(els, { opacity: 1, duration: 1, stagger: 0.12, delay: 0.4, ease: "power1.out" });
  gsap.to("#home [data-chrome-raise]", {
    y: 0,
    duration: 1.1,
    stagger: 0.1,
    delay: 0.45,
    ease: "expo.out"
  });
}

// ============ hover label (title + description, exclusion blend) ============
const label = document.getElementById("hover-label") as HTMLElement;
let labelTween: gsap.core.Tween | null = null;

function renderLabel(tile: TileLike | null): void {
  if (!label) return;
  if (!tile) {
    label.innerHTML = "";
    return;
  }
  label.innerHTML =
    '<span class="hl-title"></span><span class="hl-desc"></span>';
  (label.querySelector(".hl-title") as HTMLElement).textContent = tile.project.title;
  const desc = tile.project.desc || "";
  const dEl = label.querySelector(".hl-desc") as HTMLElement;
  dEl.textContent = desc;
  dEl.style.display = desc ? "" : "none";
}

onHoverChange((tile) => {
  renderLabel(tile);
  if (labelTween) labelTween.kill();
  labelTween = gsap.to(label, { opacity: tile ? 1 : 0, duration: 0.35, ease: "power1.out" });
});

window.addEventListener("pointermove", (e) => {
  if (!label) return;
  label.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
});

// ============ detail overlay ============
const detail = document.getElementById("detail") as HTMLElement;
const blurLayer = document.getElementById("blur-layer") as HTMLElement;
let detailOpen = false;

export interface DetailData {
  title: string;
  desc: string;
  year: string;
  tags: string[];
  image: string;
  slug: string;
}

function fillDetail(d: DetailData): void {
  const img = detail.querySelector<HTMLImageElement>(".detail-media img")!;
  img.src = d.image;
  img.alt = d.title;
  detail.querySelector<HTMLElement>(".detail-title")!.textContent = d.title;
  detail.querySelector<HTMLElement>(".detail-year")!.textContent = d.year;
  detail.querySelector<HTMLElement>(".detail-desc")!.textContent = d.desc || "";
  const tagsEl = detail.querySelector<HTMLElement>(".detail-tags")!;
  tagsEl.innerHTML = "";
  d.tags.forEach((tag) => {
    const s = document.createElement("span");
    s.textContent = tag;
    tagsEl.appendChild(s);
  });
  detail.querySelector<HTMLAnchorElement>(".detail-link")!.href = "https://unveil.fr/" + d.slug;
}

export function openDetail(d: DetailData): void {
  if (detailOpen) return;
  detailOpen = true;
  fillDetail(d);
  setTilesBusy(true);
  document.body.classList.add("is-detail");
  if (reduced) {
    blurLayer.style.opacity = "1";
    detail.style.opacity = "1";
    detail.style.transform = "translate(-50%, -50%) scale(1)";
    return;
  }
  gsap.to(blurLayer, { opacity: 1, duration: 0.6, ease: "power1.out" });
  gsap.fromTo(
    detail,
    { opacity: 0, scale: 0.92, y: 24 },
    { opacity: 1, scale: 1, y: 0, duration: 0.7, ease: "expo.out", delay: 0.15 }
  );
}

export function closeDetail(): void {
  if (!detailOpen) return;
  detailOpen = false;
  setTilesBusy(false);
  document.body.classList.remove("is-detail");
  if (reduced) {
    blurLayer.style.opacity = "0";
    detail.style.opacity = "0";
    return;
  }
  gsap.to(blurLayer, { opacity: 0, duration: 0.5, ease: "power1.out" });
  gsap.to(detail, { opacity: 0, scale: 0.94, y: 16, duration: 0.45, ease: "power2.in" });
}

function tileToDetail(t: TileLike): DetailData {
  return {
    title: t.project.title,
    desc: t.project.desc,
    year: t.project.year,
    tags: t.project.tags,
    image: t.project.src,
    slug: t.project.slug
  };
}

onTileClick((t) => openDetail(tileToDetail(t)));
document.getElementById("detail-close")?.addEventListener("click", closeDetail);
detail?.addEventListener("click", (e) => {
  if (e.target === detail) closeDetail();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

// ============ routing (#/ home, #/index) ============
const homeEl = document.getElementById("home") as HTMLElement;
const indexPageEl = document.getElementById("index-page") as HTMLElement;

export function getRoute(): string {
  return (window.location.hash || "#/").replace(/^#\/?/, "") || "/";
}

export function onRoute(fn: (route: string) => void): void {
  const apply = () => fn(getRoute());
  window.addEventListener("hashchange", apply);
  apply();
}

export function navigate(route: string): void {
  window.location.hash = "#/" + route.replace(/^\/+/, "");
}

export function applyRoute(route: string): void {
  const isIndex = route === "index";
  homeEl.classList.toggle("route-hidden", isIndex);
  indexPageEl.classList.toggle("route-hidden", !isIndex);
  document.body.classList.toggle("is-index-page", isIndex);
  // keep the 3D loop cheap but alive behind the index page
  if (isIndex) setTilesBusy(true);
  else setTilesBusy(false);
  if (isIndex) renderIndexPage();
}

// ============ index page: table + stage ============
const tableEl = document.getElementById("index-table") as HTMLElement;
const stageImg = document.getElementById("index-stage-img") as HTMLImageElement;
let stageTween: gsap.core.Tween | null = null;
const imgCache = new Map<string, string>(); // src -> loaded src

function preloadImg(src: string): void {
  if (imgCache.has(src) || !src) return;
  imgCache.set(src, src);
  const im = new Image();
  im.src = src;
}

function setStage(src: string): void {
  if (stageTween) stageTween.kill();
  if (!src) {
    stageImg.style.opacity = "0";
    return;
  }
  stageImg.src = src;
  stageTween = gsap.to(stageImg, { opacity: 1, duration: 0.45, ease: "power1.out" });
}

let rendered = false;
function renderIndexPage(): void {
  if (rendered) return;
  rendered = true;

  // group by year, newest first
  const byYear = new Map<string, typeof ALL_PROJECTS>();
  for (const p of ALL_PROJECTS) {
    const list = byYear.get(p.year) || [];
    list.push(p);
    byYear.set(p.year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => +b - +a);

  tableEl.innerHTML = "";
  for (const year of years) {
    const items = byYear.get(year)!;
    for (const p of items) {
      // source structure: li.mb-5 flex w-full > 3 spans
      const row = document.createElement("li");
      row.className = "idx-row";
      row.dataset.slug = p.slug;

      const c1 = document.createElement("span");
      c1.className = "idx-year";
      c1.textContent = p.year;
      const c2 = document.createElement("span");
      c2.className = "idx-name";
      c2.textContent = p.title.toUpperCase();
      const c3 = document.createElement("span");
      c3.className = "idx-cat";
      c3.textContent = p.tags.join(" / ").toUpperCase();

      row.append(c1, c2, c3);

      row.addEventListener("pointerenter", () => {
        preloadImg(p.image);
        setStage(p.image);
        row.classList.add("is-hover");
      });
      row.addEventListener("pointerleave", () => {
        row.classList.remove("is-hover");
      });
      row.addEventListener("click", () => {
        openDetail({
          title: p.title,
          desc: p.desc,
          year: p.year,
          tags: p.tags,
          image: p.image,
          slug: p.slug
        });
      });
      tableEl.appendChild(row);
    }
  }

  // default stage image: first project
  if (ALL_PROJECTS.length) {
    preloadImg(ALL_PROJECTS[0].image);
    stageImg.src = ALL_PROJECTS[0].image;
  }

  // stagger fade-in rows
  if (reduced) {
    tableEl.querySelectorAll(".idx-row").forEach((r) => ((r as HTMLElement).style.opacity = "1"));
    return;
  }
  gsap.fromTo(
    tableEl.querySelectorAll(".idx-row"),
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.012, delay: 0.15, ease: "power1.out" }
  );
}

// ============ wire buttons ============
document.getElementById("btn-index")?.addEventListener("click", () => navigate("index"));
document.getElementById("btn-overview")?.addEventListener("click", () => {
  // Overview opens the full project index too
  navigate("index");
});
document.querySelectorAll("[data-nav-home]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  })
);
document.querySelectorAll("[data-nav-overview]").forEach((el) =>
  el.addEventListener("click", () => navigate("/"))
);
document.querySelectorAll("[data-nav-index]").forEach((el) =>
  el.addEventListener("click", () => navigate("index"))
);
// non-routed nav buttons (research/studio/contact) → keep on home, no-op
document.querySelectorAll(".nav-btn[href^='#/research'], .nav-btn[href^='#/studio']").forEach((el) =>
  el.addEventListener("click", (e) => e.preventDefault())
);

// keep window.__tiles for compatibility
onTileClick((t) => openDetail(tileToDetail(t)));
