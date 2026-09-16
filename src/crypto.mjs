import { argon2id } from 'hash-wasm';

export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
export const MAX_ENVELOPE_BYTES = 8 * 1024 * 1024;
export const KDF = Object.freeze({ name: 'Argon2id', version: 19, memoryKiB: 65536, iterations: 3, parallelism: 4 });
const encoder = new TextEncoder();
const invalid = () => new Error('This is not a supported Doron Vault encrypted file.');

export function toBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 16384) result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
export function fromBase64(value, length) {
  if (typeof value !== 'string' || value.length > MAX_ENVELOPE_BYTES || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw invalid();
  let bytes;
  try { bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0)); } catch { throw invalid(); }
  if ((length !== undefined && bytes.length !== length) || toBase64(bytes) !== value) throw invalid();
  return bytes;
}
function exactKeys(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw invalid();
  if (Object.keys(object).sort().join(',') !== keys.slice().sort().join(',')) throw invalid();
}
function header(salt, iv) {
  return { format: 'ron-vault', version: 1, kdf: { ...KDF }, cipher: { name: 'AES-256-GCM', iv, tagBits: 128 }, salt };
}
function checkPassword(password, encrypting) {
  if (typeof password !== 'string' || !password.length) throw new Error('Enter your password.');
  if (encrypting && Array.from(password).length < 12) throw new Error('Use a password with at least 12 characters. A long, random passphrase is better.');
  if (encoder.encode(password).length > 1024) throw new Error('Password must be no more than 1,024 UTF-8 bytes.');
}
async function deriveKey(password, salt, usage) {
  const passwordBytes = encoder.encode(password);
  let raw;
  try {
    raw = await argon2id({ password: passwordBytes, salt, parallelism: KDF.parallelism, iterations: KDF.iterations, memorySize: KDF.memoryKiB, hashLength: 32, outputType: 'binary' });
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);
  } finally { passwordBytes.fill(0); raw?.fill(0); }
}
export async function encryptText(text, password) {
  if (!crypto?.subtle) throw new Error('Secure encryption is unavailable. Open this app over HTTPS in a current browser.');
  checkPassword(password, true);
  if (typeof text !== 'string' || text.length === 0) throw new Error('Enter text or choose a text file first.');
  const plain = encoder.encode(text);
  try {
    if (plain.length > MAX_TEXT_BYTES) throw new Error('Text must be 5 MiB or smaller.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const envelope = header(toBase64(salt), toBase64(iv));
    const key = await deriveKey(password, salt, 'encrypt');
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: encoder.encode(JSON.stringify(envelope)) }, key, plain);
    return JSON.stringify({ ...envelope, data: toBase64(new Uint8Array(ciphertext)) }, null, 2);
  } finally { plain.fill(0); }
}
export function parseEnvelope(text) {
  if (typeof text !== 'string' || text.length > MAX_ENVELOPE_BYTES || encoder.encode(text).length > MAX_ENVELOPE_BYTES) throw invalid();
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw invalid(); }
  exactKeys(envelope, ['format','version','kdf','cipher','salt','data']);
  exactKeys(envelope.kdf, Object.keys(KDF));
  exactKeys(envelope.cipher, ['name','iv','tagBits']);
  if (envelope.format !== 'ron-vault' || envelope.version !== 1 || Object.entries(KDF).some(([k,v]) => envelope.kdf[k] !== v) || envelope.cipher.name !== 'AES-256-GCM' || envelope.cipher.tagBits !== 128) throw invalid();
  const salt = fromBase64(envelope.salt, 16);
  const iv = fromBase64(envelope.cipher.iv, 12);
  const data = fromBase64(envelope.data);
  if (data.length < 17 || data.length > MAX_TEXT_BYTES + 16) throw invalid();
  return { salt, iv, data, aad: encoder.encode(JSON.stringify(header(envelope.salt, envelope.cipher.iv))) };
}
export async function decryptText(text, password) {
  checkPassword(password, false);
  const { salt, iv, data, aad } = parseEnvelope(text);
  const key = await deriveKey(password, salt, 'decrypt');
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: aad }, key, data));
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plain);
  } catch { throw new Error('Unable to decrypt. The password is incorrect, or the encrypted text has been changed or damaged.'); }
  finally { plain?.fill(0); }
}
