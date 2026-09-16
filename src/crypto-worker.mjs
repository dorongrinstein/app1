import { derivePasswordKeyBytes } from './crypto.mjs';
self.onmessage = async ({ data }) => {
  try {
    if (!data || typeof data.password !== 'string' || !(data.salt instanceof Uint8Array) || data.salt.length !== 16) throw new Error('Invalid key derivation request.');
    const key = await derivePasswordKeyBytes(data.password, data.salt);
    self.postMessage({ key: key.buffer }, [key.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The operation could not be completed.' });
  } finally { if (data) data.password = ''; self.close(); }
};
