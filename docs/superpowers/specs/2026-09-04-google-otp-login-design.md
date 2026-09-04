# Google Sign-In and Phone OTP Login — Design

Date: 2026-09-04

## Context

The mobile Login Screen (`mobile/src/screens/LoginScreen.tsx`) currently only
supports email/password. The backend already implements Google Sign-In and
phone OTP login end-to-end:

- `POST /auth/google` — verifies a Google ID token, creates/finds the user (`backend/src/modules/auth/auth.controller.ts`, `auth.service.ts`)
- `POST /auth/phone/send-otp` / `POST /auth/phone/verify-otp` — OTP flow (`backend/src/modules/auth/phoneProvider.ts`)
- Mobile API hooks already exist: `useGoogleLogin`, `useSendPhoneOtp`, `useVerifyPhoneOtp` (`mobile/src/api/auth.ts`)

Only the mobile UI is missing. This spec covers wiring the UI to the
existing hooks.

## Constraints

- **Phone OTP is a mock provider.** `phoneProvider.ts` logs the OTP code to
  the server console (visible in Render logs) instead of sending real SMS.
  Building against the mock now; swapping in a real SMS provider (e.g.
  Twilio) later requires no UI changes.
- **Google Sign-In cannot be tested in Expo Go.** The `auth.expo.io` proxy
  Expo Go used to rely on for OAuth redirects has been phased out, and
  Google's redirect rules require either an `https://` redirect (Web
  client, works in a browser) or a native bundle ID/package name baked
  into a real build (development/production build, not Expo Go). This
  round targets **Expo Web** (`expo start --web`) for testing. Testing on
  native Expo Go/production builds is a separate follow-up requiring a
  development build (`eas build --profile development`) and bundle
  identifiers, which aren't set up yet.

## Non-goals

- Real SMS delivery (Twilio integration).
- Native (Android/iOS) Google Sign-In testing/build setup.
- Changes to RegisterScreen (Google/OTP naturally double as account
  creation via the existing backend logic, no separate register wiring
  needed).

## Design

### Dependencies

Add to `mobile/package.json`:
- `expo-auth-session` — OAuth request/response handling
- `expo-web-browser` — required peer for the auth popup/redirect

### Google Sign-In (`LoginScreen.tsx`)

- Use `Google.useAuthRequest({ webClientId })` from
  `expo-auth-session/providers/google`.
- `webClientId` is read from `app.json`'s `extra.googleClientId` via
  `expo-constants` (the field already exists as an empty placeholder).
- On a successful response, extract `id_token` and call the existing
  `useGoogleLogin().mutate(idToken)`, which already updates auth state on
  success via `completeLogin`.
- On `response.type === "error"` or `"dismiss"`, show
  `Alert.alert("Google sign-in failed", ...)`.
- If `googleClientId` is empty/unset, the button renders disabled with a
  short note ("Google sign-in isn't configured yet") instead of attempting
  a request that would fail.

### Phone OTP (`PhoneLoginScreen.tsx`, new file)

A single screen managing a 3-step local state machine:

1. **`phone` step** — `TextInput` for phone number (`keyboardType="phone-pad"`).
   "Send code" button calls `useSendPhoneOtp.mutate(phone)`; on success,
   advances to the `code` step. Basic validation: non-empty, digits only
   (plus optional leading `+`).
2. **`code` step** — `TextInput` for the 6-digit code
   (`keyboardType="number-pad"`, `maxLength={6}`). "Verify" button calls
   `useVerifyPhoneOtp.mutate({ phone, code })`.
   - On success: auth state updates via `completeLogin` (same as other
     flows), navigation resets automatically since the app switches to
     `AppNavigator` when `useAuthStore` reports authenticated (existing
     behavior, unchanged).
   - On a 400 error whose message is "Name is required to create an
     account" (matches `auth.controller.ts`'s `verifyOtp`), advance to the
     `name` step instead of showing a generic error.
   - Other errors: `Alert.alert("Verification failed", ...)`.
   - "Resend code" link re-triggers the `phone` step's send action without
     losing the entered phone number.
3. **`name` step** — `TextInput` for name. "Verify" resubmits
   `useVerifyPhoneOtp.mutate({ phone, code, name })`.

Each step reuses the existing input/button styles from `LoginScreen.tsx`
(`styles.input`, `styles.button`, `styles.buttonText`) for visual
consistency — no new design system introduced.

### Navigation

- `mobile/src/navigation/types.ts`: add `PhoneLogin: undefined` to
  `AuthStackParamList`.
- `mobile/src/navigation/AuthStack.tsx`: register
  `<Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />`.
- `LoginScreen.tsx`: add a `TouchableOpacity` link "Log in with phone
  number" that calls `navigation.navigate("PhoneLogin")`.

### Error handling

All error paths reuse the existing `Alert.alert(title, message)` pattern
already used in `LoginScreen.tsx`/`RegisterScreen.tsx` — no new error UI
component.

### Testing

No test infrastructure exists in this repo (mobile or backend) — verified
by searching for `describe(`/`test(`/`it(` and finding no actual test
files or Jest config. Verification is:
- `tsc --noEmit` in `mobile/` for type correctness.
- Manual exercise of Google Sign-In on Expo Web with a real Google OAuth
  Client ID.
- Manual exercise of phone OTP in Expo Go, reading the mock code from
  Render's server logs.

## Rollout

1. User creates a Google OAuth Client ID (Web application type) in Google
   Cloud Console; guided step-by-step separately from this spec.
2. Client ID set as `extra.googleClientId` in `mobile/app.json` and as
   `GOOGLE_CLIENT_ID` in the backend's Render environment variables.
3. Implementation per this design.
4. Manual verification per the Testing section above.
