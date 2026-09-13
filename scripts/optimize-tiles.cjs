// ============================================================
// optimize-tiles.cjs — build-time asset optimization (one-shot)
//  1) re-compress public/img/tiles/*.webp  → webp q70 (512px wide)
//  2) generate public/img/tiles-blur/*.webp  (same size, gaussian σ≈13,
//     equivalent to the old runtime `canvas.filter = "blur(40px)"`)
// Runtime then loads both textures directly — zero canvas blur work.
// Run: node scripts/optimize-tiles.cjs
// ============================================================
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const TILES_DIR = path.join(__dirname, "..", "public", "img", "tiles");
const BLUR_DIR = path.join(__dirname, "..", "public", "img", "tiles-blur");

// σ for gaussian blur. CSS/canvas blur(40px) on a 512px image ≈ σ = 40/3 ≈ 13.3.
const BLUR_SIGMA = 13;
const QUALITY = 70;

async function main() {
  if (!fs.existsSync(TILES_DIR)) {
    console.error("tiles dir not found:", TILES_DIR);
    process.exit(1);
  }
  fs.mkdirSync(BLUR_DIR, { recursive: true });

  const files = fs.readdirSync(TILES_DIR).filter((f) => f.endsWith(".webp"));
  let totalBefore = 0;
  let totalAfter = 0;
  let totalBlur = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const src = path.join(TILES_DIR, file);
    const before = fs.statSync(src).size;
    totalBefore += before;

    const img = sharp(src);
    const meta = await img.metadata();

    // 1) re-compress original to q70
    await sharp(src)
      .resize({ width: 512, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(src + ".tmp");
    fs.renameSync(src + ".tmp", src);
    const after = fs.statSync(src).size;
    totalAfter += after;

    // 2) blur static texture (same geometry as the original)
    const blurOut = path.join(BLUR_DIR, file);
    await sharp(src)
      .blur(BLUR_SIGMA)
      .webp({ quality: 75 })
      .toFile(blurOut);
    totalBlur += fs.statSync(blurOut).size;

    if ((i + 1) % 20 === 0 || i === files.length - 1) {
      console.log(`  ${i + 1}/${files.length}  ${file}  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
    }
  }

  console.log("\n=== result ===");
  console.log(`originals : ${(totalBefore / 1048576).toFixed(1)}MB → ${(totalAfter / 1048576).toFixed(1)}MB  (q70, avg ${(totalAfter / 1024 / files.length).toFixed(0)}KB)`);
  console.log(`blur set  : ${(totalBlur / 1048576).toFixed(1)}MB  (${files.length} files, σ=${BLUR_SIGMA}, ${BLUR_DIR})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
