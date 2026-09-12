# Feedback / Report a Problem — Design

## Goal

Let users report bugs and send general feedback from the Profile screen,
storing submissions in a new backend table for later manual triage. Keep
the flow to a handful of taps and under 30 seconds for the common case
(reporting a bug).

## Existing Architecture (relevant findings)

- **`UserReport`** (`backend/prisma/schema.prisma:319`) already exists but
  is a *user-reports-user* moderation record (`reporterId` → `reportedId`,
  `ReportReason` enum of SPAM/HARASSMENT/etc.). It has no concept of "an
  app bug" or "a suggestion," and forcing this feature into it would mean
  a fake `reportedId` pointing at nothing. **Not reused** — a new table is
  needed, per the spec's own fallback instruction.
- **Modal pattern:** no shared generic dialog component exists; every
  screen hand-rolls the same shell (`mobile/src/components/ReportUserModal.tsx`
  is the closest analog — `Modal` → backdrop `Pressable` → sheet
  `Pressable`, icon badge, title/subtitle, form body, Cancel/Submit button
  row, all styled from `RADIUS`/`SHADOW` tokens and `useTheme()` colors).
  The new feedback modal copies this shell rather than inventing a new one.
- **Image upload:** `backend/src/middleware/upload.ts` already exports
  `upload` (multer memory storage, image-only, 10MB limit) and
  `uploadToCloudinary(file)`. The chat-image flow
  (`messagesRouter.post("/images", upload.single("image"), ...)` →
  `uploadToCloudinary(req.file)` → `{ url }`) is the exact pattern the
  screenshot upload reuses.
- **App version / platform:** `Constants.expoConfig?.version` (via
  `expo-constants`, already a dependency, used in `LoginScreen.tsx`) and
  `Platform.OS` (`"ios" | "android" | "web"`, used throughout) — both
  already available client-side with no new dependency.
- **Backend module shape:** `backend/src/modules/safety/` (routes,
  controller, service, types) is the template — a new
  `backend/src/modules/feedback/` module mirrors it exactly, registered
  in `backend/src/app.ts` as `app.use("/feedback", feedbackRouter)`.
- **Auth:** `requireAuth` middleware sets `req.userId` (a string, not a
  nested `req.user.id`) on an `AuthedRequest`. The feedback router applies
  `feedbackRouter.use(requireAuth)` and controllers read `req.userId!`.
- **`mobile/src/utils/alert.ts`** wraps `RNAlert.alert` on native and
  `window.alert`/`window.confirm` on web — it **is** "the default
  browser/system alert" the request says not to use for the success
  message. Existing screens (e.g. `UserProfileScreen.tsx`'s report-submit
  flow) do use it for **errors**, and this feature keeps that convention
  for error cases (consistent with the rest of the app), but the success
  confirmation gets a custom in-modal state instead, per the explicit
  requirement.

## Data Model

One table serves both "Report a Problem" and "Send Feedback" — they are
the same shape (a type, a description, an optional screenshot), differing
only in which `type` options are offered and some copy/styling. A second
near-identical table would just be duplication.

```prisma
enum FeedbackKind {
  REPORT
  FEEDBACK
}

enum FeedbackStatus {
  NEW
  IN_PROGRESS
  RESOLVED
}

model AppFeedback {
  id            String         @id @default(cuid())
  userId        String
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind          FeedbackKind
  type          String
  description   String
  screenshotUrl String?
  appVersion    String
  platform      String
  status        FeedbackStatus @default(NEW)
  createdAt     DateTime       @default(now())

  @@index([userId])
  @@index([status])
}
```

`type` is a free string rather than an enum: the Report and Feedback
flows have different, small, fixed option lists (`bug`, `chat`,
`notification`, `location`, `login`, `ui`, `other` for reports;
`suggestion`, `improvement`, `general` for feedback), enforced by a zod
`z.enum(...)` per-kind on the backend rather than a single shared Prisma
enum — keeps the two option lists independent without a migration if one
list changes later. `screenshotUrl` reuses the same Cloudinary URL shape
as chat images. No relation back from `User` is exposed in any existing
user-facing API — this table is written-to and read only by this
feature's own module, so no other endpoint's response shape changes.

**Sensitive-data boundary:** the record stores `userId` (so a submitter
can be contacted/correlated if needed) but nothing beyond `appVersion`
and `platform` about the device — no location, no device identifiers, no
contact list, matching the request's "do not expose sensitive user
information." The `POST /feedback` response returns only the created
record's own fields (id, kind, type, status, createdAt) — never another
user's data, and there is no `GET` endpoint in this pass (no admin UI is
being built — out of scope, see below), so nothing about any user's
feedback history is ever returned to any client.

## Backend

`backend/src/modules/feedback/`:

- **`feedback.types.ts`** — zod schemas:
  ```ts
  export const REPORT_TYPES = ["bug", "chat", "notification", "location", "login", "ui", "other"] as const;
  export const FEEDBACK_TYPES = ["suggestion", "improvement", "general"] as const;

  export const createFeedbackSchema = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("REPORT"),
      type: z.enum(REPORT_TYPES),
      description: z.string().trim().min(1).max(2000),
      appVersion: z.string().max(50),
      platform: z.enum(["ios", "android", "web"]),
    }),
    z.object({
      kind: z.literal("FEEDBACK"),
      type: z.enum(FEEDBACK_TYPES),
      description: z.string().trim().min(1).max(2000),
      appVersion: z.string().max(50),
      platform: z.enum(["ios", "android", "web"]),
    }),
  ]);
  ```
- **`feedback.routes.ts`**:
  ```ts
  export const feedbackRouter = Router();
  feedbackRouter.use(requireAuth);
  feedbackRouter.post("/", upload.single("screenshot"), asyncHandler(controller.create));
  ```
- **`feedback.controller.ts`** — parses `req.body` fields (multipart
  fields arrive as strings) through `createFeedbackSchema`, uploads
  `req.file` via `uploadToCloudinary(req.file)` if present, calls the
  service, responds `201` with the created record's public fields.
- **`feedback.service.ts`** — a single `createFeedback(userId, input, screenshotUrl)`
  function wrapping `prisma.appFeedback.create(...)`.
- Wired into `backend/src/app.ts`: `app.use("/feedback", feedbackRouter)`.

One endpoint, one request, matching how chat messages with an image
attach in one action rather than a separate upload step from the client's
perspective (the multipart request still contains both the fields and
the optional file).

## Mobile

### Profile screen entry point

`mobile/src/screens/ProfileScreen.tsx` gets one new `Card` section titled
"Help & Feedback" (icon `help-circle-outline`), placed after the
"Previous trips" section and before the existing `PrimaryButton`s —
matching the existing `Card` + `SectionHeader` + row pattern used
elsewhere on the screen. Two rows, styled like the existing `tripRow`s:

- **🐛 Report a Problem** — "Found something that isn't working
  correctly?" Rendered with a `dangerBg`-tinted icon circle (reusing the
  same tinted-icon-badge convention `ReportUserModal`/`UserSafetyMenu`
  already use for destructive/attention actions) so it reads as more
  prominent than the row below it, per the request.
- **💡 Send Feedback** — "Have an idea or suggestion to improve Triply?"
  Plain row styling, same as any other settings row.

Tapping either opens the same `FeedbackModal` component with a different
`mode` prop.

### `FeedbackModal` component (new, `mobile/src/components/FeedbackModal.tsx`)

Copies `ReportUserModal.tsx`'s shell (`Modal` → backdrop → sheet, icon
badge, title/subtitle, scrollable option list, text input, button row)
rather than introducing a new visual pattern. Props:

```ts
{
  visible: boolean;
  mode: "report" | "feedback";
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { type: string; description: string; screenshot?: ImagePickerAsset }) => void;
}
```

Behavior:

- **Type list** — `mode === "report"` shows the 7 report types (Bug,
  Chat, Notification, Location, Login/Account, UI/Design, Other) as a
  radio list identical in structure to `ReportUserModal`'s reason list;
  `mode === "feedback"` shows the 3 feedback types (Suggestion,
  Improvement, General Feedback). To hit the "under 30 seconds" goal, the
  Report mode **pre-selects "🐛 Bug"** as the default so a user can type
  a description and submit without an extra tap; Feedback mode has no
  default (a suggestion type is a real choice, not a formality).
- **Description** — a `multiline` `TextInput` (`"Tell us what happened…"`
  placeholder for report mode, `"Tell us your idea…"` for feedback mode),
  required (submit stays disabled while empty/whitespace-only, mirroring
  `ReportUserModal`'s `canSubmit` guard).
- **Screenshot** — an optional "Add screenshot/photo" row using
  `expo-image-picker`'s `launchImageLibraryAsync` (same call
  `ProfileScreen.tsx`'s own photo picker already uses), showing a small
  thumbnail + a remove (×) button once picked. Not required.
- **App version / platform** — read via `Constants.expoConfig?.version`
  and `Platform.OS` at submit time, sent as part of the payload; never
  shown as editable fields (the request calls this "automatic capture").
- **Submit button** — disabled while `!canSubmit || isSubmitting`
  (exact same guard shape as `ReportUserModal`), label switches to
  "Submitting…" mid-flight — this, not any extra locking mechanism, is
  what prevents a double-tap from firing two submissions (matches the
  existing codebase convention; no new debouncing infrastructure needed).
- **Success state** — on successful submission, the modal does **not**
  close immediately. Its content swaps in place (same sheet, same
  backdrop) to a confirmation state: a `successBg`-tinted checkmark
  badge, "Thanks! Your feedback has been submitted.", and a single "Done"
  button that closes the modal and resets its internal state. This is
  the "modern Triply custom dialog" the request asks for, built by
  extending the same modal rather than stacking a second one.
- **Error state** (failed submission / network failure) — follows the
  existing convention (`UserProfileScreen.tsx`'s `onSubmitReport`
  `onError`): `Alert.alert("Couldn't submit", err?.response?.data?.error ?? "Try again")`,
  modal stays open with the user's input intact so they can retry without
  retyping anything.

### API hook (`mobile/src/api/feedback.ts`, new)

```ts
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (input: {
      kind: "REPORT" | "FEEDBACK";
      type: string;
      description: string;
      screenshot?: ImagePickerAsset;
    }) => {
      const form = new FormData();
      form.append("kind", input.kind);
      form.append("type", input.type);
      form.append("description", input.description);
      form.append("appVersion", Constants.expoConfig?.version ?? "unknown");
      form.append("platform", Platform.OS);
      if (input.screenshot) {
        appendImageAsset(form, "screenshot", input.screenshot, "feedback.jpg");
      }
      const { data } = await apiClient.post("/feedback", form);
      return data;
    },
  });
}
```

Reuses the existing `appendImageAsset` helper
(`mobile/src/utils/formDataImage.ts`) that already handles the web
`File`-vs-native-`file://`-URI difference for the chat image upload, so
the screenshot attach works identically on Web and Mobile without new
platform-branching code.

## Error Handling Summary

| Case | Behavior |
|---|---|
| Empty description | Submit button stays disabled (client-side guard, same as `ReportUserModal`) |
| Submission in flight | Submit button disabled + "Submitting…" label; prevents duplicate submits |
| Failed submission (4xx/5xx) | `Alert.alert` with the server's error message or a generic fallback; modal stays open, input preserved |
| Network failure | Same as failed submission — `apiClient`'s axios error surfaces the same way an offline chat-image upload already does today |
| Successful submission | In-modal success state (checkmark + thank-you + Done button), not a native alert |

## Out of Scope

- No admin/triage UI for viewing submitted `AppFeedback` records in this
  pass — the request says "keep it simple, no complicated support
  system." `status` exists on the model for future use (e.g. a future
  internal tool or direct DB queries) but no `GET /feedback` endpoint is
  built now, since nothing in the request calls for one.
- No email/push notification to the user when their report's status
  changes — not requested.
- No de-duplication of near-identical reports — not requested, and the
  request's "prevent accidental duplicate submissions" is about a single
  user's double-tap, not cross-user duplicate detection.
