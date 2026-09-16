import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/crypto-worker.mjs'], outfile: 'dist/crypto-worker.js', bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['es2022'], legalComments: 'eof' });
const workerSource = await readFile('dist/crypto-worker.js', 'utf8');
await build({ entryPoints: ['src/app.mjs'], outfile: 'dist/app.js', bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['es2022'], define: { VAULT_WORKER_SOURCE: JSON.stringify(workerSource) }, legalComments: 'eof' });
await copyFile('node_modules/hash-wasm/LICENSE', 'dist/hash-wasm-LICENSE.txt');
console.log('Built browser encryption worker with locally bundled Argon2id.');
