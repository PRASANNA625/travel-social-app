# Triply Design System Phase 3c (Chat & Join Requests) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Token-ize `GroupChatScreen.tsx`'s colors onto the shared design system (no component swaps) and restyle `JoinRequestsInboxScreen.tsx` onto token-based list cards, completing the design system rollout across all 7 originally-audited screens with zero behavior or data changes.

**Architecture:** Both tasks are render-layer-only rewrites of a single existing screen file each. `GroupChatScreen` is a pure color-literal-to-token substitution — its chat-specific UI (bubbles, icon-only buttons, icon-less composer) doesn't match the shape of any shared component, so none are introduced. `JoinRequestsInboxScreen` is a genuine restyle: its flat, under-styled cards become Notifications-style list items, its emoji status text becomes an icon+color pill reusing Notifications' exact `JOIN_REQUEST_APPROVED`/`JOIN_REQUEST_REJECTED` icon/color choices, and its bare spinner becomes a `Skeleton`-based loading state.

**Tech Stack:** React Native (Expo), TypeScript, `@expo/vector-icons` (MaterialCommunityIcons), React Query (already-existing hooks, unchanged).

**Spec:** docs/superpowers/specs/2026-09-05-design-system-phase3c-chat-and-requests-design.md

## Global Constraints

- Zero behavior/data changes: every `useState`, mutation call (`sendMessage`, `uploadImage.mutateAsync`, `respond.mutate`), and navigation target in both files stays exactly as it is.
- Only exact-value token matches are substituted (e.g. `#0f766e` → `COLORS.primary`, `#ecfdf5` → `COLORS.successBg`). A literal with no exact match in `theme/tokens.ts` stays a literal — do not "round" a close-but-different color or radius to the nearest token.
- `GroupChatScreen.tsx` gets NO component swaps — `IconInput`/`PrimaryButton`/`Card` do not fit its chat-specific UI shapes (icon-less composer, icon-only buttons, mixed-width preview-bar row). This task is colors-only.
- `JoinRequestsInboxScreen.tsx`'s request cards use the Notifications-style list-item pattern (`COLORS.white` / `RADIUS.field` / `COLORS.border`, no heavy shadow) — NOT the shared `Card` component, which is tuned for grouped sections, not repeating list items.
- Approve/Reject stay as custom side-by-side buttons (no `PrimaryButton` — it has no danger variant, and adding one is out of scope).
- `GroupChatScreen`'s existing performance work (`optimizedImageUrl` calls, `Skeleton`-based loading block) must be preserved verbatim.
- `JoinRequestsInboxScreen`'s native stack header (`title: "Join Requests"` in `AppNavigator.tsx`) is untouched — no custom header is added.
- No test framework exists in this repo. Verification is `npx tsc --noEmit` (run from `mobile/`) for every task.

---

### Task 1: Token-ize GroupChatScreen.tsx's colors

**Files:**
- Modify: `mobile/src/screens/GroupChatScreen.tsx` (color-literal substitutions only — JSX structure, state, handlers, and the existing `Skeleton`/`optimizedImageUrl` usage are untouched)

**Interfaces:**
- Consumes: `COLORS` from `../theme/tokens` (new import — nothing else changes).
- Produces: nothing new — `GroupChatScreen` is a leaf screen component with no other file depending on its internals.

- [ ] **Step 1: Replace the full contents of `mobile/src/screens/GroupChatScreen.tsx`**

```tsx
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useGroup } from "../api/groups";
import { useLiveGroupChat, useMessageHistory, useUploadChatImage } from "../api/messages";
import type { ChatMessage } from "../types";
import { Alert } from "../utils/alert";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "GroupChat">;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function GroupChatScreen({ route, navigation }: Props) {
  const { groupId, tripTitle } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: group } = useGroup(groupId);
  const { data: history, isLoading } = useMessageHistory(groupId);
  const { messages, sendMessage } = useLiveGroupChat(groupId, history?.items ?? []);
  const uploadImage = useUploadChatImage();
  const [text, setText] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const onSend = () => {
    if (!text.trim()) return;
    sendMessage({ type: "TEXT", content: text.trim() });
    setText("");
  };

  const onOpenCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission needed", "Please allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    setPendingPhoto(result.assets[0]);
  };

  const onRetake = () => {
    setPendingPhoto(null);
    onOpenCamera();
  };

  const onConfirmSendPhoto = async () => {
    if (!pendingPhoto) return;
    setSendingPhoto(true);
    try {
      const url = await uploadImage.mutateAsync(pendingPhoto);
      sendMessage({ type: "IMAGE", mediaUrl: url });
      setPendingPhoto(null);
    } catch {
      Alert.alert("Couldn't send photo", "Please try again");
    } finally {
      setSendingPhoto(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === me?.id;
    return (
      <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
        {!isMine &&
          (item.sender.photoUrl ? (
            <Image source={{ uri: optimizedImageUrl(item.sender.photoUrl, 28) }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{item.sender.name.charAt(0).toUpperCase()}</Text>
            </View>
          ))}
        <View style={[styles.bubbleCol, isMine && styles.bubbleColMine]}>
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              item.type === "IMAGE" && styles.bubbleImageWrap,
            ]}
          >
            {!isMine && <Text style={styles.senderName}>{item.sender.name}</Text>}
            {item.type === "IMAGE" && item.mediaUrl ? (
              <Image source={{ uri: optimizedImageUrl(item.mediaUrl, 190) }} style={styles.messageImage} />
            ) : (
              <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
            )}
          </View>
          <Text style={[styles.timeText, isMine && styles.timeTextMine]}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tripTitle}
          </Text>
          {group && (
            <View style={styles.headerSubRow}>
              <MaterialCommunityIcons name="account-group-outline" size={12} color={COLORS.muted} />
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {group.members.length} member{group.members.length === 1 ? "" : "s"} ·{" "}
                {group.members.map((m) => m.user.name).join(", ")}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerButton} />
      </View>

      <View style={[styles.body, isWeb && styles.bodyWeb]}>
        {isLoading ? (
          <View style={styles.listContent}>
            <View style={[styles.bubbleRow]}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonBubble} />
            </View>
            <View style={[styles.bubbleRow, styles.bubbleRowMine]}>
              <Skeleton style={[styles.skeletonBubble, styles.skeletonBubbleMine]} />
            </View>
            <View style={[styles.bubbleRow]}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonBubble} />
            </View>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="chat-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyText}>No messages yet. Say hello to the group!</Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
          />
        )}

        {pendingPhoto ? (
          <View style={[styles.previewBar, { paddingBottom: insets.bottom + 12 }]}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.previewThumb} />
            <Text style={styles.previewLabel} numberOfLines={1}>
              Send this photo?
            </Text>
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewIconButton}
                onPress={() => setPendingPhoto(null)}
                disabled={sendingPhoto}
              >
                <MaterialCommunityIcons name="close" size={18} color={COLORS.danger} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewIconButton} onPress={onRetake} disabled={sendingPhoto}>
                <MaterialCommunityIcons name="camera-retake-outline" size={18} color="#334155" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendButton} onPress={onConfirmSendPhoto} disabled={sendingPhoto}>
                {sendingPhoto ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color={COLORS.white} />
                    <Text style={styles.previewSendText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
            <TouchableOpacity onPress={onOpenCamera} style={styles.attachButton}>
              <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message the group..."
              placeholderTextColor={COLORS.mutedLight}
              value={text}
              onChangeText={setText}
              onSubmitEditing={onSend}
              multiline
            />
            <TouchableOpacity onPress={onSend} style={styles.sendButton} disabled={!text.trim()}>
              <MaterialCommunityIcons name="send" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.fieldBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.fieldBg,
  },
  headerTextWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.ink },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, maxWidth: "100%" },
  headerSubtitle: { fontSize: 11.5, color: COLORS.muted, flexShrink: 1 },
  body: { flex: 1 },
  bodyWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 10 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: 13.5, color: COLORS.mutedLight, textAlign: "center" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMine: { justifyContent: "flex-end" },
  skeletonAvatar: { width: 28, height: 28, borderRadius: 14 },
  skeletonBubble: { width: "55%", height: 40, borderRadius: 16 },
  skeletonBubbleMine: { width: "40%" },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  bubbleCol: { maxWidth: "75%", alignItems: "flex-start" },
  bubbleColMine: { alignItems: "flex-end" },
  bubble: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleTheirs: {},
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleImageWrap: { padding: 4, overflow: "hidden" },
  senderName: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginBottom: 3 },
  messageText: { fontSize: 14, color: "#1e293b", lineHeight: 20 },
  messageTextMine: { color: COLORS.white },
  messageImage: { width: 190, height: 190, borderRadius: 12 },
  timeText: { fontSize: 10.5, color: COLORS.mutedLight, marginTop: 3, marginLeft: 4 },
  timeTextMine: { marginLeft: 0, marginRight: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
    maxHeight: 100,
    backgroundColor: COLORS.fieldBg,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBar: {
    padding: 14,
    gap: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  previewThumb: { width: "100%", height: 160, borderRadius: 14, backgroundColor: "#f1f5f9" },
  previewLabel: { fontSize: 13, color: "#334155", fontWeight: "600" },
  previewActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  previewIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  previewSendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  previewSendText: { color: COLORS.white, fontWeight: "700", fontSize: 14.5 },
});
```

Notes for the implementer:
- `flexScreen`'s background changes from the literal `"#f8fafc"` to `COLORS.fieldBg` — same value (`#f8fafc`), just token-ized; this is not a visual change.
- `#f1f5f9` (header/inputRow/previewBar top border, previewThumb placeholder bg), `#cbd5e1` (empty-state icon), `#334155` (camera-retake icon, previewLabel), and `#1e293b` (`messageText` — the received-message text color, distinct from `COLORS.ink`'s `#0f172a`) have **no exact match** anywhere in `theme/tokens.ts` — leave every one of these as a literal. Do not substitute a "close" token for any of them.
- `borderRadius: 20` (on `headerButton`, `attachButton`, `sendButton`, `input`) and `borderRadius: 14`/`16`/`12`/`4` elsewhere have no exact `RADIUS` match (`RADIUS.pill` is `999`, `RADIUS.field` is `14` — note `previewIconButton`'s `14` DOES exactly match `RADIUS.field`, so substitute that one; `RADIUS.chip` is `16` — `bubble`'s `16` and `skeletonBubble`'s `16` DO exactly match `RADIUS.chip`, substitute those too). Numeric radii with no match (`20`, `12`, `4`) stay as literals.
- Do not touch `Skeleton` usage, `optimizedImageUrl` calls, or any state/handler — this is colors (and the two radius matches just named) only.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/GroupChatScreen.tsx
git commit -m "Token-ize Group Chat screen colors onto shared design-system tokens"
```

---

### Task 2: Restyle JoinRequestsInboxScreen.tsx onto token-based list cards

**Files:**
- Modify: `mobile/src/screens/JoinRequestsInboxScreen.tsx` (full-file rewrite)

**Interfaces:**
- Consumes: `useJoinRequestsForTrip`, `useRespondToJoinRequest` from `../api/joinRequests` (unchanged); `JoinRequest` type from `../types` (unchanged); `Skeleton` from `../components/theme/Skeleton`; `COLORS`, `RADIUS` from `../theme/tokens`.
- Produces: nothing new — `JoinRequestsInboxScreen` is a leaf screen with no other file depending on its internals.

- [ ] **Step 1: Replace the full contents of `mobile/src/screens/JoinRequestsInboxScreen.tsx`**

```tsx
import type { ComponentProps } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useJoinRequestsForTrip, useRespondToJoinRequest } from "../api/joinRequests";
import type { JoinRequest } from "../types";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS, RADIUS } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "JoinRequestsInbox">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const RESOLVED_STATUS: Record<"APPROVED" | "REJECTED", { icon: IconName; bg: string; color: string; label: string }> = {
  APPROVED: { icon: "check-circle", bg: COLORS.successBg, color: COLORS.primary, label: "Approved" },
  REJECTED: { icon: "close-circle-outline", bg: COLORS.dangerBg, color: COLORS.danger, label: "Rejected" },
};

export function JoinRequestsInboxScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { data: requests, isLoading } = useJoinRequestsForTrip(tripId);
  const respond = useRespondToJoinRequest(tripId);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton style={styles.skeletonName} />
              <Skeleton style={styles.skeletonMeta} />
              <View style={styles.skeletonActionsRow}>
                <Skeleton style={styles.skeletonAction} />
                <Skeleton style={styles.skeletonAction} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={requests ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-clock-outline" size={40} color={COLORS.mutedLight} />
            <Text style={styles.empty}>No one has requested to join yet.</Text>
          </View>
        }
        renderItem={({ item }: { item: JoinRequest }) => (
          <View style={styles.card}>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { userId: item.userId })}>
              <Text style={styles.name}>{item.user?.name}</Text>
            </TouchableOpacity>
            {item.user?.location && <Text style={styles.meta}>📍 {item.user.location}</Text>}
            {item.user?.bio && <Text style={styles.meta}>{item.user.bio}</Text>}
            {item.message && <Text style={styles.message}>"{item.message}"</Text>}

            {item.status === "PENDING" ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approve]}
                  onPress={() => respond.mutate({ requestId: item.id, approve: true })}
                >
                  <Text style={styles.actionText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.reject]}
                  onPress={() => respond.mutate({ requestId: item.id, approve: false })}
                >
                  <Text style={styles.actionText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: RESOLVED_STATUS[item.status].bg }]}>
                <MaterialCommunityIcons
                  name={RESOLVED_STATUS[item.status].icon}
                  size={14}
                  color={RESOLVED_STATUS[item.status].color}
                />
                <Text style={[styles.statusLabel, { color: RESOLVED_STATUS[item.status].color }]}>
                  {RESOLVED_STATUS[item.status].label}
                </Text>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fieldBg },
  list: { padding: 12, gap: 12 },
  empty: { textAlign: "center", color: COLORS.mutedLight },
  emptyWrap: { alignItems: "center", gap: 10, marginTop: 60, paddingHorizontal: 32 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  name: { fontSize: 16, fontWeight: "700", color: COLORS.primary },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  message: { fontSize: 13, color: "#334155", marginTop: 6, fontStyle: "italic" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
  approve: { backgroundColor: COLORS.primary },
  reject: { backgroundColor: COLORS.danger },
  actionText: { color: COLORS.white, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  statusLabel: { fontSize: 12.5, fontWeight: "700" },
  skeletonCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  skeletonName: { height: 16, width: "50%" },
  skeletonMeta: { height: 12, width: "70%" },
  skeletonActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  skeletonAction: { flex: 1, height: 38, borderRadius: 8 },
});
```

Notes for the implementer:
- `RESOLVED_STATUS` only has `APPROVED`/`REJECTED` keys (not `PENDING`) — this is intentional and must type-check via TypeScript's control-flow narrowing: the `item.status === "PENDING" ? ... : ...` ternary narrows `item.status` to `"APPROVED" | "REJECTED"` inside the `else` branch, which is exactly `RESOLVED_STATUS`'s key type. If `npx tsc --noEmit` reports a type error here, the fix is a narrower type annotation on the destructured `item`, not widening `RESOLVED_STATUS`'s keys or adding a `PENDING` entry that's never used.
- The old `STATUS_LABEL` map (with emoji strings `"⏳ Pending"`/`"✅ Approved"`/`"❌ Rejected"`) is fully deleted — `PENDING`'s branch never read it anyway (it renders the action buttons instead), so nothing else needs to change.
- `list: { padding: 12, gap: 12 }` replaces per-card `marginBottom: 12` as the spacing mechanism between cards (matching `NotificationsScreen`'s `list: { ..., gap: 12 }` convention) — do not add `marginBottom` back onto `card`.
- `card`'s `borderRadius: RADIUS.field` (14) and `COLORS.border`/`COLORS.white` replace the old `12`/`"#eee"`/`"#fff"` — this is a deliberate restyle onto the Notifications list-item convention (per the spec), not a "nearest value" rounding; do not second-guess it back toward `12`/`"#eee"`.
- `actionButton`'s `borderRadius: 8` and `message`'s `color: "#334155"` have no exact token match — left as literals, matching the spec's explicit exact-match-only rule.
- `RADIUS.pill` (999) is used for the new `statusPill` — this is new UI, not a substitution, so there's no "original value" to preserve.
- The empty state's icon is `account-clock-outline` at `size={40}`, `color={COLORS.mutedLight}` — matching the icon-above-text shape already used by `NotificationsScreen`'s and `GroupChatScreen`'s empty states.
- Do not add a custom header, `useSafeAreaInsets`, or any navigation-options change — the native stack header (`title: "Join Requests"`) in `AppNavigator.tsx` is untouched by this task.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/JoinRequestsInboxScreen.tsx
git commit -m "Restyle Join Requests Inbox onto token-based list cards"
```
