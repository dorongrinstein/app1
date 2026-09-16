import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/crypto-worker.mjs'], outfile: 'dist/crypto-worker.js', bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['es2022'], legalComments: 'eof' });
await copyFile('node_modules/hash-wasm/LICENSE', 'dist/hash-wasm-LICENSE.txt');
console.log('Built browser encryption worker with locally bundled Argon2id.');
