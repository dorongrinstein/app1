import { encryptText, decryptText } from './crypto.mjs';
self.onmessage = async ({ data }) => {
  try {
    if (!data || !['encrypt','decrypt'].includes(data.mode)) throw new Error('Unknown operation.');
    const result = await (data.mode === 'encrypt' ? encryptText : decryptText)(data.text, data.password);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The operation could not be completed.' });
  } finally { data.password = ''; data.text = ''; self.close(); }
};
