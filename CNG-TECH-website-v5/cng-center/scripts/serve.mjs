import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
if (!fs.existsSync(path.join(root, 'index.html'))) throw Error('Build first: node scripts/build.mjs');
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  if (pathname.split('/').includes('..')) { res.writeHead(403); return res.end(); }
  // This server must NEVER send PHP source or hidden server files to a browser.
  if (pathname.split('/').some(part => part.startsWith('.')) || /\.(?:php|ini|sql)$/i.test(pathname) || /^\/(?:api|admin)(?:\/|$)/i.test(pathname)) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ message: 'فرم و پنل در پیش‌نمایش استاتیک غیرفعال‌اند؛ PHP، MySQL و HTTPS لازم است.' }));
  }
  let target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    if (fs.statSync(target).isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: `${encodeURI(pathname)}/${new URL(req.url, 'http://localhost').search}` }); return res.end(); }
      target = path.join(target, 'index.html');
    }
  } catch {}
  const found = fs.existsSync(target) && fs.statSync(target).isFile();
  if (!found) target = path.join(root, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(target).pipe(res);
});
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port} (Ctrl+C to stop)`));
