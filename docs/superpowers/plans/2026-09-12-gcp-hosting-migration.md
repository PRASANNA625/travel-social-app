# GCP Hosting Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan is also the user's manual deployment guide.** Every step is a real terminal command meant to be run directly (by a human or an agent with shell + gcloud/firebase access), not pseudocode. There is no automated test suite for infrastructure provisioning — "verify" steps run a real command and check its real output.

**Goal:** Move Triply's backend and web hosting from Render to Google Cloud Platform (Cloud Run + Cloud SQL + Firebase Hosting), with no data migration (fresh database) and no CI/CD automation in this pass.

**Architecture:** Containerize the existing Express/Socket.IO backend and deploy it to Cloud Run (single instance, region `asia-south1`), backed by a new Cloud SQL for PostgreSQL instance. Deploy the existing Expo web static export to Firebase Hosting. Update the mobile app's API URL once both are verified, then decommission Render.

**Tech Stack:** Docker, Google Cloud Run, Cloud SQL (PostgreSQL), Secret Manager, Cloud Build, Firebase Hosting, existing Node/Express/Prisma/Socket.IO backend, existing Expo web export.

**Spec:** `docs/superpowers/specs/2026-09-12-gcp-hosting-migration-design.md`

## Global Constraints

- Region for all resources: `asia-south1` (Mumbai).
- Cloud Run service: `--min-instances=1 --max-instances=1` — the backend's Socket.IO presence/broadcast logic assumes exactly one server process; do not change this in this plan.
- No data migration — the new Cloud SQL database starts empty; schema comes from `npx prisma migrate deploy`.
- No CI/CD automation in this pass — every deploy step is a manual CLI command.
- Do not decommission Render until Task 7 (mobile verified end-to-end) is complete.
- Every placeholder in ALL CAPS (`PROJECT_ID`, `YOUR_...`) must be replaced with a real value before running a command — they are not valid as literal text.

---

### Task 1: GCP Project Prerequisites

**Files:** None (CLI/console setup only).

**Interfaces:**
- Produces: an authenticated `gcloud` CLI, a known `PROJECT_ID`, and the GCP APIs required by every later task enabled on that project.

- [ ] **Step 1: Confirm gcloud is installed**

Run: `gcloud version`
Expected: prints a Google Cloud SDK version. If it errors with "command not found", install it first from https://cloud.google.com/sdk/docs/install, then re-run this step.

- [ ] **Step 2: Authenticate and set the active project**

```bash
gcloud auth login
gcloud config set project PROJECT_ID
```

Replace `PROJECT_ID` with your existing GCP project ID (find it at https://console.cloud.google.com/home/dashboard if unsure — it's shown under "Project info").

Verify:
```bash
gcloud config get-value project
```
Expected: prints `PROJECT_ID` back.

- [ ] **Step 3: Confirm billing is enabled**

```bash
gcloud billing projects describe PROJECT_ID
```
Expected: `billingEnabled: true` in the output. If `false`, link a billing account in the console before continuing — every later step fails without this.

- [ ] **Step 4: Enable required APIs**

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

Expected: command completes with no error (may take 1-2 minutes).

Verify:
```bash
gcloud services list --enabled --filter="run.googleapis.com OR sqladmin.googleapis.com OR secretmanager.googleapis.com OR cloudbuild.googleapis.com OR artifactregistry.googleapis.com"
```
Expected: all 5 APIs listed.

---

### Task 2: Create the Cloud SQL Instance

**Files:** None (GCP resource creation only).

**Interfaces:**
- Consumes: `PROJECT_ID`, region `asia-south1` (Global Constraints).
- Produces: a running Cloud SQL instance named `travel-social-db`, a database `travel_social`, and an application user `travel_app` with a known password — Task 4 and Task 5 both need the instance connection name (`PROJECT_ID:asia-south1:travel-social-db`) and the user credentials.

- [ ] **Step 1: Create the Cloud SQL for PostgreSQL instance**

```bash
gcloud sql instances create travel-social-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-south1 \
  --storage-size=10GB \
  --storage-auto-increase
```

Expected: takes several minutes; ends with `Created [https://sqladmin.googleapis.com/.../instances/travel-social-db]`.

- [ ] **Step 2: Set the postgres superuser password**

```bash
gcloud sql users set-password postgres \
  --instance=travel-social-db \
  --password=CHOOSE_A_STRONG_POSTGRES_PASSWORD
```

Keep `CHOOSE_A_STRONG_POSTGRES_PASSWORD` somewhere safe (a password manager) — you won't need it again in this plan, but you will if you ever need direct admin access.

- [ ] **Step 3: Create the application database**

```bash
gcloud sql databases create travel_social --instance=travel-social-db
```

Expected: `Created database [travel_social]`.

- [ ] **Step 4: Create the application user**

```bash
gcloud sql users create travel_app \
  --instance=travel-social-db \
  --password=CHOOSE_A_STRONG_APP_PASSWORD
```

Keep `CHOOSE_A_STRONG_APP_PASSWORD` — it goes into the `DATABASE_URL` secret in Task 3.

- [ ] **Step 5: Record the instance connection name**

```bash
gcloud sql instances describe travel-social-db --format="value(connectionName)"
```

Expected output format: `PROJECT_ID:asia-south1:travel-social-db`. Copy this exact string — Task 4 (local migration) and Task 5 (Cloud Run deploy) both need it.

---

### Task 3: Create Secret Manager Secrets

**Files:** None (GCP resource creation only).

**Interfaces:**
- Consumes: the Cloud SQL connection name and `travel_app` password from Task 2; existing Cloudinary/Google/Anthropic credentials the user already has from the current Render deployment (visible in the Render dashboard's environment variables for `travel-social-backend`, since `render.yaml` marks them `sync: false`, meaning Render never displays their value in the yaml itself but the dashboard shows the actual configured value).
- Produces: 6 secrets in Secret Manager, referenced by name in Task 5's Cloud Run deploy command: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

- [ ] **Step 1: Create the DATABASE_URL secret**

Build the connection string using the Cloud Run Cloud SQL socket format (this exact string, with your own values substituted, also gets used again in Task 4):

```bash
echo -n "postgresql://travel_app:CHOOSE_A_STRONG_APP_PASSWORD@localhost/travel_social?host=/cloudsql/PROJECT_ID:asia-south1:travel-social-db" | \
  gcloud secrets create DATABASE_URL --data-file=-
```

Use the same `CHOOSE_A_STRONG_APP_PASSWORD` value you set in Task 2 Step 4.

- [ ] **Step 2: Create the JWT_SECRET secret**

Generate a new random secret (do not reuse the Render one, to avoid invalidating tokens issued by the old backend once both are momentarily live):

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create JWT_SECRET --data-file=-
```

- [ ] **Step 3: Create the remaining secrets from your existing Render values**

Look up each current value in the Render dashboard (`travel-social-backend` service → Environment tab), then run:

```bash
echo -n "YOUR_GOOGLE_CLIENT_ID" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
echo -n "YOUR_ANTHROPIC_API_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
echo -n "YOUR_CLOUDINARY_CLOUD_NAME" | gcloud secrets create CLOUDINARY_CLOUD_NAME --data-file=-
echo -n "YOUR_CLOUDINARY_API_KEY" | gcloud secrets create CLOUDINARY_API_KEY --data-file=-
echo -n "YOUR_CLOUDINARY_API_SECRET" | gcloud secrets create CLOUDINARY_API_SECRET --data-file=-
```

Verify all 7 secrets exist:
```bash
gcloud secrets list --format="value(name)"
```
Expected: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (7 lines).

- [ ] **Step 4: Grant the Cloud Run runtime service account access to these secrets**

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
for SECRET in DATABASE_URL JWT_SECRET GOOGLE_CLIENT_ID ANTHROPIC_API_KEY CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

Expected: 7 `Updated IAM policy` confirmations. Without this step, Cloud Run's deploy in Task 5 fails with a permission error when it tries to mount these secrets.

---

### Task 4: Build the Backend Container and Run Migrations

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Interfaces:**
- Consumes: `backend/package.json` scripts (`build` = `tsc -p tsconfig.json`, `start` = `node dist/server.js`), `backend/prisma/schema.prisma` (existing, unmodified), the Cloud SQL connection name from Task 2 Step 5.
- Produces: a container image pushed to Artifact Registry at `asia-south1-docker.pkg.dev/PROJECT_ID/travel-social/backend:latest`, and an already-migrated Cloud SQL database — both consumed by Task 5's `gcloud run deploy`.

- [ ] **Step 1: Write the Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Write .dockerignore**

Create `backend/.dockerignore`:

```
node_modules
dist
.env
uploads
*.log
```

- [ ] **Step 3: Create an Artifact Registry repository**

```bash
gcloud artifacts repositories create travel-social \
  --repository-format=docker \
  --location=asia-south1
```

Expected: `Created repository [travel-social]`.

- [ ] **Step 4: Build and push the image with Cloud Build**

Run from the repo root:

```bash
gcloud builds submit backend \
  --tag=asia-south1-docker.pkg.dev/PROJECT_ID/travel-social/backend:latest
```

Expected: build log ends with `Successfully built ...` / `DONE`, and a final line confirming the image was pushed to the `asia-south1-docker.pkg.dev/...` tag.

- [ ] **Step 5: Install the Cloud SQL Auth Proxy locally (for running migrations)**

Download the proxy binary for your OS from https://cloud.google.com/sql/docs/postgres/sql-proxy#install, or on Windows via PowerShell:

```powershell
Invoke-WebRequest -Uri "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.x64.exe" -OutFile "cloud-sql-proxy.exe"
```

- [ ] **Step 6: Start the proxy in the background**

```bash
./cloud-sql-proxy.exe PROJECT_ID:asia-south1:travel-social-db --port 5433 &
```

Expected: logs `The proxy has started successfully and is ready for new connections!`. Leave this running for the next step.

- [ ] **Step 7: Run Prisma migrations against Cloud SQL through the proxy**

```bash
cd backend
DATABASE_URL="postgresql://travel_app:CHOOSE_A_STRONG_APP_PASSWORD@127.0.0.1:5433/travel_social" npx prisma migrate deploy
```

Use the same `travel_app` password from Task 2 Step 4.

Expected: `All migrations have been successfully applied.`

- [ ] **Step 8: Stop the local proxy**

```bash
kill %1
```

(Or close the terminal/process running `cloud-sql-proxy.exe` if `kill %1` doesn't match your shell's job numbering — check with `jobs` first.)

---

### Task 5: Deploy the Backend to Cloud Run

**Files:** None (deploy only; no code changes).

**Interfaces:**
- Consumes: the image from Task 4 Step 4, the Cloud SQL connection name from Task 2 Step 5, the secret names from Task 3.
- Produces: a live Cloud Run service URL (`https://travel-social-backend-XXXXX-el.a.run.app` or similar) — Task 6 and Task 7 both need this URL.

- [ ] **Step 1: Deploy the service**

```bash
gcloud run deploy travel-social-backend \
  --image=asia-south1-docker.pkg.dev/PROJECT_ID/travel-social/backend:latest \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=1 \
  --add-cloudsql-instances=PROJECT_ID:asia-south1:travel-social-db \
  --set-env-vars=JWT_EXPIRES_IN=30d,UPLOADS_DIR=uploads \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,CLOUDINARY_CLOUD_NAME=CLOUDINARY_CLOUD_NAME:latest,CLOUDINARY_API_KEY=CLOUDINARY_API_KEY:latest,CLOUDINARY_API_SECRET=CLOUDINARY_API_SECRET:latest
```

Expected: ends with `Service [travel-social-backend] revision [...] has been deployed` and prints a `Service URL:` line. Copy this URL — call it `BACKEND_URL` for the rest of this plan.

- [ ] **Step 2: Set PUBLIC_BASE_URL now that the URL is known**

```bash
gcloud run services update travel-social-backend \
  --region=asia-south1 \
  --set-env-vars=PUBLIC_BASE_URL=BACKEND_URL
```

Replace `BACKEND_URL` with the actual URL from Step 1 (no trailing slash).

- [ ] **Step 3: Smoke-test the live backend**

```bash
curl BACKEND_URL/health
```

If there's no `/health` route, instead check that the server responds at all:
```bash
curl -i BACKEND_URL/
```
Expected: an HTTP response (200, or a 404 JSON body from Express — either proves the container is up and reachable; a connection error or 5xx means something in Task 4/5 needs fixing before continuing).

- [ ] **Step 4: Check logs if the smoke test fails**

```bash
gcloud run services logs read travel-social-backend --region=asia-south1 --limit=50
```

Common failure: `Missing required env var` — means a secret didn't attach; re-check Task 3 Step 4's IAM binding. Another common failure: Prisma connection refused — re-check the `DATABASE_URL` secret's socket path matches the connection name exactly.

---

### Task 6: Deploy the Web Static Export to Firebase Hosting

**Files:**
- Create: `mobile/firebase.json`
- Create: `mobile/.firebaserc`

**Interfaces:**
- Consumes: `BACKEND_URL` from Task 5 Step 1; `mobile/app.json`'s existing `extra.apiUrl` build-time mechanism (read via `Constants.expoConfig?.extra?.apiUrl` in `mobile/src/api/client.ts:5`).
- Produces: a live Firebase Hosting URL for the web app.

- [ ] **Step 1: Install the Firebase CLI (if not already installed)**

```bash
npm install -g firebase-tools
firebase login
```

- [ ] **Step 2: Create firebase.json**

Create `mobile/firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

- [ ] **Step 3: Create .firebaserc**

Create `mobile/.firebaserc` (replace `PROJECT_ID` with your GCP/Firebase project ID):

```json
{
  "projects": {
    "default": "PROJECT_ID"
  }
}
```

If this project has never been used with Firebase before, first run `firebase projects:addfirebase PROJECT_ID` to link it (Firebase is a layer on top of the same GCP project, not a separate project).

- [ ] **Step 4: Point the web build at the new backend and build**

Temporarily edit `mobile/app.json`'s `extra.apiUrl` to `BACKEND_URL` (the value from Task 5 Step 1), then:

```bash
cd mobile
npx expo export -p web
```

Expected: creates/updates `mobile/dist/`.

- [ ] **Step 5: Deploy to Firebase Hosting**

```bash
firebase deploy --only hosting
```

Expected: ends with `Hosting URL: https://PROJECT_ID.web.app`. Copy this URL — call it `WEB_URL`.

- [ ] **Step 6: Verify the deployed web app loads and can reach the backend**

Open `WEB_URL` in a browser, and confirm the app loads past the login screen's initial data fetch (e.g., trip list loads) without network errors in the browser console.

---

### Task 7: Update Mobile Config and Verify End-to-End

**Files:**
- Modify: `mobile/app.json` (`extra.apiUrl`)

**Interfaces:**
- Consumes: `BACKEND_URL` from Task 5 Step 1.
- Produces: the mobile app (Expo Go and any future build) pointed permanently at the GCP backend.

- [ ] **Step 1: Set the permanent apiUrl**

Edit `mobile/app.json`:

```json
"extra": {
  "apiUrl": "BACKEND_URL",
  ...
}
```

Replace `BACKEND_URL` with the value from Task 5 Step 1 (keep the other `extra` keys unchanged).

- [ ] **Step 2: Commit the config change**

```bash
git add mobile/app.json
git commit -m "Point mobile app at GCP-hosted backend"
```

- [ ] **Step 3: Verify with Expo Go**

```bash
cd mobile
npx expo start
```

Scan the QR code with Expo Go on a physical device on the same network (or any network, since the backend is now public — not LAN-restricted like the local dev setup used earlier). Confirm: login works, the trip list loads, and sending a group chat message works (this exercises both the REST API and the Socket.IO connection through Cloud Run).

- [ ] **Step 4: Three-way check**

Confirm all three now point at the same live backend:
- Mobile app (Task 7 Step 3) — via `BACKEND_URL`
- Web app (Task 6 Step 6) — via `BACKEND_URL`
- `curl BACKEND_URL/` — still responding (Task 5 Step 3)

If all three behave consistently (same data, no errors), the migration is verified.

---

### Task 8: Decommission Render

**Files:** None (Render dashboard actions only).

**Interfaces:**
- Consumes: verified completion of Task 7 — do not start this task until Task 7 Step 4 passed.

- [ ] **Step 1: Confirm no traffic still depends on Render**

Double-check `mobile/app.json`'s `extra.apiUrl` (committed in Task 7 Step 2) no longer points at any `onrender.com` URL, and that `WEB_URL` (Firebase) rather than the old Render static site is what you'll share with anyone testing the app going forward.

- [ ] **Step 2: Delete the Render services**

In the Render dashboard, delete (in this order, so the backend isn't left pointing at a deleted database mid-request):
1. `travel-social-backend`
2. `travel-social-web`
3. `travel-social-db`

- [ ] **Step 3: Remove render.yaml from the repo**

```bash
git rm render.yaml
git commit -m "Remove Render config after GCP migration"
```

- [ ] **Step 4: Final verification**

Re-run Task 7 Step 3 (Expo Go) and Task 6 Step 6 (web) one more time after Render is deleted, confirming nothing was silently still depending on it (e.g., a stale `RENDER_EXTERNAL_URL` fallback in `backend/src/config/env.ts:21` — this only matters if `PUBLIC_BASE_URL` was ever unset, which Task 5 Step 2 already set explicitly, so this should be a no-op check, not a fix).

---

## Self-Review Notes

- **Spec coverage:** Task 1-3 cover prerequisites/Cloud SQL/secrets; Task 4-5 cover the backend/Cloud Run section; Task 6 covers Firebase Hosting; Task 7 covers the mobile config section; Task 8 covers the cutover plan's final decommission step. All spec sections have a corresponding task.
- **No data migration task** exists by design — the spec's "Out of Scope"/resolved data-migration decision confirmed the Render DB is disposable, so Task 2 creates an empty database and Task 4 runs `prisma migrate deploy` from scratch instead of a dump/restore.
- **Placeholder values** (`PROJECT_ID`, `CHOOSE_A_STRONG_..._PASSWORD`, `YOUR_...`, `BACKEND_URL`, `WEB_URL`) are intentional user-supplied substitutions, not plan placeholders — each is introduced with an explicit instruction for what real value replaces it, and reused consistently by the same name across later tasks (e.g. `BACKEND_URL` first defined in Task 5 Step 1, consumed in Tasks 6 and 7).
