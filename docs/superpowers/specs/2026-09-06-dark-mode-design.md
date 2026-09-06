# Dark Mode / Light Mode Theme System — Design Spec

**Status:** Approved for implementation
**Scope:** Mobile app (Expo, React Native + React Native Web — this single codebase serves both "mobile" and "web" builds; there is no separate web project)

## Problem

Triply has no theme system. Colors are hardcoded as plain JS constants in
`mobile/src/theme/tokens.ts` (`COLORS`, `RADIUS`, `SHADOW`, `TYPE`,
`GRADIENT_PRIMARY`) and imported directly by ~32 screens/components. There is
no dark mode, no user preference, and no mechanism to change colors at
runtime (a `StyleSheet.create` object is evaluated once at import time, so
mutating `COLORS` would not update already-mounted styles).

## Goals

- Light / Dark / System Default appearance options, default **System Default**
  for new users.
- Live system-theme detection (native + web), reacting immediately if the OS
  preference changes while "System Default" is selected.
- Preference persists across app restarts.
- Theme switch applies instantly, no reload.
- A proper navy/charcoal dark palette — not inverted colors — that keeps the
  Triply blue→teal gradient brand identity.
- Applied consistently across every screen listed in the request (Welcome,
  Login, Sign Up, Onboarding, Discover + hero carousel, filters/chips, trip
  cards, Trip Details, Create/Edit Trip, Profile, Edit Profile, Group Chat +
  wallpaper, Comments, Notifications, Settings, profile popup, confirmation
  dialogs, bottom nav, headers, loading/empty states).
- One centralized token system — no second, competing theme mechanism.

## Non-goals

- No redesign of layout, spacing, or component structure.
- No per-screen custom themes — one global light palette, one global dark
  palette.
- No backend changes — preference is device-local (`AsyncStorage`), not
  synced to the user's account.

## Architecture

### 1. Palettes (`mobile/src/theme/palettes.ts`, new)

Two palettes, `light` and `dark`, each implementing the same `Palette` shape
covering every color key currently in `COLORS` plus new keys needed for dark
surface elevation:

```ts
export interface Palette {
  ink: string;          // primary text
  muted: string;        // secondary text
  mutedLight: string;   // tertiary/placeholder text
  border: string;
  divider: string;
  fieldBg: string;       // input/page background
  surface: string;       // base screen background
  surfaceElevated: string; // cards/inputs/dialogs (one step lighter than surface in dark mode)
  cardBg: string;
  cardBorder: string;
  primary: string;       // brand teal accent — unchanged both themes
  primaryMuted: string;  // low-opacity primary tint (chip/badge backgrounds)
  danger: string;
  dangerBg: string;
  dangerBorderLight: string;
  successBg: string;
  successBorderLight: string;
  warningBg: string;
  warningText: string;
  white: string;         // literal white — used sparingly (e.g. text on solid-primary buttons), same in both themes
  overlay: string;        // modal/sheet scrim
  iconMuted: string;
  statusBarStyle: "light" | "dark";
  navBarBg: string;       // bottom tab bar / header background
}
```

`light` = today's exact `COLORS` values (zero visual change). `dark` values:

| Key | Value | Notes |
|---|---|---|
| surface | `#0b1120` | base app background, navy not black |
| surfaceElevated | `#141c2e` | cards, inputs, dialogs |
| cardBg | `#141c2e` | |
| cardBorder | `rgba(255,255,255,0.08)` | |
| fieldBg | `#0f1626` | |
| border | `rgba(255,255,255,0.10)` | |
| divider | `rgba(255,255,255,0.08)` | |
| ink | `#e6ebf5` | primary text |
| muted | `#94a3b8` | unchanged — already works on dark |
| mutedLight | `#64748b` | |
| primary | `#14b8a6` | slightly brighter teal for AA contrast on navy |
| primaryMuted | `rgba(20,184,166,0.16)` | |
| danger | `#f87171` | |
| dangerBg | `rgba(248,113,113,0.12)` | |
| dangerBorderLight | `rgba(248,113,113,0.3)` | |
| successBg | `rgba(16,185,129,0.14)` | |
| successBorderLight | `rgba(16,185,129,0.35)` | |
| warningBg | `rgba(250,204,21,0.14)` | |
| warningText | `#facc15` | |
| white | `#ffffff` | kept literal — used for text on solid gradient/primary surfaces in both themes |
| overlay | `rgba(0,0,0,0.6)` | |
| iconMuted | `#7c8aa5` | |
| statusBarStyle | `"light"` | |
| navBarBg | `#0f1626` | |

`RADIUS`, `SHADOW` (structural), `TYPE` (font-size/weight), `GRADIENT_PRIMARY`
stay in `tokens.ts` unchanged — they are not colors that need to flip (shadow
color on dark surfaces is adjusted to black-on-navy inline where a component
uses `SHADOW.card`, by overriding `shadowOpacity`/`shadowColor` per theme only
where visibly necessary, e.g. cards on a dark background use a lower
`shadowOpacity`).

### 2. ThemeContext (`mobile/src/theme/ThemeContext.tsx`, new)

Mirrors `LanguageContext.tsx` exactly:

```ts
type ThemePreference = "light" | "dark" | "system";

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: "light" | "dark";       // resolved value actually applied
  colors: Palette;
  setPreference: (p: ThemePreference) => void;
}
```

- Reads `AsyncStorage` key `"app_theme"` on mount; defaults to `"system"` if
  unset or invalid.
- Reads `Appearance.getColorScheme()` for the initial system value; when
  `preference === "system"`, subscribes via `Appearance.addChangeListener` and
  updates `scheme` live.
- `setPreference` updates state and writes to `AsyncStorage` (fire-and-forget,
  matching `LanguageContext`'s error-swallowing pattern).
- `useTheme()` hook throws if used outside the provider (same pattern as
  `useLanguage`).

### 3. Consumption pattern

Existing code does `import { COLORS } from "../theme/tokens"` and references
`COLORS.x` inside a module-level `StyleSheet.create`. Since that call runs
once at import time, colors can't live there anymore. The conversion per
file:

- Structural `StyleSheet.create` stays, minus any `backgroundColor`,
  `color`, `borderColor`, `shadowColor` (color) properties — those move to
  inline styles.
- Component adds `const { colors } = useTheme();` and applies color props
  inline: `style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}`.
- Where a component builds several color-dependent values used in many
  places (e.g. `ProfileScreen`'s many `COLORS.ink` references), a
  `useMemo(() => StyleSheet.create({...}), [colors])` dynamic stylesheet is
  used instead of scattering inline objects, to keep JSX readable — used
  when a screen has more than ~6 color references.
- Shared themed primitives (`components/theme/Card.tsx`, `PrimaryButton.tsx`,
  `IconInput.tsx`, `SelectableChip.tsx`, `GradientBackground.tsx`,
  `Skeleton.tsx`) are converted first since every screen depends on them.

### 4. Navigation chrome

`App.tsx` wraps `NavigationContainer` with a `theme` prop built from
`@react-navigation/native`'s `DefaultTheme`/`DarkTheme`, overriding `colors.background`,
`colors.card`, `colors.text`, `colors.border` from the active palette — this
repaints native stack headers automatically. `AppTabs.tsx`'s
`tabBarStyle`/`tabBarActiveTintColor`/`tabBarInactiveTintColor` read from
`useTheme()` instead of the current hardcoded hex values. `StatusBar` in
`App.tsx` uses `colors.statusBarStyle` instead of `"auto"`.

### 5. Settings screen (`mobile/src/screens/SettingsScreen.tsx`, new)

New screen, added to `AppNavigator` (`AppStackParamList.Settings: undefined`).
Single "Appearance" section with three rows (☀️ Light / 🌙 Dark / 🌓 System
Default), each a tappable row showing a checkmark/radio state on the current
`preference`. Calls `setPreference` directly — takes effect immediately,
screen doesn't need to navigate away.

Entry point: `ProfileMenu.tsx` (the avatar popup) gains a "Settings" row
between "View Profile" and "Logout" — closing a gap from the earlier
profile-menu work, which only implemented View Profile/Logout because
Settings didn't exist yet.

### 6. Chat wallpaper

`ChatWallpaper.tsx` gets a dark variant: the icon-grid `color`s (currently
literal `TEAL`/`BLUE`) and wash opacity read from `useTheme()` — in dark mode
the wash sits on the navy background at a slightly higher opacity so the
pattern stays visible without looking washed out.

## Rollout batches (implementation order)

1. Core system: `palettes.ts`, `ThemeContext.tsx`, wire `ThemeProvider` into
   `App.tsx` (alongside `LanguageProvider`), navigation theme + status bar.
2. Shared primitives: `components/theme/*.tsx` (Card, PrimaryButton,
   IconInput, SelectableChip, GradientBackground, Skeleton), `TripCard.tsx`,
   `TripCardSkeleton.tsx`.
3. Auth flow: Welcome, Login, Register, PhoneLogin, Onboarding, GoogleSignInButton(.web).
4. Discover + trips: DiscoverScreen, DiscoverHeroCarousel, MyTripsScreen,
   TripDetailScreen, CreateTripScreen, TripDateFields(.web).
5. Profile: ProfileScreen, EditProfileScreen, UserProfileScreen, ProfileMenu
   (+ Settings row), new SettingsScreen.
6. Chat + notifications: GroupChatScreen, ChatWallpaper, AttachmentSheet,
   ReactionPickerModal, GroupMembersModal, SeenByModal, NotificationsScreen,
   JoinRequestsInboxScreen, AssistantScreen.
7. Nav chrome polish pass: AppTabs, AppNavigator header options, any
   remaining literal hex colors caught by a final repo-wide grep for hex
   literals outside `palettes.ts`.

Each batch: convert files, `npx tsc --noEmit`, manual check on a throwaway
Expo web port in both themes, commit.

## Testing

- Toggle Light → Dark → System in Settings; confirm instant repaint, no
  reload.
- Force-close/reopen (or reload the web build) and confirm the chosen
  preference persisted.
- With preference on System Default, flip the OS/browser theme and confirm
  the app follows live.
- Walk every listed screen in both Light and Dark, checking for: white
  backgrounds that should be navy, low-contrast/invisible text, icons that
  don't adapt, dialogs/sheets that stay light.
- `npx tsc --noEmit` in `mobile` after each batch.
- Test on the live Expo Go mobile session and on a throwaway local web port
  (never the live 8081 tunnel).

## Open risk

Converting ~32 files is mechanical but large. A follow-up grep for stray hex
literals (`#[0-9a-fA-F]{3,8}`) outside `palettes.ts`/`GradientBackground`
after batch 7 catches anything missed by the batch pass.
