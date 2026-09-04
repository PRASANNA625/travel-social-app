# Google Sign-In and Phone OTP Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mobile Login Screen up to the Google Sign-In and phone-OTP backend endpoints that already exist, with no backend changes.

**Architecture:** `LoginScreen.tsx` gets a "Continue with Google" button using `expo-auth-session`'s Google provider. A new `PhoneLoginScreen.tsx` handles the phone/OTP flow as a 3-step local state machine (phone → code → name-if-new-account), reached via a link from `LoginScreen`.

**Tech Stack:** React Native, Expo SDK, `expo-auth-session`, `expo-web-browser`, `@tanstack/react-query` (existing hooks), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-04-google-otp-login-design.md`

## Global Constraints

- No test framework exists anywhere in this repo (confirmed by searching for `describe(`/`test(`/`it(` — no Jest config, no test files). Verification for every task is `npx tsc --noEmit` in `mobile/` plus manual exercise — not automated tests. Do not add a test framework as part of this plan.
- Phone OTP backend is a mock (`backend/src/modules/auth/phoneProvider.ts`) — it logs the code to the server console instead of sending real SMS. No change needed there.
- Google Sign-In only needs to work on Expo Web (`expo start --web`) this round — native/Expo Go testing is out of scope (see spec's Constraints section).
- Reuse existing styles (`styles.input`, `styles.button`, `styles.buttonText`, `styles.link`) for visual consistency — no new design system.
- Error messages surface via the existing `Alert.alert(title, message)` pattern (`mobile/src/utils/alert.ts`), matching `err?.response?.data?.error` extraction already used in `LoginScreen.tsx`/`RegisterScreen.tsx`. The backend's error middleware (`backend/src/middleware/error.ts`) always returns `{ error: "<message>" }`.

---

### Task 1: Google Sign-In button on LoginScreen

**Files:**
- Modify: `mobile/package.json` (via `npm install`)
- Modify: `mobile/src/screens/LoginScreen.tsx`

**Interfaces:**
- Consumes: `useGoogleLogin()` from `mobile/src/api/auth.ts` — `useMutation` whose `mutate(idToken: string, { onError })` calls `POST /auth/google` and updates auth state on success (already implemented, unchanged).
- Produces: nothing new consumed by later tasks — this task is independently testable.

- [ ] **Step 1: Install dependencies**

```bash
cd mobile
npm install expo-auth-session expo-web-browser
```

- [ ] **Step 2: Verify install**

Run: `cat mobile/package.json | grep -E "expo-auth-session|expo-web-browser"`
Expected: both packages listed under `dependencies`.

- [ ] **Step 3: Replace the full contents of `mobile/src/screens/LoginScreen.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { ResponseType } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import type { AuthStackParamList } from "../navigation/types";
import { useGoogleLogin, useLogin } from "../api/auth";
import { Alert } from "../utils/alert";

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_CLIENT_ID = Constants.expoConfig?.extra?.googleClientId as string | undefined;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const googleLogin = useGoogleLogin();

  const [, googleResponse, promptGoogleLogin] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_ID,
    responseType: ResponseType.IdToken,
    scopes: ["openid", "profile", "email"],
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        googleLogin.mutate(idToken, {
          onError: (err: any) =>
            Alert.alert("Google sign-in failed", err?.response?.data?.error ?? "Please try again"),
        });
      }
    } else if (googleResponse?.type === "error") {
      Alert.alert("Google sign-in failed", googleResponse.error?.message ?? "Please try again");
    }
  }, [googleResponse]);

  const onSubmit = () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail) || !password) {
      Alert.alert("Check your details", "Enter a valid email address and your password.");
      return;
    }
    login.mutate(
      { email: trimmedEmail, password },
      { onError: (err: any) => Alert.alert("Login failed", err?.response?.data?.error ?? "Please try again") }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Travel & Social Meetup</Text>
      <Text style={styles.subtitle}>Find your next trip and your next travel crew.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowPassword((v) => !v)}>
          <Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={login.isPending}>
        {login.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.googleButton}
        onPress={() => promptGoogleLogin()}
        disabled={!GOOGLE_CLIENT_ID || googleLogin.isPending}
      >
        {googleLogin.isPending ? (
          <ActivityIndicator color="#0f766e" />
        ) : (
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        )}
      </TouchableOpacity>
      {!GOOGLE_CLIENT_ID && <Text style={styles.note}>Google sign-in isn't configured yet.</Text>}

      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>New here? Create an account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
  },
  passwordInput: { flex: 1, padding: 14, fontSize: 16 },
  passwordToggle: { paddingHorizontal: 14 },
  passwordToggleText: { color: "#0f766e", fontWeight: "600", fontSize: 14 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  googleButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  googleButtonText: { color: "#0f766e", fontSize: 16, fontWeight: "600" },
  link: { color: "#0f766e", textAlign: "center", marginTop: 16, fontSize: 14 },
  note: { color: "#999", fontSize: 12, textAlign: "center", marginTop: 8 },
});
```

Note: this removes the old placeholder note ("Google Sign-In and phone OTP are wired up on the backend...") since Google is now wired up for real. The phone-login link is added in Task 2.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

If `responseType: ResponseType.IdToken` produces a type error, check the installed type definitions with `cat mobile/node_modules/expo-auth-session/build/AuthRequest.types.d.ts | grep -A5 "enum ResponseType"` and use whichever exact member name (`IdToken` vs `Idtoken` vs a raw string) that file defines instead.

- [ ] **Step 5: Manual verification**

Run: `cd mobile && npx expo start --web`

With `extra.googleClientId` still empty in `app.json` at this point, confirm in the browser that:
- The Login screen renders without crashing.
- The "Continue with Google" button is visible but disabled (greyed out / non-interactive).
- The "Google sign-in isn't configured yet." note is visible.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/screens/LoginScreen.tsx
git commit -m "Add Google Sign-In button to login screen"
```

---

### Task 2: Phone OTP flow (new screen + navigation)

**Files:**
- Modify: `mobile/src/navigation/types.ts`
- Modify: `mobile/src/navigation/AuthStack.tsx`
- Create: `mobile/src/screens/PhoneLoginScreen.tsx`
- Modify: `mobile/src/screens/LoginScreen.tsx`

**Interfaces:**
- Consumes: `useSendPhoneOtp()` — `mutate(phone: string, { onSuccess, onError })`, calls `POST /auth/phone/send-otp`. `useVerifyPhoneOtp()` — `mutate({ phone: string; code: string; name?: string }, { onError })`, calls `POST /auth/phone/verify-otp` and updates auth state on success. Both from `mobile/src/api/auth.ts` (already implemented, unchanged).
- Produces: `AuthStackParamList` gains `PhoneLogin: undefined`, consumed by `PhoneLoginScreen`'s own `Props` type and by `LoginScreen`'s `navigation.navigate("PhoneLogin")` call.

- [ ] **Step 1: Add the `PhoneLogin` route to the auth stack's param list**

In `mobile/src/navigation/types.ts`, change:

```ts
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};
```

to:

```ts
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  PhoneLogin: undefined;
};
```

- [ ] **Step 2: Create `mobile/src/screens/PhoneLoginScreen.tsx`**

```tsx
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation/types";
import { useSendPhoneOtp, useVerifyPhoneOtp } from "../api/auth";
import { Alert } from "../utils/alert";

type Props = NativeStackScreenProps<AuthStackParamList, "PhoneLogin">;

type Step = "phone" | "code" | "name";

const NAME_REQUIRED_ERROR = "Name is required to create an account";
const PHONE_REGEX = /^\+?\d{6,15}$/;

export function PhoneLoginScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const sendOtp = useSendPhoneOtp();
  const verifyOtp = useVerifyPhoneOtp();

  const onSendCode = () => {
    const trimmedPhone = phone.trim();
    if (!PHONE_REGEX.test(trimmedPhone)) {
      Alert.alert("Check your details", "Enter a valid phone number.");
      return;
    }
    sendOtp.mutate(trimmedPhone, {
      onSuccess: () => setStep("code"),
      onError: (err: any) => Alert.alert("Couldn't send code", err?.response?.data?.error ?? "Please try again"),
    });
  };

  const onVerify = (withName?: string) => {
    if (!code.trim()) {
      Alert.alert("Check your details", "Enter the code we sent you.");
      return;
    }
    verifyOtp.mutate(
      { phone: phone.trim(), code: code.trim(), name: withName },
      {
        onError: (err: any) => {
          const message = err?.response?.data?.error;
          if (message === NAME_REQUIRED_ERROR) {
            setStep("name");
            return;
          }
          Alert.alert("Verification failed", message ?? "Please try again");
        },
      }
    );
  };

  const onSubmitName = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Check your details", "Enter your name.");
      return;
    }
    onVerify(trimmedName);
  };

  const isPending = sendOtp.isPending || verifyOtp.isPending;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log in with phone</Text>

      {step === "phone" && (
        <>
          <Text style={styles.subtitle}>We'll text you a one-time code.</Text>
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity style={styles.button} onPress={onSendCode} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === "code" && (
        <>
          <Text style={styles.subtitle}>Enter the 6-digit code sent to {phone.trim()}.</Text>
          <TextInput
            style={styles.input}
            placeholder="Code"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <TouchableOpacity style={styles.button} onPress={() => onVerify()} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSendCode} disabled={isPending}>
            <Text style={styles.link}>Resend code</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "name" && (
        <>
          <Text style={styles.subtitle}>This number is new to us — what's your name?</Text>
          <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
          <TouchableOpacity style={styles.button} onPress={onSubmitName} disabled={isPending}>
            {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { color: "#0f766e", textAlign: "center", marginTop: 16, fontSize: 14 },
});
```

- [ ] **Step 3: Register the screen in the auth stack**

In `mobile/src/navigation/AuthStack.tsx`, change:

```tsx
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "./types";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
```

to:

```tsx
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "./types";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { PhoneLoginScreen } from "../screens/PhoneLoginScreen";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 4: Add the "Log in with phone number" link to LoginScreen**

In `mobile/src/screens/LoginScreen.tsx`, change:

```tsx
      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>New here? Create an account</Text>
      </TouchableOpacity>
    </View>
  );
}
```

to:

```tsx
      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>New here? Create an account</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("PhoneLogin")}>
        <Text style={styles.link}>Log in with phone number</Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `cd mobile && npx expo start` and open in Expo Go (same Wi-Fi network as the dev machine, or `--tunnel` if not).

Confirm:
- Tapping "Log in with phone number" on the Login screen navigates to the new screen.
- Entering a phone number and tapping "Send code" moves to the code step (check the Render/local server console log for the mock OTP code, e.g. `[MockPhoneProvider] OTP for <phone>: <code>`).
- Entering that code and tapping "Verify" either logs in (if the number already has an account) or advances to the name step (new number) — enter a name and tap "Verify" to complete account creation.
- Entering a wrong code shows a "Verification failed" alert.
- "Back to login" returns to the Login screen.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/navigation/types.ts mobile/src/navigation/AuthStack.tsx mobile/src/screens/PhoneLoginScreen.tsx mobile/src/screens/LoginScreen.tsx
git commit -m "Add phone OTP login flow"
```

---

## Self-Review

**Spec coverage:**
- Google Sign-In button + `expo-auth-session` wiring → Task 1. ✓
- `webClientId` from `app.json` `extra.googleClientId` via `expo-constants` → Task 1. ✓
- Disabled button + note when client ID unset → Task 1. ✓
- Phone OTP 3-step flow (phone/code/name) as a new screen → Task 2. ✓
- Navigation route + registration → Task 2. ✓
- "Log in with phone number" link on LoginScreen → Task 2. ✓
- Reuse of existing styles/Alert pattern → both tasks. ✓
- No test framework added, `tsc --noEmit` + manual verification only → Global Constraints, both tasks. ✓

**Placeholder scan:** No TBD/TODO markers; every step has runnable code or an exact command. The one conditional ("if the type error occurs...") names the exact file to check and what to look for, not a vague instruction.

**Type consistency:** `useGoogleLogin`, `useSendPhoneOtp`, `useVerifyPhoneOtp` signatures match `mobile/src/api/auth.ts` exactly as read from the source file. `AuthStackParamList["PhoneLogin"]` is `undefined` in both the type definition (Task 2 Step 1) and `PhoneLoginScreen`'s `Props` (Task 2 Step 2) and `AuthStack.tsx`'s registration (Task 2 Step 3) — no mismatch. `NAME_REQUIRED_ERROR` string matches the backend's exact `HttpError(400, "Name is required to create an account")` message verified in `backend/src/modules/auth/auth.service.ts`.
