// Re-download the 12 home images as small webp (replace PNGs for faster load)
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const root = "D:\\Desktop\\rep\\unveil-3d";
const outDir = path.join(root, "public", "img");
fs.mkdirSync(outDir, { recursive: true });

// name -> datocms raw url
const items = [
  ["1_vase", "https://www.datocms-assets.com/127841/1788541837-unveil_mmc_1c.png"],
  ["2_eclipse", "https://www.datocms-assets.com/127841/1788538976-unveil_eclipse_shadows_1.png"],
  ["3_optics", "https://www.datocms-assets.com/127841/1786377064-unveil_sculpted_optics_2.png"],
  ["4_runway", "https://www.datocms-assets.com/127841/1786375321-unveil_runway_aif_t_1.png"],
  ["5_kalash", "https://www.datocms-assets.com/127841/1784121809-unveil_kalash_05.png"],
  ["6_lek", "https://www.datocms-assets.com/127841/1780589955-unveil_le_k_1.png"],
  ["7_heliot", "https://www.datocms-assets.com/127841/1779870627-unveil_hess26_3.png"],
  ["8_47voices", "https://www.datocms-assets.com/127841/1777397839-unveil_47voices_still_4.png"],
  ["9_table", "https://www.datocms-assets.com/127841/1776879940-unveil_meeting_table_1.png"],
  ["10_balenciaga", "https://www.datocms-assets.com/127841/1776256169-unveil_balenciaga_s26_0.png"],
  ["11_nodaleto", "https://www.datocms-assets.com/127841/1776704797-unveil_nodaleto_1.png"],
  ["12_salomon", "https://www.datocms-assets.com/127841/1777908456-unveil_salomon_still_8.png"]
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error("HTTP " + res.statusCode + " for " + url));
        return;
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on("finish", () => ws.close(resolve));
      ws.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout " + url)));
  });
}

(async () => {
  let ok = 0;
  for (const [name, raw] of items) {
    const url = raw + "?dpr=1&fit=max&fm=webp&h=512&q=70&w=512";
    const dest = path.join(outDir, name + ".webp");
    try {
      await download(url, dest);
      const size = fs.statSync(dest).size;
      // remove the old png to avoid duplicate weight
      const old = path.join(outDir, name + ".png");
      if (fs.existsSync(old)) fs.unlinkSync(old);
      console.log("OK", name, size, "bytes");
      ok++;
    } catch (e) {
      console.log("FAIL", name, e.message);
    }
  }
  console.log("done ok=" + ok);
})();
