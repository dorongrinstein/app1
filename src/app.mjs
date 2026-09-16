'use strict';
import { encryptText, decryptText } from './crypto.mjs';
const $ = id => document.getElementById(id);
let mode = 'encrypt';
let worker = null;
let workerUrl = null;
let pendingWorkerReject = null;
let operationRevision = 0;
let timeout = null;
let busy = false;
let fileRevision = 0;
let importedText = null;
let resultText = '';
let supported = Boolean(window.isSecureContext && window.crypto?.subtle && window.Worker && window.WebAssembly);
const encoder = new TextEncoder();
const textLimit = 5 * 1024 * 1024;
const envelopeLimit = 8 * 1024 * 1024;

function status(message = '', error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function resetOutput() {
  resultText = '';
  $('output').value = '';
  $('output').hidden = true;
  $('empty-state').hidden = false;
  $('copy').disabled = true;
  $('download').disabled = true;
  $('result-badge').textContent = 'Awaiting text';
  $('result-badge').classList.remove('done');
}
function refreshCount() {
  const bytes = encoder.encode(importedText ?? $('source').value).length;
  const formatted = bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  $('counter').textContent = `${formatted} / ${mode === 'encrypt' ? 5 : 8} MiB`;
}
function setBusy(value) {
  busy = value;
  for (const id of ['run','upload','password','confirm-password','encrypt-mode','decrypt-mode','reveal']) $(id).disabled = value || (id === 'run' && !supported);
  $('source').readOnly = value;
  $('run-label').textContent = value ? (mode === 'encrypt' ? 'Encrypting on your device…' : 'Decrypting on your device…') : (mode === 'encrypt' ? 'Encrypt text' : 'Decrypt text');
  document.querySelector('.spinner').hidden = !value;
  $('run').setAttribute('aria-busy', String(value));
}
function stopWorker(reason = 'Operation cancelled.') {
  if (timeout) clearTimeout(timeout);
  timeout = null;
  worker?.terminate();
  worker = null;
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  workerUrl = null;
  if (pendingWorkerReject) {
    const reject = pendingWorkerReject;
    pendingWorkerReject = null;
    reject(new Error(reason));
  }
}
function deriveInWorker(password, salt) {
  return new Promise((resolve, reject) => {
    pendingWorkerReject = reject;
    try {
      workerUrl = URL.createObjectURL(new Blob([VAULT_WORKER_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      timeout = setTimeout(() => stopWorker('Key derivation took too long. Try again on a device with more available memory.'), 120000);
      worker.onmessage = ({ data }) => {
        pendingWorkerReject = null;
        stopWorker();
        if (data.error) reject(new Error(data.error));
        else if (!(data.key instanceof ArrayBuffer) || data.key.byteLength !== 32) reject(new Error('Invalid encryption key.'));
        else resolve(new Uint8Array(data.key));
      };
      worker.onerror = event => { event.preventDefault(); stopWorker('Key derivation could not start. Reload the app in a current browser.'); };
      worker.postMessage({ password, salt });
    } catch { stopWorker('Key derivation is unavailable in this browser.'); }
  });
}
function resetPassword() {
  $('password').value = '';
  $('confirm-password').value = '';
  $('password').type = 'password';
  $('confirm-password').type = 'password';
  $('reveal').textContent = 'Show';
  $('reveal').setAttribute('aria-label', 'Show password');
  $('reveal').setAttribute('aria-pressed', 'false');
}
function clearSession(announce = true) {
  operationRevision++;
  fileRevision++;
  stopWorker();
  $('source').value = '';
  importedText = null;
  $('file').value = '';
  $('file-label').textContent = 'Text stays in this tab';
  resetPassword();
  resetOutput();
  setBusy(false);
  refreshCount();
  status(announce ? 'Session cleared.' : '');
}
function setMode(next) {
  if (!['encrypt','decrypt'].includes(next)) throw new Error('Choose encrypt or decrypt.');
  if (busy) throw new Error('Clear the current operation first.');
  if (next === mode) return;
  // Mode changes deliberately clear both surfaces and credentials.
  mode = next;
  clearSession(false);
  const enc = mode === 'encrypt';
  for (const name of ['encrypt','decrypt']) {
    $(`${name}-mode`).classList.toggle('active', name === mode);
    $(`${name}-mode`).setAttribute('aria-pressed', String(name === mode));
  }
  $('input-label').textContent = enc ? 'Your text' : 'Encrypted text';
  $('upload-label').textContent = enc ? 'Choose a text file' : 'Choose a .ron file';
  $('file').accept = enc ? '.txt,.md,.csv,.json,.log,.yaml,.yml,.xml,.html,.css,.js,text/*' : '.ron,.json,.txt';
  $('source').placeholder = enc ? 'Type or paste the text you want to protect…' : 'Paste the complete encrypted result, or choose your .ron file…';
  $('password-label').textContent = enc ? 'Create a password' : 'Enter your password';
  $('password').placeholder = enc ? 'At least 12 characters' : 'The password used to encrypt this text';
  $('password').autocomplete = enc ? 'new-password' : 'off';
  $('confirmation').hidden = !enc;
  $('password-hint').textContent = enc ? 'Use a long, unique passphrase. A forgotten password cannot be recovered.' : 'Use the exact original password, including spaces and capitalization.';
  $('output-label').textContent = enc ? 'Encrypted result' : 'Decrypted text';
  $('output').setAttribute('aria-label', enc ? 'Encrypted result' : 'Decrypted text');
  $('empty-title').textContent = enc ? 'Your private text, protected.' : 'Bring your words back.';
  $('empty-copy').textContent = enc ? 'Your encrypted result will appear here. Only the password can unlock it.' : 'Your original text will appear here after the password and file are verified.';
  $('download-label').textContent = enc ? 'Download .ron file' : 'Download .txt file';
  $('output-note').textContent = enc ? 'Save the encrypted file and keep your password separately.' : 'Decrypted text is readable. Take care when copying or saving it.';
}
$('encrypt-mode').addEventListener('click', () => setMode('encrypt'));
$('decrypt-mode').addEventListener('click', () => setMode('decrypt'));
$('clear').addEventListener('click', () => { clearSession(); $('source').focus(); });
$('reveal').addEventListener('click', () => {
  const show = $('password').type === 'password';
  $('password').type = show ? 'text' : 'password';
  $('confirm-password').type = show ? 'text' : 'password';
  $('reveal').textContent = show ? 'Hide' : 'Show';
  $('reveal').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  $('reveal').setAttribute('aria-pressed', String(show));
});
$('source').addEventListener('input', () => {
  importedText = null;
  fileRevision++;
  $('file-label').textContent = 'Text stays in this tab';
  resetOutput(); status(); refreshCount();
});
for (const id of ['password','confirm-password']) $(id).addEventListener('input', () => { resetOutput(); status(); });
$('upload').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file || busy) return;
  const revision = ++fileRevision;
  const limit = mode === 'encrypt' ? textLimit : envelopeLimit;
  if (file.size > limit) return status(`Choose a file no larger than ${mode === 'encrypt' ? 5 : 8} MiB.`, true);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (revision !== fileRevision || busy) { bytes.fill(0); return; }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    finally { bytes.fill(0); }
    $('source').value = text;
    importedText = text;
    $('file-label').textContent = file.name;
    resetOutput(); refreshCount(); status('File opened locally.');
  } catch { if (revision === fileRevision) status('This file could not be read as UTF-8 text. Choose a plain text file.', true); }
});
$('run').addEventListener('click', async () => {
  if (busy || !supported) return;
  if (!$('source').value.length) return status(mode === 'encrypt' ? 'Enter text or choose a text file first.' : 'Paste encrypted text or choose a .ron file first.', true);
  if (encoder.encode(importedText ?? $('source').value).length > (mode === 'encrypt' ? textLimit : envelopeLimit)) return status('The text is larger than the supported limit.', true);
  if (!$('password').value) return status('Enter your password.', true);
  if (mode === 'encrypt' && Array.from($('password').value).length < 12) return status('Use at least 12 characters. A long, random passphrase is better.', true);
  if (encoder.encode($('password').value).length > 1024) return status('Password must be no more than 1,024 UTF-8 bytes.', true);
  if (mode === 'encrypt' && $('password').value !== $('confirm-password').value) return status('The passwords do not match.', true);
  fileRevision++;
  const operation = ++operationRevision;
  resetOutput(); setBusy(true); status('Deriving your key locally. This may take a few seconds.');
  try {
      // Web Crypto stays in the HTTPS document. Opaque-origin Blob workers
      // can run Argon2id but do not expose crypto.subtle in all browsers.
      const result = await (mode === 'encrypt' ? encryptText : decryptText)(importedText ?? $('source').value, $('password').value, deriveInWorker);
      if (operation !== operationRevision) return;
      setBusy(false);
      resultText = result;
      $('output').value = result;
      $('output').hidden = false;
      $('empty-state').hidden = true;
      $('copy').disabled = false;
      $('download').disabled = false;
      $('result-badge').textContent = mode === 'encrypt' ? 'Encrypted' : 'Verified & decrypted';
      $('result-badge').classList.add('done');
      resetPassword();
      status(mode === 'encrypt' ? 'Encrypted. Download or copy the result to keep it.' : 'Decrypted successfully. Your password has been cleared.');
  } catch (error) {
    if (operation !== operationRevision) return;
    stopWorker(); setBusy(false);
    status(error instanceof Error ? error.message : 'The operation could not be completed.', true);
  }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(resultText); status(mode === 'encrypt' ? 'Encrypted text copied.' : 'Decrypted text copied. Your clipboard now contains readable text.'); }
  catch { $('output').focus(); $('output').select(); status('Clipboard access is unavailable. The result is selected; use your usual Copy shortcut.', true); }
});
$('download').addEventListener('click', () => {
  const blob = new Blob([resultText], { type: mode === 'encrypt' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = mode === 'encrypt' ? 'encrypted-text.ron' : 'decrypted-text.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(mode === 'encrypt' ? 'Download started. Keep your password separately.' : 'Download started. This file contains readable text.');
});
window.addEventListener('pagehide', () => clearSession(false));
window.addEventListener('pageshow', event => { if (event.persisted) clearSession(false); });
setBusy(false);
if (!supported) status('Secure encryption is unavailable. Use HTTPS and a current browser with Web Crypto and WebAssembly support.', true);

// Expose navigation only to compatible agents. Never expose text or passwords.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(modelContext.registerTool({ name: 'select_encryption_mode', title: 'Choose encrypt or decrypt', description: 'Switch the visible mode. This clears the current inputs and result; it never reads or returns text or passwords.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['encrypt','decrypt'] } }, required: ['mode'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { if (!input || Object.keys(input).length !== 1 || !['encrypt','decrypt'].includes(input.mode)) throw new Error('Supply mode: encrypt or decrypt.'); setMode(input.mode); return { mode }; } }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Optional browser capability; never affects encryption. */ }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
