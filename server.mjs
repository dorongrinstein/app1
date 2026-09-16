import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const assets = new Map();
for (const [path, type] of [['/index.html','text/html; charset=utf-8'],['/app.js','text/javascript; charset=utf-8'],['/styles.css','text/css; charset=utf-8'],['/crypto-worker.js','text/javascript; charset=utf-8'],['/hash-wasm-LICENSE.txt','text/plain; charset=utf-8']]) {
  assets.set(path, { body: await readFile(fileURLToPath(new URL(`./dist${path}`, import.meta.url))), type });
}
const headers = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-write=(self)',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin'
};
export const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 }, (request, response) => {
  for (const [name,value] of Object.entries(headers)) response.setHeader(name,value);
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); request.resume(); return; }
  let path;
  try { path = new URL(request.url, 'http://localhost').pathname; } catch { response.writeHead(400); response.end('Bad request'); return; }
  if (path === '/healthz') { response.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'}); response.end(request.method === 'HEAD' ? undefined : 'ok'); return; }
  const asset = assets.get(path === '/' ? '/index.html' : path);
  if (!asset) { response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); response.end(request.method === 'HEAD' ? undefined : 'Not found'); return; }
  response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.body.length });
  response.end(request.method === 'HEAD' ? undefined : asset.body);
});
server.maxRequestsPerSocket = 1000;
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000).unref(); });
