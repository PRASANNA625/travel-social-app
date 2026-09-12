# Google Play Store Beta Release — Design

## Goal

Get Triply into a small group of real testers' hands via Google Play's **Internal Testing** track, at zero cost beyond Google's own mandatory one-time $25 Play Developer registration fee.

## Current State / Blockers Found

Investigation of the repo surfaced several gaps between "the app works in dev" and "the app is ready for a real external tester":

1. **Phone/OTP login is a mock.** `backend/src/modules/auth/phoneProvider.ts` never sends a real SMS — it generates a code, logs it server-side, and (per `backend/src/modules/auth/auth.service.ts:62-66`) echoes the code directly back in the API response as `devCode` so it's testable without a real SMS provider. This is explicitly dev/testing scaffolding (see the file's own comments) and cannot go to real external testers as-is. Wiring a real SMS provider (Twilio, MSG91, etc.) costs money per message and is out of scope for a free beta.
2. **Google Sign-In is already disabled in the code**, independent of anything above — `mobile/src/screens/LoginScreen.tsx` has its Google button block commented out (`// Google Sign-In temporarily disabled`), and `app.json`'s `extra.googleClientId` is an empty string (no real Android OAuth client is registered). Re-enabling it requires registering an OAuth client with a signing-key SHA-1 fingerprint — real scope, not needed for a first beta.
3. **No privacy policy exists anywhere** in the repo or docs. Google Play requires a reachable privacy policy URL for every app, including internal testing.
4. **No Android adaptive icon.** `mobile/assets/` contains only a single 1254×1254 `icon.png`; `app.json` has no `android.adaptiveIcon` key. Without one, modern Android launchers apply their own mask/crop to the plain icon, which looks worse than a proper adaptive icon but is not a hard blocker — worth a minimal fix since it's cheap.
5. **`eas.json`'s `production` build profile has no `autoIncrement`.** With `cli.appVersionSource: "remote"` (already set), EAS manages `android.versionCode` on its servers, but only auto-increments it per build if the profile opts in. Without this, a second beta build would reuse the same version code and Play Console would reject the upload.

## Decisions (confirmed with the user)

- **Testing track: Internal Testing** — free, up to 100 testers by email, live within minutes, no Google review wait. This is the fastest path to "a beta in testers' hands."
- **Phone login: disabled for this release**, not fixed. The entry point is removed from `LoginScreen.tsx`; the screen/route itself stays in the codebase (dead but reachable by re-adding one button) so re-enabling later needs no rework of `PhoneLoginScreen.tsx` itself.
- **Google Sign-In: stays disabled**, matching its current already-disabled state. This release ships with **email/password only** as the auth method. Re-enabling Google Sign-In is explicitly a follow-up, not part of this release.
- **Privacy policy: drafted by this work and hosted on GitHub Pages** (free), covering what Triply actually collects: account info (name, email), profile data (photo, bio, interests, travel preferences, language preference), location (for trip discovery/distance), photos/media (profile, cover, trip, chat attachments, voice messages), and chat/message content. No phone-number-based data collection is mentioned, since phone login is disabled for this release.
- **Cost: $25 one-time to Google only.** Every other piece (EAS Build free tier, GitHub Pages, Internal Testing track) is free.

## Code Changes

### 1. Remove the phone login entry point

`mobile/src/screens/LoginScreen.tsx` — remove the "Phone login" `TouchableOpacity` block (the one navigating to `"PhoneLogin"`), leaving the "Create account" link and the rest of the login form untouched. `PhoneLoginScreen.tsx`, its route in `AuthStack.tsx`, and its type in `navigation/types.ts` are **not** removed — only this one entry point, so the feature can come back later by re-adding a single button.

### 2. Add a minimal Android adaptive icon

`mobile/app.json` — add an `android.adaptiveIcon` block reusing the existing `icon.png` as the foreground image on a plain brand-teal background color (`#0f766e`, Triply's existing primary color from `mobile/src/theme/tokens.ts`), rather than commissioning new artwork:

```json
"android": {
  "package": "com.triply.app",
  "adaptiveIcon": {
    "foregroundImage": "./assets/icon.png",
    "backgroundColor": "#0f766e"
  },
  "permissions": [...]
}
```

### 3. Fix version-code auto-increment

`mobile/eas.json` — add `"autoIncrement": true` to the `production` build profile so each new build for this profile gets a unique, incrementing Android version code automatically:

```json
"production": { "channel": "production", "autoIncrement": true }
```

### 4. Pre-build checklist (not a code change, a verification step)

Before running the actual production build, confirm `mobile/app.json`'s `extra.apiUrl` points at the real production backend (`https://travel-social-backend-831528339617.asia-south1.run.app`), not any worktree's local-dev override — this must be done on a clean checkout of whatever branch is being released from (`master`, after the currently-open PRs are merged), not from a feature worktree.

## Privacy Policy

A new static HTML page, plain language, covering: what data Triply collects (see Decisions above), why (core app functionality — trip discovery, group chat, profile), that it's not sold to third parties, how a user can request account deletion (via existing in-app means or a contact email), and a last-updated date. Published as `docs/privacy-policy.html` in this same repo, with GitHub Pages enabled to serve from the `master` branch's `/docs` folder — no new repo or separate hosting account needed, giving a stable URL of the form `https://<github-username>.github.io/travel-social-app/privacy-policy.html` for the Play Console listing.

## Play Console Setup (manual, user-performed)

These steps happen in the Google Play Console UI/dashboard, not in this repo, and are walked through interactively rather than automated, the same way the GCP hosting migration was:

1. Register a Google Play Developer account (if not already done) — $25 one-time, Google's own identity verification (can take hours to ~2 days).
2. Create the app entry in Play Console (name, default language, app/game type, free/paid).
3. Fill in the minimum "Main store listing": short description, full description, app icon (512×512, generated from the same source icon), at least 2 phone screenshots (screenshots must come from the user running the actual app, since this environment cannot capture them), category, contact email.
4. Complete the required questionnaires: content rating (via Google's rating questionnaire), data safety form (answers driven directly by what's in the privacy policy above), target audience/age group.
5. Set the privacy policy URL to the page published above.
6. Create the Internal Testing track, add tester email addresses (up to 100).

## Build & Release Flow

1. `eas build --platform android --profile production` from a clean `master` checkout (after the pre-build checklist above) — produces a signed `.aab` on Expo's free EAS Build tier; EAS manages the signing keystore automatically unless the user wants to provide their own.
2. Either `eas submit --platform android --profile production` (uploads directly to the Internal Testing track via the `submit` config already in `eas.json`) or a manual `.aab` upload through the Play Console UI — both are free; `eas submit` needs a Google Service Account key set up once, which is an extra one-time manual step in Google Cloud Console (not a cost, just a setup step).
3. Testers accept the Play Console invite link and install via the Play Store's internal testing flow.

## Out of Scope

- Re-enabling Google Sign-In (needs OAuth client + SHA-1 fingerprint registration).
- Wiring a real SMS provider for phone login (recurring cost per message).
- Closed/Open testing tracks, or a production release (this spec is Internal Testing only).
- Custom-designed app icon/splash/feature-graphic artwork (using existing assets with minimal adaptation only).
- Any change to backend hosting (already on Cloud Run per the earlier GCP migration; this release just points the mobile build at that existing production URL).
