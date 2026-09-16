# Ron Vault

Password-based text encryption and decryption entirely in the browser. The server serves a fixed allowlist of static assets and health checks; it rejects all methods except GET and HEAD. No application database, telemetry, cookies, external scripts, or browser persistence.

## Cryptography

- AES-256-GCM via native Web Crypto, with a fresh random 96-bit nonce and 128-bit authentication tag.
- Argon2id v1.3 via pinned, bundled hash-wasm 4.12.0: 64 MiB memory, 3 iterations, 4 lanes, fresh 128-bit random salt, 256-bit output. This is RFC 9106's second recommended profile for memory-constrained environments.
- Versioned JSON `.ron` envelope containing KDF parameters, salt, nonce, and ciphertext/tag. The canonical header is authenticated as GCM additional data. Unknown formats/parameters and oversized inputs are rejected before derivation.
- Crypto runs in a dedicated worker; the worker is terminated after each operation. Password byte arrays and temporary plaintext/key byte buffers are cleared on a best-effort basis. JavaScript strings and garbage-collected memory cannot be securely erased with a guarantee.
- New passwords must contain at least 12 Unicode code points, but length alone does not ensure strength. Recommend a password manager or several randomly selected words. No password reset or recovery.
- Text limit 5 MiB UTF-8; encrypted input limit 8 MiB; password limit 1,024 UTF-8 bytes. No Unicode normalization or password trimming.

This is a new application, not independently audited. Browser extensions, malware, developer tools, clipboard history, downloaded plaintext, and a compromised source or hosting server are outside the encryption's protection. Loading a web app requires trusting the code delivered by its origin. Clear session clears the interface and terminates processing; it cannot guarantee erasure of browser memory, OS swap, or clipboard contents. Dependency versions are locked, and Argon2 WebAssembly is bundled locally. CSP blocks network connections from client code and permits only local scripts and workers.

## Development

Requires Node.js 24. Run `npm ci`, `npm run build`, `npm test`, and `npm start`. Open the app over HTTPS (or localhost during development). Build with the Dockerfile for linux/amd64.

## Deployment

Control Plane organization: `doron-test1`; GVC: `ron-gvc`; placement: `aws-us-west-2`; workload: `ron-vault`. Source is isolated on branch `ron-vault-20260915` in `dorongrinstein/app1`. Two small replicas serve the static application. All expensive cryptographic computation runs on the user's device.

## References

- https://www.rfc-editor.org/rfc/rfc9106.html#section-4
- https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- https://github.com/Daninet/hash-wasm

The optional WebMCP capability exposes mode selection only and never returns inputs, credentials, or results. Mode selection clears current content, as does the visible UI.
