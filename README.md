# Mailbox Key

Web UI for personal Microsoft-account refresh tokens using the device authorization flow. Built for Control Plane org `doron-test1`, GVC `dgenk`, workload `hotmail-token`.

Run with Node 22+: `npm start`. No dependencies or client secret. Listen on PORT (default 8080). Set MICROSOFT_CLIENT_ID to override the default public application ID.

In the app registration, support personal Microsoft accounts and enable Authentication > Allow public client flows. No redirect URI required. Choose Graph or IMAP/SMTP permissions in the UI; sign in directly with Microsoft, then copy the returned token. The caller must use this same client ID when refreshing it.

Security: no token persistence, logging, analytics, cookies, browser storage, or third-party frontend assets. Tokens are relayed through the server in memory over HTTPS. Device code and refresh token stay in the initiating browser tab's memory. Refresh token is masked initially, cleared on pagehide/reset and after five minutes. Clipboard copies remain the user's responsibility. Responses are no-store; CSP and same-origin JSON/custom-header checks prevent cross-origin browser API use. The app has no shared token history. Public visitors can only authorize their own Microsoft sessions. Global per-replica request limits are a modest abuse guard, not a distributed rate limiter.

Tests: `npm test` uses simulated Microsoft responses. End-to-end authorization with a real Microsoft account must be completed by the user. Production runs non-root in node:22-alpine.
