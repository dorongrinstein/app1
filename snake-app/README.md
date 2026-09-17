# Snake — One more round

A dependency-free browser Snake game with keyboard, swipe and touch-button controls; three difficulty levels; progressive speed; pause/resume; optional generated sound; and per-difficulty personal bests saved in localStorage.

The container serves only `snake-app/public/` on port 8080, using nginx as an unprivileged user. `/healthz` is the liveness endpoint. Readiness checks `/index.html` so missing application files prevent traffic.

## Local preview

Run `python3 -m http.server 8080 --directory snake-app/public` and open http://localhost:8080.

## Controls

- Arrow keys or W/A/S/D: steer. Touch screens also support swiping and the directional buttons.
- Space or P: pause/resume. Space starts a round from the welcome screen.
- R: reset to the welcome screen.
- Changing pace starts a fresh round. Each pace has its own local personal best.
- Switching tabs or leaving the window automatically pauses the game.

Scores are local to each browser/device. No accounts, database, analytics, third-party scripts, or external services are used by the game.

## Deployment

Build the root Dockerfile as a linux/amd64 image and deploy on Control Plane with HTTP port 8080. This branch deploys a separate `snake` workload in the existing `ido-cloud` GVC. One replica per location is sufficient for this stateless demo; all gameplay runs in the browser. The workload scales on request rate with a maximum of five replicas per location and includes HTTP readiness and liveness checks.
