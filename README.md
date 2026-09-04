# Triply

A travel-planning + social-meetup mobile app: create and discover trips, request to join, get auto-added to a
private trip group once approved, and chat with your travel crew in real time.

This is the **core loop MVP** out of a much larger product spec — see [Roadmap](#roadmap) for what's deliberately
not built yet.

## Stack

- **Backend**: Node.js, Express, TypeScript, Prisma + PostgreSQL, Socket.IO (real-time chat + notifications), JWT auth
- **Mobile**: React Native (Expo), TypeScript, React Navigation, TanStack Query, Zustand, Socket.IO client

## Project layout

```
backend/    Express API + Prisma schema + Socket.IO server
mobile/     Expo app (screens, navigation, API hooks)
docker-compose.yml   Postgres for local dev
```

## Getting started

### 1. Database

```
docker compose up -d
```

(or point `DATABASE_URL` in `backend/.env` at any Postgres 14+ instance you already have — e.g. a local
Windows service installed via `winget install PostgreSQL.PostgreSQL.16`.)

### 2. Backend

```
cd backend
copy .env.example .env      # then edit values as needed
npm install
npm run prisma:migrate      # creates tables
npm run dev                 # http://localhost:4000
```

Run the end-to-end smoke test (registers two users, creates a trip, requests to join, approves, checks the
group was auto-created, sends a live chat message, and confirms it shows up in history) once the server is
running:

```
npm run smoke
```

Google Sign-In needs a real `GOOGLE_CLIENT_ID` in `.env` to work — leave it blank to disable that path.
Mobile-number OTP is backed by a `MockPhoneProvider` (`src/modules/auth/phoneProvider.ts`) that logs the code
to the server console instead of sending a real SMS — swap it for Twilio/MSG91 when you have credentials.

### 3. Mobile app

```
cd mobile
npm install
npx expo start
```

Before running on a device or emulator, update `apiUrl` in `mobile/app.json` (`expo.extra.apiUrl`) — 
`localhost` only works when the app itself runs on the same machine as the backend (e.g. web preview).
For a physical device use your machine's LAN IP (`http://192.168.x.x:4000`); for the Android emulator use
`http://10.0.2.2:4000`.

**This dev environment cannot launch an iOS/Android simulator**, so the mobile UI itself hasn't been visually
verified — only type-checked. Walk through the golden path yourself on a device/simulator via Expo Go:
register → set up your profile → create a trip → discover it from a second account → request to join →
approve → land in the group chat and exchange messages.

## Core loop implemented

Register (email/password or Google) → build a profile → create or discover a trip → express interest →
owner approves/rejects → a private group is auto-created (owner is added at trip-creation time, so there's
always someone to chat with) → real-time group chat (text + images) → in-app notifications for the whole flow.
Trips also support likes, comments, and bookmarks.

## Roadmap

Deliberately deferred from the full spec to keep this pass focused:

- Shared itinerary / expense-splitting / packing-checklist tools within a group
- Trip photo albums (beyond raw chat images)
- Post-trip ratings & reviews
- Safety features: live location sharing, identity verification, report/block flows
- Full interactive map discovery (current MVP does keyword/filter search + "near me" sort only)
- Voice messages, video, documents, and polls in group chat
- Device push notifications (Expo push tokens) — in-app notification feed exists today
- Web-based admin panel
- AI-powered recommendations/itineraries, booking integrations, multi-language/currency

## Known follow-ups before production

- `npm audit` flags moderate-severity transitive vulnerabilities (Express's `qs`, google-auth-library's `uuid`)
  with no non-breaking fix available yet — revisit before shipping.
- Swap local-disk file storage (`backend/uploads`) for S3-compatible object storage — the `upload.ts` /
  `fileUrl()` helper is the only place that needs to change.
- Real SMS provider for phone OTP; real Google OAuth client ID.
