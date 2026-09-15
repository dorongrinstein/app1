# Gridiron — Tom Football Manager

A complete American football league manager. Node.js 24 and its built-in SQLite driver; no application dependencies.

## Use

Create an account in the app. Each account owns its seasons, teams, players, and scores. Add teams and players manually, or import a CSV, which creates missing roster members. Record play counts for each player and week. Rankings recalculate from your season's scoring rules. Finalize the season to preserve final standings and lock edits; reopen for corrections.

Default scoring: touchdown 6, field goal 3, extra point 1, two-point conversion 2, safety 2. These represent credited scoring plays, not standard fantasy statistics. Passing touchdowns are not separately credited unless you add that category. Highest total points wins; equal totals share rank and MVP. Players without any recorded week are unranked. Average points divides by recorded weeks, including explicit zero-point entries.

## CSV

Download the template inside the app. Required columns: `week`, `team`, `player`, and at least one configured scoring category (`td`, `fg`, `xp`, `two`, `safety` by default). Optional: `jersey`, `position`, `notes`. An exported `total` column is accepted but recalculated. Quote names containing commas. Use whole nonnegative play counts. Up to 2 MB / 5,000 rows per upload. Include jersey numbers to distinguish players sharing a team and name.

Preview never writes. Confirmation validates the entire file and commits atomically. Duplicate player/week rows within a file are rejected. Reimport replaces each included player's complete weekly entry; missing category columns become zero. Unmentioned players/weeks are unchanged. Exported text cells are escaped to prevent spreadsheet formula execution.

## Persistence and deployment

Deploy the container on Control Plane as a stateful workload with one active replica. Mount a persistent volume at `/data` and set `DATA_DIR=/data`. The database uses SQLite WAL mode with FULL synchronous writes. The application creates one SQLite backup per day and retains the last 14 daily files in `/data/backups`.

One replica is intentional: the app and database share a persistent disk. Do not enable horizontal autoscaling or add locations without migrating to a shared database architecture. A replica restart must reuse the volume. Local SQLite backups share the same storage failure domain; download season JSON/CSV to retain an independent copy. The JSON file is an archive for inspection or manual recovery, not an in-app restore feature.

The application has been deployed successfully. The image build and integration tests passed. Live checks confirmed the app serves over HTTPS, database readiness succeeds, and unauthenticated data requests are denied.

## Run and test

```sh
npm start
npm test
```

Environment: `PORT` (8080), `DATA_DIR` (`./data` locally), `NODE_ENV=production` for Secure session cookies. Production must be served over HTTPS. `/health/live` checks the process; `/health/ready` queries SQLite. Docker builds run the integration test before producing the application image.

Tests cover manual scores, CSV parsing and atomicity, duplicate import prevention, cross-account access, optimistic revision conflicts, custom point values, tie handling, season finalization, export, session/logout behavior, CSRF headers, roster copying, and persistence across a real process restart.

Passwords use salted scrypt; sessions are random, stored hashed in SQLite, and sent only in HttpOnly/SameSite=Strict cookies (Secure in production). Requests use parameterized SQL, owner scoping, custom-header and origin checks. There is no email-based password reset. Remember your username and password.

## Maintenance

Keep this source on its dedicated branch. Build a new immutable image tag, then update the existing workload's container image. Preserve the volume and workload name. Roll back application changes by selecting the previous image tag. Never delete the persistent data volume to update application code.
