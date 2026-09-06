import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useGroup } from "../api/groups";
import { useLiveGroupChat, useMessageHistory, useUploadChatImage } from "../api/messages";
import { useMarkGroupNotificationsRead } from "../api/notifications";
import type { ChatMessage } from "../types";
import { Alert } from "../utils/alert";
import { optimizedImageUrl } from "../utils/optimizedImage";
import { Skeleton } from "../components/theme/Skeleton";
import { AttachmentSheet } from "../components/AttachmentSheet";
import { ChatWallpaper } from "../components/ChatWallpaper";
import { GroupMembersModal } from "../components/GroupMembersModal";
import { ReactionPickerModal } from "../components/ReactionPickerModal";
import { SeenByModal } from "../components/SeenByModal";
import { COLORS, TYPE } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "GroupChat">;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function GroupChatScreen({ route, navigation }: Props) {
  const { groupId, tripTitle, highlightMessageId } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: group } = useGroup(groupId);
  const { data: history, isLoading } = useMessageHistory(groupId);
  const memberIds = group?.members.map((m) => m.userId) ?? [];
  const { messages, sendMessage, presence, toggleReaction, markRead } = useLiveGroupChat(
    groupId,
    history?.items ?? [],
    memberIds
  );
  const uploadImage = useUploadChatImage();
  const [text, setText] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [seenByTargetId, setSeenByTargetId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const markedReadIds = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const handledHighlightRef = useRef(!highlightMessageId);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const isClosed = group?.trip.status === "COMPLETED";
  const markGroupNotificationsRead = useMarkGroupNotificationsRead();

  useEffect(() => {
    markGroupNotificationsRead.mutate(groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const scrollToBottom = (animated: boolean) => listRef.current?.scrollToEnd({ animated });

  // A notification can deep-link to a specific message (a reaction, or a
  // message sent while the recipient was away). Jump to it and briefly flash
  // it once it's in the loaded history, instead of always auto-scrolling to
  // the bottom below. Messages older than the last ~30 (this screen's fixed
  // history page) aren't loaded and can't be scrolled to - the chat still
  // opens correctly, it just can't jump to something that far back.
  useEffect(() => {
    if (handledHighlightRef.current || !highlightMessageId) return;
    const index = messages.findIndex((m) => m.id === highlightMessageId);
    if (index === -1) {
      if (!isLoading) handledHighlightRef.current = true;
      return;
    }
    handledHighlightRef.current = true;
    setHighlightedMessageId(highlightMessageId);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
    });
    const timer = setTimeout(() => setHighlightedMessageId(null), 2500);
    return () => clearTimeout(timer);
  }, [messages, isLoading, highlightMessageId]);

  const onScrollToIndexFailed = ({ index }: { index: number }) => {
    listRef.current?.scrollToOffset({ offset: index * 80, animated: false });
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 }), 100);
  };

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => scrollToBottom(true));
    return () => sub.remove();
  }, []);

  const onSend = () => {
    if (!text.trim() || isClosed) return;
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

  const onChooseFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to choose a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    setPendingPhoto(result.assets[0]);
  };

  const onChooseFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const asset = result.assets[0];
    // expo-document-picker's web build returns a real `file: File` blob
    // (same shape ImagePicker's web build already returns) - carry it
    // through when present so appendImageAsset's web branch works
    // identically for files picked this way, matching how it already
    // handles ImagePicker's web assets.
    const webFile = (asset as unknown as { file?: File }).file;
    setPendingPhoto({ uri: asset.uri, fileName: asset.name, file: webFile } as ImagePicker.ImagePickerAsset);
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

  useEffect(() => {
    if (!me) return;
    const alreadyMarked = markedReadIds.current;
    const unread = messages
      .filter((m) => m.senderId !== me.id && !alreadyMarked.has(m.id))
      .map((m) => m.id);
    if (unread.length === 0) return;
    for (const id of unread) alreadyMarked.add(id);
    markRead(unread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, me?.id]);

  const reactionTargetMessage = messages.find((m) => m.id === reactionTargetId) ?? null;
  const reactionTargetCurrentEmoji =
    reactionTargetMessage?.reactions?.find((r) => r.userIds.includes(me?.id ?? ""))?.emoji ?? null;

  const onSelectReaction = (emoji: string) => {
    if (reactionTargetId) toggleReaction(reactionTargetId, emoji);
    setReactionTargetId(null);
  };

  const seenByTargetMessage = messages.find((m) => m.id === seenByTargetId) ?? null;
  const seenByOtherMembers = (group?.members ?? []).filter((m) => m.userId !== me?.id);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === me?.id;
    const reactions = item.reactions ?? [];
    const isHighlighted = item.id === highlightedMessageId;
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
          <TouchableOpacity
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              item.type === "IMAGE" && styles.bubbleImageWrap,
              isHighlighted && styles.bubbleHighlighted,
            ]}
            activeOpacity={0.85}
            onLongPress={() => setReactionTargetId(item.id)}
          >
            {!isMine && <Text style={styles.senderName}>{item.sender.name}</Text>}
            {item.type === "IMAGE" && item.mediaUrl ? (
              <Image source={{ uri: optimizedImageUrl(item.mediaUrl, 190) }} style={styles.messageImage} />
            ) : (
              <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
            )}
          </TouchableOpacity>
          {reactions.length > 0 && (
            <View style={[styles.reactionsRow, isMine && styles.reactionsRowMine]}>
              {reactions.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[styles.reactionPill, r.userIds.includes(me?.id ?? "") && styles.reactionPillMine]}
                  onPress={() => toggleReaction(item.id, r.emoji)}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text style={styles.reactionCount}>{r.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.timeText, isMine && styles.timeTextMine]}>{formatTime(item.createdAt)}</Text>
          {isMine && (
            <TouchableOpacity
              style={styles.seenByRow}
              hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
              onPress={() => setSeenByTargetId(item.id)}
            >
              <MaterialCommunityIcons
                name={(item.readBy?.length ?? 0) > 0 ? "check-all" : "check"}
                size={13}
                color={(item.readBy?.length ?? 0) > 0 ? COLORS.primary : COLORS.mutedLight}
              />
              <Text style={(item.readBy?.length ?? 0) > 0 ? styles.seenByTextSeen : styles.seenByText}>
                {(item.readBy?.length ?? 0) > 0 ? `Seen by ${item.readBy!.length}` : "Sent"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <TouchableOpacity
          style={[styles.headerButton, styles.headerMembersButton]}
          onPress={() => setMembersModalVisible(true)}
        >
          <MaterialCommunityIcons name="account-group" size={18} color={COLORS.ink} />
          <Text style={styles.headerMembersCount}>{group?.members?.length ?? 0}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.body, isWeb && styles.bodyWeb]}>
        <View style={styles.messageArea}>
          <ChatWallpaper />
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
              ref={listRef}
              style={styles.list}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => {
                if (handledHighlightRef.current) scrollToBottom(false);
              }}
              onScrollToIndexFailed={onScrollToIndexFailed}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

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
          <>
            {isClosed && (
              <View style={styles.closedBanner}>
                <MaterialCommunityIcons name="lock-outline" size={14} color={COLORS.mutedLight} />
                <Text style={styles.closedBannerText}>This trip is closed. Chat is read-only.</Text>
              </View>
            )}
            <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
              <TouchableOpacity
                onPress={() => setAttachmentSheetVisible(true)}
                style={[styles.attachButton, isClosed && styles.attachButtonDisabled]}
                disabled={isClosed}
              >
                <MaterialCommunityIcons name="paperclip" size={22} color={isClosed ? COLORS.mutedLight : COLORS.primary} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, isClosed && styles.inputDisabled]}
                placeholder={isClosed ? "Chat is read-only" : "Message the group..."}
                placeholderTextColor={COLORS.mutedLight}
                value={text}
                onChangeText={setText}
                onSubmitEditing={onSend}
                editable={!isClosed}
                multiline
              />
              <TouchableOpacity onPress={onSend} style={styles.sendButton} disabled={!text.trim() || isClosed}>
                <MaterialCommunityIcons name="send" size={18} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={onOpenCamera}
        onChooseFromGallery={onChooseFromGallery}
        onChooseFromFiles={onChooseFromFiles}
      />

      <GroupMembersModal
        visible={membersModalVisible}
        onClose={() => setMembersModalVisible(false)}
        members={group?.members ?? []}
        presence={presence}
        onSelectMember={(member) => {
          setMembersModalVisible(false);
          navigation.navigate("UserProfile", { userId: member.userId, groupRole: member.role });
        }}
      />

      <ReactionPickerModal
        visible={!!reactionTargetId}
        onClose={() => setReactionTargetId(null)}
        onSelect={onSelectReaction}
        currentReaction={reactionTargetCurrentEmoji}
      />

      <SeenByModal
        visible={!!seenByTargetId}
        onClose={() => setSeenByTargetId(null)}
        members={seenByOtherMembers}
        presence={presence}
        readBy={seenByTargetMessage?.readBy ?? []}
      />
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
  headerMembersButton: { width: undefined, minWidth: 40, paddingHorizontal: 10, flexDirection: "row", gap: 4 },
  headerMembersCount: { ...TYPE.label, fontSize: 12 },
  headerTextWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.ink },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, maxWidth: "100%" },
  headerSubtitle: { fontSize: 11.5, color: COLORS.muted, flexShrink: 1 },
  body: { flex: 1 },
  bodyWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  messageArea: { flex: 1, position: "relative", overflow: "hidden" },
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
  bubbleHighlighted: { borderWidth: 2, borderColor: COLORS.warningText, shadowColor: COLORS.warningText, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  senderName: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginBottom: 3 },
  messageText: { fontSize: 14, color: "#1e293b", lineHeight: 20 },
  messageTextMine: { color: COLORS.white },
  messageImage: { width: 190, height: 190, borderRadius: 12 },
  timeText: { fontSize: 10.5, color: COLORS.mutedLight, marginTop: 3, marginLeft: 4 },
  timeTextMine: { marginLeft: 0, marginRight: 4 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  reactionsRowMine: { justifyContent: "flex-end" },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionPillMine: { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorderLight },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: COLORS.muted, fontWeight: "700" },
  seenByRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3, alignSelf: "flex-end" },
  seenByText: { fontSize: 10.5, color: COLORS.mutedLight },
  seenByTextSeen: { fontSize: 10.5, color: COLORS.primary, fontWeight: "600" },
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: COLORS.fieldBg,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  closedBannerText: { fontSize: 12, color: COLORS.mutedLight, fontWeight: "600" },
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
  attachButtonDisabled: { backgroundColor: COLORS.fieldBg },
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
  inputDisabled: { color: COLORS.mutedLight },
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
