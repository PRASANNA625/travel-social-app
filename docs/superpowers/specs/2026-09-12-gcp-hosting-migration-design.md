# GCP Hosting Migration — Design

**Status:** Approved by user, proceeding to implementation plan.

## Goal

Move Triply's backend and web hosting off Render onto Google Cloud
Platform, using the user's existing GCP project and billing account.
Mobile (Expo/EAS) is unaffected except for a config change once the new
backend URL is live.

## Current State (Render)

From `render.yaml`:
- **`travel-social-backend`** — Node/Express + Socket.IO, `npm run build && npm start`, reads `PORT` from the platform, single free-tier instance.
- **`travel-social-db`** — managed Postgres, free tier.
- **`travel-social-web`** — static site, built via `npx expo export -p web`, served from `mobile/dist`.
- File uploads (images, voice notes) already go straight to **Cloudinary** (`backend/src/middleware/upload.ts`) — the backend's local `/uploads` static route (`backend/src/app.ts:21`) is dead code today. No object-storage migration is needed for uploads.
- Backend env vars (from `render.yaml` + `backend/src/config/env.ts`): `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `UPLOADS_DIR` (unused in practice), `PUBLIC_BASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- CORS is already wide open (`cors()` with no options; Socket.IO `cors: { origin: "*" }`) — no change needed for the new domain.

## Target Architecture (GCP)

| Concern | Render today | GCP target |
|---|---|---|
| Backend compute | Render web service | **Cloud Run** service, single container |
| Database | Render Postgres | **Cloud SQL for PostgreSQL** (`db-f1-micro`) |
| Web static site | Render static site | **Firebase Hosting** |
| File uploads | Cloudinary (unchanged) | Cloudinary (unchanged) |
| Secrets | Render env vars | **Secret Manager**, mounted as env vars on the Cloud Run service |

**Region:** `asia-south1` (Mumbai) for both Cloud Run and Cloud SQL, matching the user's location — keeps latency low and Cloud Run's built-in Cloud SQL connector requires same-region (or at least same-project) placement to avoid extra network config.

### Backend — Cloud Run

- New `backend/Dockerfile`: multi-stage Node 20 build — `npm install`, `npx prisma generate`, `npm run build`, then a slim runtime stage running `node dist/server.js`. Prisma's generated client and `node_modules` must be copied into the runtime stage (not regenerated at container start, since Cloud Run containers are stateless per revision anyway).
- `backend/.dockerignore` excludes `node_modules`, `.env`, `dist`, `uploads/`.
- Cloud Run service `travel-social-backend`, region `asia-south1`.
- **`--min-instances=1 --max-instances=1`**: the existing Socket.IO setup (presence tracking, group broadcast) assumes a single server process and has no cross-instance adapter (e.g. Redis). Pinning to exactly one instance reproduces Render's current single-instance behavior exactly. Scaling beyond one instance is explicitly out of scope for this migration — it would require adding a Socket.IO Redis adapter, a separate follow-up task.
- Container listens on `process.env.PORT` (Cloud Run injects `PORT=8080`) — `backend/src/server.ts` already does this via `env.port`; no code change needed.
- Cloud Run's built-in Cloud SQL integration (`--add-cloudsql-instances`) mounts a Unix socket into the container; `DATABASE_URL` uses Prisma's Cloud SQL socket connection format: `postgresql://USER:PASSWORD@localhost/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE`.
- Env vars set directly on the service: `JWT_EXPIRES_IN=30d`, `UPLOADS_DIR=uploads` (kept for parity even though unused), `PUBLIC_BASE_URL` (set to the Cloud Run service URL once known, or the custom domain if one is configured).
- Secrets (`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) live in Secret Manager and are attached to the Cloud Run service as secret-backed env vars, not plain env vars.

### Database — Cloud SQL

- New Cloud SQL for PostgreSQL instance, tier `db-f1-micro`, region `asia-south1`, single zone (no HA needed at this scale — matches Render free-tier's lack of HA).
- One database (`travel_social`) and one application user, created via `gcloud sql` commands.
- **Data migration:** dump the existing Render Postgres with `pg_dump` (using its external connection string) and restore into the new Cloud SQL instance with `pg_restore`/`psql`, run *before* cutting the backend over. Schema is already defined by Prisma migrations — `npx prisma migrate deploy` against the new instance also works if starting from empty (no existing data to preserve), which is the simpler path if the current Render data is disposable dev/test data rather than real user data the user needs kept.
- Prisma migrations run automatically at deploy time via a Cloud Build step (`npx prisma migrate deploy`) before the new container revision receives traffic, mirroring `render.yaml`'s `buildCommand`.

### Web — Firebase Hosting

- Firebase project linked to the same GCP project (Firebase is a layer on top of GCP, not a separate account).
- Build: `cd mobile && npx expo export -p web` (unchanged from Render's `buildCommand`), output directory `mobile/dist`.
- New `firebase.json` (hosting config pointing at `mobile/dist`, SPA rewrite to `index.html`) and `.firebaserc` (project alias).
- Deploy: `firebase deploy --only hosting`.
- Firebase Hosting gives a `*.web.app` URL immediately and supports attaching a custom domain later with automatic SSL, if the user wants one.

### Mobile config

- Once the Cloud Run backend and Firebase-hosted web are verified working, update `mobile/app.json`'s `extra.apiUrl` to the new Cloud Run service URL (or custom domain) and commit that change — this is the only mobile-side change; no EAS rebuild is required for the Expo Go/dev flow, only for a future store build.

## Cutover Plan

1. Provision Cloud SQL, deploy the backend to Cloud Run pointed at it, run migrations, smoke-test directly against the Cloud Run URL (health check + the existing `backend/scripts/smoke-test-chat-sender-identity.mjs`-style manual checks).
2. Deploy the web build to Firebase Hosting, pointed at the same Cloud Run backend URL (temporary env override at build time).
3. Update `mobile/app.json` `extra.apiUrl` and verify the mobile app end-to-end against the new backend.
4. Only after (1)-(3) are verified working, decommission the Render services (`travel-social-backend`, `travel-social-web`, `travel-social-db`) — keeping Render live until GCP is confirmed working is a safety net, not a scope change; the user's earlier choice to "replace Render entirely" is honored by tearing it down at the end of a verified cutover rather than before.

## Out of Scope

- Multi-instance Socket.IO scaling (Redis adapter) — single instance is sufficient today and matches current Render behavior.
- Object storage migration for uploads — already on Cloudinary, unaffected.
- CI/CD automation (Cloud Build GitHub trigger) — first migration is manual (`gcloud`/`firebase` CLI commands) to keep the initial cutover simple; automatic deploy-on-push can be a follow-up once the manual flow is proven.
- Custom domain setup — mentioned as a later option, not required for the migration itself.
