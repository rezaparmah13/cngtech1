import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const config = JSON.parse(fs.readFileSync(new URL('../config/site.json', import.meta.url)));
const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json')));
info.indexable = info.mode === 'production';
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); entry.isDirectory() ? walk(p) : files.push(p); } }
walk(root);
const htmlFiles = files.filter(p => p.endsWith('.html'));
const titles = new Set();
let links = 0, schemas = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const label = path.relative(root, file);
  const check = (condition, message) => assert.ok(condition, `${label}: ${message}`);
  check(/<html lang="fa" dir="rtl"/.test(html), 'RTL and language');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  check(title && !titles.has(title), 'unique title'); titles.add(title);
  check(/<meta name="description" content="[^"]+"/.test(html), 'description');
  check((html.match(/<h1[ >]/g) || []).length === 1, 'exactly one H1');
  check(/<link rel="canonical" href="https:\/\//.test(html), 'HTTPS canonical');
  check(/<meta name="viewport"/.test(html), 'responsive viewport');
  check(!/undefined|\[object Object\]/.test(html), 'unresolved template');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  check(new Set(ids).size === ids.length, 'unique IDs');
  for (const img of html.matchAll(/<img\b[^>]*>/g)) check(/\balt="[^"]*"/.test(img[0]), 'image alt');
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { JSON.parse(match[1]); schemas++; }
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = match[1].replaceAll('&amp;', '&');
    if (url.startsWith('#')) { check(ids.includes(url.slice(1)), `missing anchor ${url}`); continue; }
    if (!url.startsWith('/')) continue;
    const targetPath = url.split(/[?#]/)[0];
    let target = path.join(root, targetPath);
    if (targetPath.endsWith('/')) target = path.join(target, 'index.html');
    check(fs.existsSync(target), `missing target ${url}`); links++;
    const anchor = url.split('#')[1];
    if (anchor && fs.existsSync(target)) check(fs.readFileSync(target, 'utf8').includes(`id="${anchor}"`), `missing destination anchor ${url}`);
  }
  const noindex = html.includes('noindex');
  check(noindex === (!info.indexable || label === '404.html'), 'robots mode');
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert.equal((sitemap.match(/<loc>/g) || []).length, info.pages);
assert.ok(sitemap.includes(config.site.url));
assert.equal(/^Disallow: \/\s*$/m.test(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8')), !info.indexable);
assert.equal(htmlFiles.length, info.pages + 1);
console.log(`PASS: ${htmlFiles.length} HTML pages, ${links} local references, ${schemas} JSON-LD blocks; mode=${info.mode}`);
