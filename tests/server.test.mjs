import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('static server returns the app with restrictive headers, rejects uploads and private paths', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT:'18973' }, stdio:'pipe' });
  try {
    let response;
    for (let i=0;i<40;i++) {
      try { response = await fetch('http://127.0.0.1:18973/'); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert(response);
    assert.equal(response.status, 200);
    assert((await response.text()).includes('Ron Vault'));
    assert(response.headers.get('content-security-policy').includes("connect-src 'none'"));
    assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const path of ['/app.js','/styles.css','/crypto-worker.js','/healthz']) assert.equal((await fetch('http://127.0.0.1:18973'+path)).status, 200);
    for (const path of ['/server.mjs','/package.json','/.git/config','/api/encrypt']) assert.equal((await fetch('http://127.0.0.1:18973'+path)).status, 404);
    for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await fetch('http://127.0.0.1:18973/', {method})).status, 405);
  } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
});
