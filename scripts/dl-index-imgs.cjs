// Download all 43 project thumbnails as small webp to public/img/idx/
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const root = "D:\\Desktop\\rep\\unveil-3d";
const outDir = path.join(root, "public", "img", "idx");
fs.mkdirSync(outDir, { recursive: true });

const projects = JSON.parse(fs.readFileSync("D:\\Desktop\\rep\\unveil-site\\_src\\_projects2.json", "utf8"));

function thumbUrl(p) {
  // take raw url (strip query) and request a small webp
  const raw = (p.thumb || "").split("?")[0];
  if (!raw) return null;
  return raw + "?dpr=1&fit=max&fm=webp&h=512&q=70&w=512";
}

function slugify(s) {
  return (s || "untitled").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

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
  let ok = 0, fail = 0;
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const url = thumbUrl(p);
    const dest = path.join(outDir, i.toString().padStart(2, "0") + "_" + slugify(p.slug) + ".webp");
    if (!url) { console.log("SKIP", p.slug); fail++; continue; }
    try {
      await download(url, dest);
      const size = fs.statSync(dest).size;
      console.log("OK", i, p.slug, size, "bytes");
      ok++;
    } catch (e) {
      console.log("FAIL", i, p.slug, e.message);
      fail++;
    }
  }
  console.log("done ok=" + ok + " fail=" + fail);
})();
