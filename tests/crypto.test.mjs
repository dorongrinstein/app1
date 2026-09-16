import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { argon2id } from 'hash-wasm';
import { encryptText, decryptText, parseEnvelope, MAX_TEXT_BYTES, toBase64, fromBase64 } from '../src/crypto.mjs';

const password = 'correct horse battery staple'; // Public test data only.
const sample = '\ufeffPrivate note: שלום 🌍\r\nLine two\twith spaces.\n';

test('Argon2id matches independently generated Python cryptography 46.0/OpenSSL reference', async () => {
  const actual = await argon2id({ password, salt: Uint8Array.from({ length: 16 }, (_,i) => i), parallelism: 4, iterations: 3, memorySize: 65536, hashLength: 32, outputType: 'hex' });
  assert.equal(actual, '853b272a44db1421c02962669a55eb0994f3cab385ed1c4c79253eee19bab49e');
});

test('decrypts independent Python Argon2id/AESGCM fixture', async () => {
  const fixture = await readFile(new URL('./python-fixture.ron', import.meta.url), 'utf8');
  assert.equal(await decryptText(fixture, password), sample);
});

test('preserves Unicode, BOM, whitespace and CRLF; randomized salt and nonce', async () => {
  const a = await encryptText(sample, password);
  const b = await encryptText(sample, password);
  assert.equal(await decryptText(a, password), sample);
  assert.equal(await decryptText(b, password), sample);
  assert.notEqual(JSON.parse(a).salt, JSON.parse(b).salt);
  assert.notEqual(JSON.parse(a).cipher.iv, JSON.parse(b).cipher.iv);
  assert.notEqual(JSON.parse(a).data, JSON.parse(b).data);
  assert(!a.includes('Private note'));
  assert(!a.includes(password));
});

test('rejects wrong password and modified ciphertext, tag, salt, or nonce', async () => {
  const encrypted = await encryptText(sample, password);
  await assert.rejects(decryptText(encrypted, 'a different strong password'), /Unable to decrypt/);
  for (const field of ['data','tag','salt','iv']) {
    const env = JSON.parse(encrypted);
    const key = field === 'tag' ? 'data' : field;
    const holder = key === 'iv' ? env.cipher : env;
    const bytes = fromBase64(holder[key]);
    bytes[field === 'tag' ? bytes.length-1 : 0] ^= 1;
    holder[key] = toBase64(bytes);
    await assert.rejects(decryptText(JSON.stringify(env), password), /Unable to decrypt/);
  }
});

test('rejects malicious resource parameters, format/version changes, truncated data and extra fields', async () => {
  const encrypted = await encryptText(sample, password);
  const changes = [e => e.kdf.memoryKiB = 2**31, e => e.kdf.iterations = 100000000, e => e.kdf.name = 'PBKDF2', e => e.version = 2, e => e.extra = true, e => e.cipher.tagBits = 32, e => e.data = 'AAAA', e => e.salt = 'not base64'];
  for (const change of changes) { const env = JSON.parse(encrypted); change(env); assert.throws(() => parseEnvelope(JSON.stringify(env)), /not a supported/); }
  for (const text of ['null','[]','{}','{"format":"ron-vault"}', 'not json']) assert.throws(() => parseEnvelope(text));
});

test('size boundary and password validation', async () => {
  const text = 'x'.repeat(MAX_TEXT_BYTES);
  const encrypted = await encryptText(text, password);
  assert.equal(await decryptText(encrypted, password), text);
  await assert.rejects(encryptText(text+'x', password), /5 MiB/);
  await assert.rejects(encryptText('', password), /Enter text/);
  await assert.rejects(encryptText('hello', 'short'), /12 characters/);
  await assert.rejects(encryptText('hello', 'x'.repeat(1025)), /1,024/);
});

test('password whitespace is significant and is not silently trimmed', async () => {
  const envelope = await encryptText('secret', ` ${password} `);
  assert.equal(await decryptText(envelope, ` ${password} `), 'secret');
  await assert.rejects(decryptText(envelope, password), /Unable to decrypt/);
});

test('bundled browser worker executes encryption and decryption without network APIs', async () => {
  const script = await readFile(new URL('../dist/crypto-worker.js', import.meta.url), 'utf8');
  async function execute(data) {
    let result;
    const self = { postMessage: value => { result = value; }, close() {} };
    const context = vm.createContext({ self, crypto, WebAssembly, TextEncoder, TextDecoder, Uint8Array, Uint32Array, Int32Array, ArrayBuffer, DataView, atob, btoa, setTimeout, clearTimeout });
    vm.runInContext(script, context);
    await self.onmessage({ data });
    return result;
  }
  const encrypted = await execute({ mode:'encrypt', text:sample, password });
  assert.equal(encrypted.error, undefined);
  const decrypted = await execute({ mode:'decrypt', text:encrypted.result, password });
  assert.equal(decrypted.result, sample);
});
