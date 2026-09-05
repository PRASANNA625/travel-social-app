# Triply Design System Phase 3a (Auth & Onboarding) — Design Spec

## Goal

Bring Welcome, Register, Onboarding, and Phone Login onto the same visual
language as the rest of the app (tokens.ts + `components/theme/`), and fix
one real visual bug found during an app-wide consistency audit: Welcome's
hero gradient renders different colors than every other branded screen,
including the Login screen it leads into.

## Audit findings that shape this spec

- **Login and Register are already pixel-identical** to each other, and
  already use the exact `GRADIENT_PRIMARY` colors/locations, the exact
  `Card` component's colors/radius/shadow, and the exact `IconInput`
  pattern — just duplicated as inline literals instead of imported. This
  phase de-duplicates Register onto the shared tokens/components with
  **zero visual change** (the values already match exactly).
- **Login/Register's full-screen decorative treatment — a raw
  `LinearGradient` plus two decorative circles plus a large low-opacity
  compass — is a different pattern from the shared `GradientBackground`
  component.** `GradientBackground` was built for a "hero band" (a short
  strip at the top of a scrolling screen — Create Trip, Discover,
  Notifications) and always renders its own compass at a fixed
  size/position/opacity tuned for that band. Wrapping a full-screen auth
  gradient in it would replace Login/Register's larger, differently
  positioned compass and drop their two decorative circles entirely — a
  real visual regression, not a safe migration. **This spec does NOT
  wrap Welcome/Register/Phone Login's full-screen gradient in
  `GradientBackground`** — it keeps the existing raw
  `LinearGradient`/circle/compass markup (already shared verbatim between
  Login and Register) and only swaps the gradient's color values to the
  shared `GRADIENT_PRIMARY` export, plus componentizes the card/field/
  button content inside it.
- **Onboarding's 4 slide gradients are deliberately different from each
  other** (`["#0c4a6e","#0f766e"]`, `["#1d4ed8","#0f766e"]`,
  `["#0f766e","#134e4a"]`, `["#0f766e","#0c4a6e"]`) — a carousel-variety
  choice, not a bug. All four colors are drawn from the same brand
  palette (they're the exact colors used in `GRADIENT_PRIMARY` and
  Welcome's current gradient). **This spec keeps all 4 pairs as local
  literals** and only token-izes the exact-match non-gradient values
  (white, ink, primary teal) elsewhere in the file, following the same
  substitution rule Phase 2 used.
- **Phone Login is the one screen with no gradient branding at all** —
  plain white background, generic `#ddd`-bordered inputs, a bare teal
  button. It's reached directly from Login's "Log in with phone" link, so
  it should look like Login/Register's sibling, not a separate app.

## Non-goals

- No new shared component extracted for the Login/Register/Welcome/Phone
  Login full-screen gradient pattern (a real, deferred de-duplication
  opportunity — noted here, not built now, to keep this phase's scope to
  what was asked).
- No change to Onboarding's per-slide gradient color choices.
- No behavior changes anywhere: every `useState`, validation rule,
  mutation call, and navigation target in all 4 files stays exactly as it
  is. This is a visual/structural restyle on top of already-shipped auth
  logic.

## 1. `WelcomeScreen.tsx` — fix the gradient mismatch

Replace the hardcoded gradient with the shared export:

```tsx
import { GRADIENT_PRIMARY } from "../theme/tokens";
// ...
<LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>
```

(Previously `colors={["#0c4a6e", "#0f766e", "#134e4a"]}` with no
`locations` prop.) Nothing else in this file changes — the entrance
animation, decorative circles, compass, and all `Animated.Value`s from
the prior work in this file are untouched.

## 2. `RegisterScreen.tsx` — de-duplicate onto shared tokens/components

- Keep the raw `<LinearGradient>` + `decorCircleTop`/`decorCircleBottom`
  + compass `<MaterialCommunityIcons>` structure exactly as it is today
  (per the audit finding above) — only replace the literal color array
  with `GRADIENT_PRIMARY.colors`/`GRADIENT_PRIMARY.locations` (identical
  values, so this is a no-op visually).
- Replace the `<View style={styles.card}>` wrapper with `<Card
  style={styles.card}>` from `components/theme/Card`, keeping
  `styles.card` only for the properties `Card` doesn't already set
  (nothing — `Card`'s own `backgroundColor`/`borderRadius`/`borderWidth`/
  `borderColor`/`padding`/`gap`/shadow already match Register's `card`
  style exactly field-for-field, so `style={styles.card}` becomes
  unnecessary and the prop is dropped; `card` style block is deleted).
- Replace each `fieldWrap`/`fieldInput` pair with `IconInput`:
  ```tsx
  <IconInput
    icon="account-outline"
    placeholder={t("common.fullName")}
    value={name}
    onChangeText={setName}
  />
  <IconInput
    icon="email-outline"
    placeholder={t("common.email")}
    autoCapitalize="none"
    keyboardType="email-address"
    value={email}
    onChangeText={setEmail}
  />
  <IconInput
    icon="lock-outline"
    placeholder={t("register.passwordHint")}
    secureTextEntry={!showPassword}
    value={password}
    onChangeText={setPassword}
    rightElement={
      <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
        <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color={COLORS.muted} />
      </TouchableOpacity>
    }
  />
  ```
  (`IconInput`'s own icon color is `COLORS.muted`, matching the current
  `#64748b` exactly; its placeholder color is `COLORS.mutedLight`,
  matching `#94a3b8` exactly.)
- Replace the `submitButton` `TouchableOpacity` with:
  ```tsx
  <PrimaryButton
    label={t("register.signUp")}
    onPress={onSubmit}
    disabled={register.isPending}
    loading={register.isPending}
    icon="arrow-right"
  />
  ```
  (`PrimaryButton`'s own style already matches `submitButton`'s
  `backgroundColor`/`borderRadius`/shadow exactly — `SHADOW.button` is
  byte-identical to Register's current inline shadow values.)
- `brandRow`, `logoBadge`, `brandName`, `heading`, `subheading`,
  `secondaryLink`, `languageSelector`, and all layout/positioning styles
  (`decorCircle*`, `scrollContent`, `page`/`pageWeb`) are unchanged.
- `fieldWrap`, `fieldInput`, `submitButton`, `submitButtonText`, and
  `card` style entries are deleted from the stylesheet (no longer
  referenced).

## 3. `OnboardingScreen.tsx` — token-ize exact matches only

Import `COLORS` and `RADIUS` from `theme/tokens`. Substitute only exact
value matches, per Phase 2's rule (a literal with no exact token match
stays a literal):

- `title`/`dot`/`dotActive`/`nextButton`'s `#fff` → `COLORS.white`
- `nextButton`'s `shadowColor: "#0f172a"` → `COLORS.ink`
- `nextButton`'s `borderRadius: 999` → `RADIUS.pill`
- `nextButtonText`'s `color: "#0f766e"` → `COLORS.primary`
- Left untouched (no exact token match): `iconBadge`'s
  `rgba(255,255,255,0.14)`/`rgba(255,255,255,0.24)`, `description`/
  `skipText`'s `rgba(255,255,255,0.85)`, `dot`'s
  `rgba(255,255,255,0.35)`.
- **Left untouched by explicit design choice** (not a token-match
  question): all 4 `SLIDES[].colors` gradient pairs — these stay exactly
  as they are today.

No JSX structure, state, or navigation changes.

## 4. `PhoneLoginScreen.tsx` — full redesign to match Login/Register

Rebuild the screen using the same full-screen pattern as Login/Register
(raw `LinearGradient` with `GRADIENT_PRIMARY` colors + two decorative
circles + compass, copied verbatim from Register's exact values for
family consistency), with the 3-step flow (`phone` / `code` / `name`)
living inside a `Card`:

- **Background**: `<LinearGradient colors={GRADIENT_PRIMARY.colors} locations={GRADIENT_PRIMARY.locations} style={styles.flex}>` wrapping the same `decorCircleTop`/`decorCircleBottom`/compass markup as Register (identical style values — `decorCircleTop: {width:240,height:240,top:-70,right:-60}`, `decorCircleBottom: {width:300,height:300,bottom:-100,left:-90}`, compass `size={200}`, `color="rgba(255,255,255,0.05)"`, `top:"36%", left:-44, rotate:"12deg"`).
- **Layout**: `LanguageSelector` top-right (as today, repositioned to `insets.top + 16` like Register/Login), `KeyboardAvoidingView` + `ScrollView` wrapping a centered `page`/`pageWeb` column (max width 420 on web, same as Register).
- **Brand row**: same logo badge + brand name pattern as Register —
  `require("../../assets/icon.png")` + `<Text>{t("phoneLogin.brand")}</Text>`.
  `phoneLogin.brand` is a **new** i18n key, added to all 5 language files
  (`en.json`, `hi.json`, `kn.json`, `ta.json`, `te.json`) with the value
  `"Triply"` — the exact same value `welcome.brand`/`login.brand`/
  `register.brand` already have in every one of those files. This follows
  the existing pattern instead of hardcoding a literal string, which
  would be the one inconsistency this spec would otherwise introduce.
- **Card**: wraps the step content. `<Text style={styles.heading}>{t("phoneLogin.title")}</Text>` stays as the heading (existing i18n key, unchanged copy).
- **Step "phone"**: subtitle text (existing `t("phoneLogin.phoneStepSubtitle")`), `<IconInput icon="cellphone" placeholder={t("phoneLogin.phoneNumber")} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />`, `<PrimaryButton label={t("phoneLogin.sendCode")} onPress={onSendCode} disabled={isPending} loading={isPending} icon="arrow-right" />`.
- **Step "code"**: subtitle (existing interpolated `t("phoneLogin.codeStepSubtitle")`), `<IconInput icon="message-text-outline" placeholder={t("phoneLogin.code")} keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />`, `<PrimaryButton label={t("phoneLogin.verify")} onPress={() => onVerify()} disabled={isPending} loading={isPending} icon="arrow-right" />`, then a `secondaryLink`-style `TouchableOpacity` (same pattern as Register's `secondaryLink`/`secondaryLinkText`) with icon `"refresh"` and label `t("phoneLogin.resendCode")`, `onPress={onSendCode}`.
- **Step "name"**: subtitle (existing `t("phoneLogin.nameStepSubtitle")`), `<IconInput icon="account-outline" placeholder={t("common.fullName")} value={name} onChangeText={setName} />`, `<PrimaryButton label={t("phoneLogin.verify")} onPress={onSubmitName} disabled={isPending} loading={isPending} icon="arrow-right" />`.
- **Footer**: `secondaryLink`-style `TouchableOpacity` with icon `"arrow-left"` and label `t("phoneLogin.backToLogin")`, `onPress={() => navigation.goBack()}` — same visual treatment as Register's "already have an account" link.
- All handler logic (`onSendCode`, `onVerify`, `onSubmitName`, the `PHONE_REGEX`/`NAME_REQUIRED_CODE` constants, `sendOtp`/`verifyOtp` mutation wiring, the `step` state machine) is unchanged — this is a render-layer rewrite only, identical to how Create Trip's Phase 1 redesign preserved 100% of its logic.
- Old `styles` (`container`, `title`, `subtitle`, `input`, `button`, `buttonText`, `link`) are replaced by the shared-component-driven styles described above (mirroring Register's stylesheet shape) — `container`'s plain white background is gone, replaced by the gradient.

## Testing / verification

Same as every prior phase: no test framework exists in this repo.
Verification is `npx tsc --noEmit` (mobile) plus a manual diff/code-trace
confirming every piece of state, every mutation call, and every
navigation target in all 4 files is unchanged — only render/style code
differs. A temporary `expo start --web` bundle-compile check (free port,
killed after, never touching the live tunnel on 8081) is the fallback
smoke check for the web platform, consistent with how every prior phase
in this session verified UI-only changes.
