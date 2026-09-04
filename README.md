# Neon Orbit Pinball

A responsive, self-contained browser pinball game served by a small Go HTTP server.

## Run locally

```bash
go run .
```

Open `http://localhost:8080`. Use the left/right arrow keys (or A/D), and Space to launch. Touch controls are included for mobile play.

The service exposes `GET /healthz` for readiness and liveness probes.
