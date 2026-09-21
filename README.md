# Daily journal

A private shared food, weight, walking, gym and Pilates tracker, with a partner meal-preparation guide. Python standard library only; no analytics, external fonts, food API or third-party JavaScript.

## Run

Provide `AUTH_HASH` as `salt:pbkdf2_sha256_hex` with 600,000 iterations and an initial `APP_CONFIG` JSON containing startWeight, goalWeight, startDate and goalDate. Optional configuration: name, partner, calories, protein, walkMinutes, gymWeekly, pilatesWeekly and timezone. Configuration and password hash are initialized once into SQLite. Do not commit actual profile settings, credentials or journal records.

Run `python server.py`, or build the Dockerfile. The process listens on PORT (8080 by default). Mount durable storage at DATA_DIR (default /data). HTTPS is required in production: cookies are Secure, HttpOnly and SameSite=Strict. COOKIE_SECURE=0 is for localhost development only. Health endpoints: /healthz checks the process; /readyz checks database access.

## Operations

Use a single replica in one location: SQLite is a single shared journal on a persistent volume. Configure scheduled snapshots on the volume. Restarting preserves logs and sessions. Application export downloads journal JSON (not credentials); full recovery uses the volume snapshot. Scale-out requires a shared database, not additional independent volumes.

Sign in on each device with the shared passphrase. Both people may create/edit/delete entries. Password changes revoke other sessions. Login has a 15-attempt/15-minute limit. Every mutation requires an application request header; CORS is not enabled. Session IDs are random and hashed at rest. Nutrition is manually editable and approximate; exercise never adds food calories. Empty days are excluded from food averages unless explicitly marked complete. Date selection uses the configured timezone. No automatic calorie reductions.
