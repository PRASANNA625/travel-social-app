# Web Dev & Deploy Foundation — Design

**Status:** Approved by user in brainstorming, awaiting written-spec review.

## Context

Web is becoming Triply's fast beta / demo channel: testers and investors open
the Firebase-hosted URL on desktop or phone. The mobile (Expo/EAS) code stays.
The web work is split into three sub-projects, done in order:

1. **Web dev & deploy foundation** — this spec.
2. Fix broken web features (image upload, maps/location/dates, voice notes) —
   reproduce in a browser first, then spec.
3. Desktop layout — centered phone-width column at the root navigator.

This sub-project unblocks the other two: they need the web app running against
the local backend, and every fix needs a safe way to ship.

## Current State

- `mobile/app.json` hardcodes `expo.extra.apiUrl` to the Cloud Run URL
  (`https://travel-social-backend-831528339617.asia-south1.run.app`).
  `mobile/src/api/client.ts` reads it via `Constants.expoConfig.extra.apiUrl`
  (falling back to `http://localhost:4000`). Pointing local web at the local
  backend (`http://localhost:4010`, per `backend/.env`) means hand-editing
  `app.json` and remembering to revert it.
- Web deploy is manual: `npx expo export -p web` then `firebase deploy` from
  `mobile/` (`mobile/firebase.json` serves `dist/` as an SPA;
  `mobile/.firebaserc` targets project `project-6bcdfb4e-8b5b-439a-8c2`).
  Nothing stops a build that points at localhost from being published.
- `mobile/.env.local` is not gitignored (root `.gitignore` only covers `.env`),
  and the Firebase CLI cache `mobile/.firebase/` shows up as untracked.

## Design

### API URL switching

- New `mobile/app.config.ts`. It receives the `app.json` config and returns it
  with `extra.apiUrl` replaced by `process.env.EXPO_PUBLIC_API_URL` when that
  variable is set and non-empty; otherwise `extra.apiUrl` is unchanged.
- `app.json` remains the single source of truth for the production URL. EAS /
  Android builds don't set the variable, so they behave exactly as today.
- No app code changes — `client.ts` already reads `extra.apiUrl`.
- Local web: a gitignored `mobile/.env.local` with
  `EXPO_PUBLIC_API_URL=http://localhost:4010`. Expo CLI loads `.env*` files
  before evaluating the app config, so plain `npm run web` hits the local
  backend.
- Committed `mobile/.env.example` documents the variable (commented-out
  example value, so copying it changes nothing until edited).

### One-command deploy: `npm run deploy:web`

New `mobile/scripts/deploy-web.mjs` (plain Node, no new dependencies), wired as
`"deploy:web": "node scripts/deploy-web.mjs"` in `mobile/package.json`:

1. Read the production URL from `app.json` (`expo.extra.apiUrl`).
2. Run `npx expo export -p web --clear` with `EXPO_PUBLIC_API_URL` explicitly
   set to that URL in the child process environment. This is required: Expo
   loads `.env.local` during production exports too, and an explicit process
   env var is what overrides `.env*` files.
3. Verify the build: scan the JS files under `dist/` and fail (non-zero exit,
   clear message) if the production URL is absent, or if any
   `localhost:<port>` / `10.0.2.2` / `127.0.0.1` API URL is present.
4. Run `firebase deploy --only hosting`.

`npm run deploy:web -- --dry-run` runs steps 1–3 and stops, printing what would
have been deployed.

Any failing step aborts the script with that step's exit code; nothing is
deployed after a failed build or check.

### Housekeeping

- Root `.gitignore`: add `.env.local` and `.firebase/`.
- `README.md`: replace the "update `apiUrl` in `mobile/app.json`" instructions
  with the `.env.local` approach (localhost:4010 for web, LAN IP for a device,
  `10.0.2.2` for the Android emulator), and document `npm run deploy:web`.

## Testing

- **Local dev:** with `.env.local` pointing at `http://localhost:4010` and the
  backend running, `npm run web`; confirm in the browser that API requests go
  to `:4010` (e.g. log in / load Discover).
- **Config fallback:** with no `EXPO_PUBLIC_API_URL`, `npx expo config --type public`
  shows the Cloud Run URL in `extra.apiUrl`; with it set, shows the override.
- **Deploy guard:** with `.env.local` pointing at localhost, run
  `npm run deploy:web -- --dry-run`; it must pass and the bundle must contain
  only the Cloud Run URL. Temporarily breaking the override (e.g. forcing a
  localhost value) must make the check fail.
- The real `firebase deploy` is run only with the user's explicit go-ahead,
  since it publishes the live site.

## Out of Scope

- Google sign-in on web: `expo.extra.googleClientId` is empty, so the web
  Google button cannot work. Config gap, not part of this sub-project.
- The stale `travel-social-web` service in `render.yaml` — left as is.
- CI-based deploys (GitHub Actions); this is a local command only.
- Sub-projects 2 and 3.
