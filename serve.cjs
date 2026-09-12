// Minimal static file server for the built site (no deps)
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    // HTML/JS/CSS: no-cache (dev iteration). Images/fonts: immutable — they
    // never change once built, so cache them or every reload re-downloads
    // all 170 tiles (the preloader stalls for seconds on each refresh).
    const cacheable = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ttf', '.ico'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheable ? 'public, max-age=604800, immutable' : 'no-cache'
    });
    res.end(data);
  });
});
server.listen(4174, () => console.log('static server on 4174'));
