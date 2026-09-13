// Minimal static file server for the built site (no deps)
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.mp4': 'video/mp4', '.webm': 'video/webm'
};

// Text-like extensions get Brotli compression (cache per path+mtime+size).
// Already-compressed formats (webp/png/jpg/woff2/mp4/…) are skipped.
const COMPRESSIBLE = ['.html', '.js', '.css', '.svg', '.json', '.txt'];
const brCache = new Map(); // key → { data, type }

function serve(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400); res.end('bad request'); return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(filePath, (serr, stat) => {
    if (serr) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mtime = stat.mtimeMs;

    // Cache policy:
    //  - hashed build assets (dist/assets/*.<hash>.js/css) + images/fonts → immutable
    //  - index.html → no-cache (points at hashed assets; always fresh)
    const isHashedAsset = /assets\/[^/]+\.[a-f0-9]{8,}\.(js|css)$/.test(urlPath);
    const cacheable = isHashedAsset || ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ttf', '.ico'].includes(ext);

    if (COMPRESSIBLE.includes(ext)) {
      const accept = (req.headers['accept-encoding'] || '');
      const key = filePath + '|' + stat.size + '|' + mtime;
      let entry = brCache.get(key);
      if (!entry) {
        const raw = fs.readFileSync(filePath);
        entry = {
          data: zlib.brotliCompressSync(raw),
          raw
        };
        if (brCache.size > 64) { // tiny LRU-ish cap
          const first = brCache.keys().next().value;
          brCache.delete(first);
        }
        brCache.set(key, entry);
      }
      if (accept.includes('br')) {
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Encoding': 'br',
          'Cache-Control': cacheable ? 'public, max-age=604800, immutable' : 'no-cache'
        });
        res.end(entry.data);
      } else {
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': cacheable ? 'public, max-age=604800, immutable' : 'no-cache'
        });
        res.end(entry.raw);
      }
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cacheable ? 'public, max-age=604800, immutable' : 'no-cache'
      });
      res.end(data);
    });
  });
}

const server = http.createServer(serve);
server.listen(4174, () => console.log('static server on 4174'));
