# Droplet deploy notes (marketing CRM)

Reference files for DevOps. Nothing here runs automatically, and nothing here holds a secret
(this repo is public). Values go only into the root-owned env files on the droplet.

```
Internet ─443/80─> nginx (Let's Encrypt, marketing.sessiontalk.co.uk) ─> http://127.0.0.1:3000
                    crm container (Next.js standalone, --network host, 127.0.0.1:3000)
                    └─> postgres://crm_app@127.0.0.1:5432/marketing (pool max 10)
system cron ─> /usr/local/bin/crm-worker ─> 127.0.0.1:3000/api/worker/* (Bearer CRON_SECRET)
```

## Files on the droplet

| Repo file | Install as | Owner / mode |
|---|---|---|
| — (values copied by DevOps, names as in `.env.example`) | `/etc/marketing-crm/app.env` | `root:root 0600` |
| — (`CRON_SECRET=` only) | `/etc/marketing-crm/cron.env` | `root:crm 0640` |
| `deploy/crm-worker.sh` | `/usr/local/bin/crm-worker` | `root:root 0755` |
| `deploy/cron.d/marketing-crm` | `/etc/cron.d/marketing-crm` | `root:root 0644` |

`app.env` must **not** set `DRIP_SENDING_ENABLED` on a new droplet: unset means the workers are no-ops,
so nothing sends until the cutover step sets it. Never add `CONFIRM_EMAIL_SECRET` (SessionCloud only).
Check env files by name only: `cut -d= -f1 /etc/marketing-crm/app.env`.

## Image

Built by `.github/workflows/docker.yml` (never on the droplet; 1 GB RAM cannot build Next.js):
`ghcr.io/sessiontalk/marketing-crm:<git sha>`. Pushes happen on master, on `v*` tags, or by a manual
`workflow_dispatch` run (for a rehearsal image from a branch). Pull requests build without pushing.
After the first push, confirm the GHCR package visibility is **private**. The droplet pulls with a
read-only `read:packages` token stored root-only.

## Run

```sh
docker pull ghcr.io/sessiontalk/marketing-crm:<sha>
docker rm -f crm 2>/dev/null || true
docker run -d --name crm --restart unless-stopped --network host \
  --memory 512m --memory-swap 768m \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --env-file /etc/marketing-crm/app.env \
  -e HOSTNAME=127.0.0.1 -e PORT=3000 \
  ghcr.io/sessiontalk/marketing-crm:<sha>
curl -fsS http://127.0.0.1:3000/api/worker/health   # {"ok":true,"db":"up"}
```

`--network host` with `HOSTNAME=127.0.0.1` keeps the app on loopback only; do not use `-p` (published
Docker ports bypass UFW). Deploy = pull the new tag, restart, health check; keep the previous tag for
rollback (`docker run` the old `<sha>` again).

## Health and errors

- `GET /api/worker/health` → `200 {"ok":true,"db":"up"}` or `503 {"ok":false,"db":"down"}` (`select 1`,
  2 s timeout). It sits under the existing public `/api/worker/` prefix, so the middleware allowlist is
  unchanged (`/api/events/`, `/api/worker/`, `/api/unsubscribe`). Used by the uptime check and the image
  `HEALTHCHECK`.
- DB-backed API routes return `503 {"error":"database unavailable"}` + `Retry-After: 30` when Postgres is
  unreachable; auth checks still run first.

## Cron

`deploy/cron.d/marketing-crm` keeps the old Vercel schedule (`sequences` every 5 min, `trial-nurture` every
10 min). `crm-worker` uses `flock` so runs don't overlap, a 110 s timeout, passes the Bearer header to curl on
stdin (not argv), and logs `job=… http=…` to journald (`journalctl -t crm-worker`).
