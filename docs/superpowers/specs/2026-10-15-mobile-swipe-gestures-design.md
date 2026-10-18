# Swipe gestures for the website on phones

Date: 2026-10-15
Status: design approved in chat, spec awaiting review

## Goal

People using Triply in a phone browser (https://triply-pi-three.vercel.app in Safari or Chrome) can move around and act with swipes, the way they would in a native app:

1. Swipe back to the previous screen.
2. Swipe between the bottom tabs.
3. Swipe the Discover hero banner, with smooth snapping on trip photos.
4. Swipe list rows to act on them.

**Success:** each gesture works on a 390px-wide touch screen, every swipe action can still be done by tapping, horizontal scrollers (chip rows, photo strips, maps) still scroll, and desktop (≥1024px) behaves exactly as today.

**Out of scope:**
- The installed Expo app. The code stays cross-platform, but native gestures are not tuned or tested.
- Deleting notifications. The backend has no endpoint for it.
- New gesture or animation libraries.
- Opening a deep link while signed out and landing on it after login. Signed-out users get the login screen, then Discover.

## Approach

Use React Native's built-in `PanResponder` and `Animated`, which `react-native-web` maps to touch and pointer events, behind one small shared hook. No new dependencies; the hero carousel already uses `Animated` the same way.

We rejected `react-native-gesture-handler` and `react-native-reanimated`: roughly 150KB+ more on the web bundle and an extra Babel plugin, with no benefit while the focus is the website.

## 1. Swipe back: browser history through React Navigation linking

On iOS Safari and Android Chrome, swiping from the screen edge is the browser's own Back. Today screen changes don't create history entries, so that swipe leaves the app. Rather than build a custom edge swipe that would fight the browser's, give every screen a URL.

- `App.tsx`: pass a `linking` config to `NavigationContainer`, defined in a new `src/navigation/linking.ts`.
- URL map. Every param in the URL is a string; the optional ones stay as query strings.

  | Screen | Path |
  |---|---|
  | Tabs > Discover | `/` |
  | Tabs > MyTrips | `/my-trips` |
  | Tabs > Meetups | `/meetups` |
  | Tabs > Messages | `/messages` |
  | Tabs > Notifications | `/notifications` |
  | Tabs > Profile | `/profile` |
  | TripDetail | `/trip/:tripId` |
  | CreateTrip | `/create-trip` (`?tripId=` when editing, `?category=SPORTS` for activities) |
  | JoinRequestsInbox | `/trip/:tripId/requests` |
  | GroupChat | `/chat/:groupId` |
  | EditProfile | `/profile/edit` |
  | UserProfile | `/user/:userId` |
  | Assistant | `/assistant` |
  | Settings | `/settings` |
  | TravelBuddies | `/buddies` |
  | ConnectionRequests | `/buddies/requests` |
  | BlockedUsers | `/settings/blocked` |
  | Admin | `/admin` |
  | Auth: Welcome / Login / Register / Onboarding | `/welcome`, `/login`, `/register`, `/onboarding` |

- **GroupChat** currently needs `tripTitle` in its params. Make `tripTitle` optional. When it's missing (a reloaded or shared URL), the screen takes the title from the group it already loads.
- **Hero CTA paths** (`/sports`, `/create-trip`, `/create-activity`, `/meetups`, `/my-trips`): `openHeroCta` keeps its own mapping. Check that it still navigates the same way once linking is on; keep the stored values unchanged.
- **Vercel:** the existing rewrite of every path to `/index.html` already serves deep links.
- **Navigation:** in-app back buttons keep calling `navigation.goBack()`, which with linking also moves browser history. A reload on any URL restores that screen. Screens whose data needs auth already wait for the session.

## 2. Swipe between tabs

- New hook `src/hooks/useSwipe.ts`. It wraps `PanResponder` and reports `onSwipeLeft` and `onSwipeRight`.
- **Thresholds:** horizontal travel ≥ 70px and ≥ 2× the vertical travel, or a fling (velocity ≥ 0.5 px/ms with ≥ 30px travel).
- **Claims the gesture only once it is clearly horizontal,** using `onMoveShouldSetPanResponder`. Vertical scrolling is never blocked.
- **Ignored when the touch starts:**
  - within 24px of the left or right screen edge (left for the browser's Back, right for symmetry), or
  - inside a horizontally scrollable element. On web, the hook walks up from the touch target looking for an element whose `scrollWidth > clientWidth` with `overflow-x` set to auto or scroll. This covers chip rows, photo strips and carousels.
  - inside an element with `dataSet={{ noSwipe: true }}`, for maps, the hero banner (which has its own swipe), and text inputs.
- `AppTabs.tsx`: when `useResponsiveLayout().isDesktop` is false, wrap each tab screen in a `SwipeTabs` wrapper. It navigates to the next or previous tab in this order: Discover, MyTrips, Meetups, Messages, Notifications, Profile. There's no wrap-around at either end.
- **Motion:** the content follows the finger slightly (up to 40px, damped), then springs back while the tab switch happens. The switch itself uses the tab navigator's normal behaviour.

## 3. Hero banner and trip photos

- **HeroCarousel:** add `useSwipe` on the banner (phones and tablets; harmless on desktop touch screens).
  - Swipe left shows the next slide; swipe right shows the previous one, wrapping around.
  - A swipe restarts the auto-advance timer. `useHeroCarousel` gains `goTo(index)` and resets its timeout on every index change, which it already does through its `index` dependency.
  - The existing fade or slide transition runs for swipes too.
  - With a single slide, the swipe does nothing.
- **Trip photos (TripDetailScreen):** already a horizontal paging `FlatList`, so touch scrolling works. On web, add CSS scroll snapping (`scrollSnapType: "x mandatory"` on the list and `scrollSnapAlign: "start"` on each photo) so a partial swipe settles on a whole photo. Keep the dot indicator in sync, as it is today through `onMomentumScrollEnd`. On web, also derive the index from `onScroll`, because momentum events don't fire there.

## 4. Swipe actions on list rows

- New component `src/components/SwipeableRow.tsx`.
  - **Props:** `leftAction` and `rightAction`, each `{ label, icon, color, onTrigger, confirm?: string }`, plus `children`.
  - Dragging reveals the coloured action behind the row. Releasing past 35% of the row width (or with a fling) triggers the action. Otherwise the row springs back.
  - With `confirm` set, it asks through `utils/alert` (web-safe) before triggering, and springs back on cancel.
  - Uses `useSwipe`'s horizontal detection, so the list's vertical scrolling is unaffected.
  - **Accessibility:** the row exposes `accessibilityActions` with the same actions, so they aren't swipe-only.
- **Uses:**
  - **NotificationsScreen** unread rows: swipe left to **Mark read** (`useMarkNotificationRead`). Already-read rows have no action.
  - **MessagesScreen** chat rows that have unread messages: swipe left to **Mark read** (`useMarkGroupNotificationsRead(groupId)`).
  - **JoinRequestsInboxScreen** pending requests: swipe right to **Approve** (green); swipe left to **Reject** (red, with the confirmation "Reject this request?"). Both use `useRespondToJoinRequest`.
- Existing tap buttons stay as they are.

## 5. Desktop and other constraints

- Phone-only behaviour (tab swipe) checks `useResponsiveLayout().isDesktop`, the same helper `AppTabs` already uses. Everything else is touch-driven, so a mouse never triggers it.
- No visual change at rest. Nothing new is drawn until a swipe starts.
- Dark mode: action colours come from the palette (`colors.primary` for Mark read, `colors.successText` for Approve, `colors.danger` for Reject).

## Testing

Browser tests (Playwright with Chrome, touch emulation, 390×844 at 3x pixel density), against the local backend and Expo web:

1. **Linking:**
   - Opening a trip changes the URL to `/trip/:id`.
   - `page.goBack()` returns to Discover.
   - A reload on `/trip/:id` and on `/chat/:id` restores the screen, including the chat title.
   - A hero CTA still opens its destination.
2. **Tab swipe:**
   - Swiping left on My Trips opens Meetups; swiping right returns.
   - A swipe that starts on the Discover category chips scrolls the chips and stays on Discover.
   - A vertical scroll doesn't switch tabs.
   - At 1440px nothing happens.
3. **Hero:**
   - With 2+ slides, swiping left advances and swiping right goes back.
   - The timer restarts after a swipe.
4. **Trip photos:** a 40% drag settles on a whole photo, and the dots match.
5. **Rows:**
   - Swiping an unread notification marks it read (via the API).
   - Swiping a chat marks it read.
   - Swiping a request right approves it; swiping left asks for confirmation, and Cancel leaves it pending.
   - The tap buttons still work.
6. **Regression:** the existing suites still pass (`nearme-ui`, `sports-ui`, `hero-ui`, `ct-e2e`, `interest-refresh`), and `tsc` is clean.

Then check by hand on an iPhone in Safari after deploying to Vercel.
