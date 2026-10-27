import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

test('preview server: home, assets, redirect, HEAD, 404 and traversal protection', async () => {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [data] = await once(child.stdout, 'data');
    const base = String(data).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(base);
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<html lang="fa" dir="rtl">/);
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
    const head = await fetch(base, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const redirect = await fetch(`${base}/services?test=1`, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), '/services/?test=1');
    assert.equal((await fetch(`${base}/not-a-page/`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    for (const route of ['/api/requests.php', '/api/lib.php', '/admin/', '/admin/index.php', '/.htaccess', '/%2ehtaccess']) {
      const protectedResponse = await fetch(base + route);
      assert.equal(protectedResponse.status, 503);
      assert.doesNotMatch(await protectedResponse.text(), /<\?php|DirectoryIndex/);
    }
    const forbidden = await new Promise((resolve, reject) => {
      http.get(`${base}/..%2fpublic/assets/app.js`, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(forbidden, 403);
  } finally {
    const exit = once(child, 'exit');
    child.kill();
    await exit;
  }
});
