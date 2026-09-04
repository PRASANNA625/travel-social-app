# Multi-Language Support for Auth Screens — Design

Date: 2026-09-04

## Context

No i18n infrastructure exists anywhere in this codebase today (confirmed by
searching for `language`/`i18n`/`locale` across `mobile/src`). This spec adds
one from scratch, scoped to the five pre-login screens:
`WelcomeScreen`, `OnboardingScreen`, `LoginScreen`, `RegisterScreen`,
`PhoneLoginScreen`.

Trigger: while redesigning `RegisterScreen`, the user asked to "keep the
language selector" — one never existed. Follow-up clarified the real ask:
build one, scoped to the auth flow, supporting English, Hindi, Tamil,
Telugu, and Kannada, with the selector reachable from all five screens
(not just Sign Up) since a user might land on any of them first.

## Non-goals

- Translating any post-login screen (Discover, Trip Details, Profile, Group
  Chat, Create Trip, etc.). Only the five auth screens are in scope.
- Translating `Alert.alert(...)` dialogs (validation errors, network
  failures). Several of these render the backend's error message directly
  (`err?.response?.data?.error`), which is English-only from the server —
  translating the client-side alert copy while the server-sourced half
  stays English would be a half-measure. Static screen text (headings,
  labels, placeholders, buttons, links) is what gets translated.
- Auto-detecting the device's system language. Defaults to English;
  the user picks explicitly. (No new dependency like `expo-localization`
  needed as a result.)
- Redesigning `PhoneLoginScreen`'s visual style. It's currently still the
  original plain white template — the only auth screen not yet redesigned
  to the app's gradient/card style. This spec adds the language selector
  and translates its strings, but does not restyle it; that's a separate
  task the user hasn't requested yet.
- Professional translation review. The Hindi/Tamil/Telugu/Kannada strings
  are written from general language knowledge, not a certified translator
  or localization service — treat them as a first draft.

## Design

### File structure (`mobile/src/i18n/`)

- `languages.ts` — the supported-language list:
  ```ts
  export const LANGUAGES = [
    { code: "en", label: "English", native: "English" },
    { code: "hi", label: "Hindi", native: "हिन्दी" },
    { code: "ta", label: "Tamil", native: "தமிழ்" },
    { code: "te", label: "Telugu", native: "తెలుగు" },
    { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  ] as const;
  export type LanguageCode = (typeof LANGUAGES)[number]["code"];
  ```
- `translations/en.json`, `hi.json`, `ta.json`, `te.json`, `kn.json` — flat
  `Record<string, string>` dictionaries, one file per language, same key
  set in every file.
- `LanguageContext.tsx` — the provider and hook:
  ```ts
  const LanguageContext = createContext<{
    language: LanguageCode;
    setLanguage: (code: LanguageCode) => void;
    t: (key: string) => string;
  } | null>(null);

  export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<LanguageCode>("en");

    useEffect(() => {
      AsyncStorage.getItem("app_language").then((stored) => {
        if (stored && LANGUAGES.some((l) => l.code === stored)) {
          setLanguageState(stored as LanguageCode);
        }
      });
    }, []);

    const setLanguage = (code: LanguageCode) => {
      setLanguageState(code);
      AsyncStorage.setItem("app_language", code).catch(() => {});
    };

    const t = (key: string) =>
      translations[language]?.[key] ?? translations.en[key] ?? key;

    return (
      <LanguageContext.Provider value={{ language, setLanguage, t }}>
        {children}
      </LanguageContext.Provider>
    );
  }

  export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
    return ctx;
  }
  ```
  The `t()` fallback chain (current language → English → raw key) means a
  missing or mistyped key renders visibly instead of a blank string or a
  crash — same defensive spirit as the rest of this codebase's error
  handling.

### Mounting the provider

In `mobile/App.tsx`, wrap `<NavigationContainer>` with `<LanguageProvider>`,
inside `QueryClientProvider` (order relative to `QueryClientProvider`
doesn't matter — `LanguageProvider` doesn't touch React Query):

```tsx
<QueryClientProvider client={queryClient}>
  <LanguageProvider>
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  </LanguageProvider>
  <StatusBar style="auto" />
</QueryClientProvider>
```

Only the auth flow (`AuthStack`) consumes `useLanguage()` per the non-goals
above, but mounting the provider above `RootNavigator`'s auth/app branch
point means the selected language survives a logout → back-to-auth-flow
transition instead of resetting to English.

### Selector component (`mobile/src/components/LanguageSelector.tsx`)

A small pill button — current language's `native` label (e.g. "English",
"हिन्दी") with a chevron-down icon — that opens a `Modal` (`transparent`,
`animationType="fade"`) listing all five languages by their native label.
Tapping one calls `setLanguage(code)` and closes the modal. Reused
unmodified across all five screens.

**Placement per screen** (top corner, respecting `useSafeAreaInsets`):
- `WelcomeScreen`, `LoginScreen`, `RegisterScreen`: top-right, same corner
  pattern as `TripDetailScreen`'s header buttons.
- `OnboardingScreen`: top-**left** — top-right is already the Skip button.
- `PhoneLoginScreen`: top-right (this screen currently has no header row;
  the selector is added as the first visually-positioned element without
  otherwise restyling the screen, per the non-goals above).

### Translation keys

Namespaced by screen, with a `common.*` group for strings reused across
screens (`Email`, `Password`, `Full name`) so translations stay consistent
everywhere the same word appears. Full key list (English source values —
Hindi/Tamil/Telugu/Kannada values are written during implementation,
following this same key structure exactly):

```
common.email = "Email"
common.password = "Password"
common.fullName = "Full name"

welcome.brand = "Travel & Social"
welcome.headline = "Your Next Adventure\nStarts Here."
welcome.subtitle = "Discover trips. Meet people. Create memories."
welcome.highlightTrips = "Trips"
welcome.highlightPeople = "People"
welcome.highlightMemories = "Memories"
welcome.getStarted = "Get Started"
welcome.haveAccount = "Already have an account? "
welcome.signIn = "Sign In"

onboarding.skip = "Skip"
onboarding.next = "Next"
onboarding.getStarted = "Get Started"
onboarding.slide1Title = "Discover Your Next Adventure"
onboarding.slide1Desc = "Find exciting trips and destinations that match your interests."
onboarding.slide2Title = "Travel With Like-Minded People"
onboarding.slide2Desc = "Connect with people who are looking for the same adventure."
onboarding.slide3Title = "Plan & Create Trips"
onboarding.slide3Desc = "Create your own trip, invite others, and build your travel crew."
onboarding.slide4Title = "Make Memories Together"
onboarding.slide4Desc = "Join trips, share experiences, comment, and connect with your travel community."

login.brand = "Travel & Social Meetup"
login.heading = "Welcome Back 👋"
login.subheading = "Log in to find your next trip and your next travel crew."
login.logIn = "Log In"
login.continueWithGoogle = "Continue with Google"
login.googleNotConfigured = "Google sign-in isn't configured yet."
login.createAccount = "New here? Create an account"
login.phoneLogin = "Log in with phone number"
login.version = "Version {version}"

register.brand = "Travel & Social Meetup"
register.heading = "Join the Adventure 🌍"
register.subheading = "Create an account to find trips and travel buddies."
register.passwordHint = "Password (min 8 characters)"
register.signUp = "Sign Up"
register.haveAccount = "Already have an account? Log in"

phoneLogin.title = "Log in with phone"
phoneLogin.phoneStepSubtitle = "We'll text you a one-time code."
phoneLogin.phoneNumber = "Phone number"
phoneLogin.sendCode = "Send code"
phoneLogin.codeStepSubtitle = "Enter the 6-digit code sent to {phone}."
phoneLogin.code = "Code"
phoneLogin.verify = "Verify"
phoneLogin.resendCode = "Resend code"
phoneLogin.nameStepSubtitle = "This number is new to us — what's your name?"
phoneLogin.backToLogin = "Back to login"
```

`{version}` and `{phone}` are simple placeholders — `t()` stays a plain
lookup (no interpolation engine); call sites do
`t("login.version").replace("{version}", APP_VERSION)` the same way the
codebase already does manual string composition elsewhere. This is the one
place Option A (custom, no library) costs a little convenience compared to
i18next's built-in interpolation — acceptable for two call sites.

### Screens updated

Each screen replaces its literal strings with `t("...")` calls via
`const { t } = useLanguage()`, and gets a `<LanguageSelector />` added at
the placement described above. No layout, logic, validation, navigation,
or API-call changes — this is a string-source swap plus one new component,
matching every prior "UI-only" redesign this session.

### Error handling

- Unsupported/corrupted `AsyncStorage` value on load → the `some()` check
  ignores it and stays on the `"en"` default (no crash).
- `AsyncStorage.setItem` failure on selection → swallowed (`.catch(() => {})`);
  the in-memory language still updates for the current session, matching
  how this codebase already treats storage as best-effort persistence
  elsewhere.
- Missing translation key → falls back to English, then the raw key —
  never blank, never a crash.

### Testing

No test framework exists in this repo (verified in earlier work this
session). Verification is:
- `tsc --noEmit` in `mobile/` for type correctness.
- Manual exercise: switch language on each of the 5 screens, confirm the
  visible strings change and the choice persists across an app reload
  (Fast Refresh / re-open).
- Manual exercise of the existing English flows (login, register, phone
  OTP) to confirm no functional regression.

## Rollout

1. Implementation per this design.
2. `tsc --noEmit` clean, web bundle compiles.
3. User manually verifies all 5 languages render correctly on-device and
   on web, and flags any translation that reads oddly for a native
   speaker to refine later.
