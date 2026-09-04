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
            <Image source={{ uri: item.sender.photoUrl }} style={styles.avatar} />
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
              <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
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
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tripTitle}
          </Text>
          {group && (
            <View style={styles.headerSubRow}>
              <MaterialCommunityIcons name="account-group-outline" size={12} color="#64748b" />
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
          <ActivityIndicator style={{ marginTop: 40 }} size="large" />
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
                <MaterialCommunityIcons name="close" size={18} color="#dc2626" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewIconButton} onPress={onRetake} disabled={sendingPhoto}>
                <MaterialCommunityIcons name="camera-retake-outline" size={18} color="#334155" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendButton} onPress={onConfirmSendPhoto} disabled={sendingPhoto}>
                {sendingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color="#fff" />
                    <Text style={styles.previewSendText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
            <TouchableOpacity onPress={onOpenCamera} style={styles.attachButton}>
              <MaterialCommunityIcons name="camera-outline" size={22} color="#0f766e" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message the group..."
              placeholderTextColor="#94a3b8"
              value={text}
              onChangeText={setText}
              onSubmitEditing={onSend}
              multiline
            />
            <TouchableOpacity onPress={onSend} style={styles.sendButton} disabled={!text.trim()}>
              <MaterialCommunityIcons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  headerTextWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, maxWidth: "100%" },
  headerSubtitle: { fontSize: 11.5, color: "#64748b", flexShrink: 1 },
  body: { flex: 1 },
  bodyWeb: { width: "100%", maxWidth: 640, alignSelf: "center" },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 10 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: 13.5, color: "#94a3b8", textAlign: "center" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMine: { justifyContent: "flex-end" },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarPlaceholder: { backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontSize: 12, fontWeight: "700" },
  bubbleCol: { maxWidth: "75%", alignItems: "flex-start" },
  bubbleColMine: { alignItems: "flex-end" },
  bubble: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 11,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  bubbleTheirs: {},
  bubbleMine: { backgroundColor: "#0f766e", borderColor: "#0f766e", borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubbleImageWrap: { padding: 4, overflow: "hidden" },
  senderName: { fontSize: 11, fontWeight: "700", color: "#0f766e", marginBottom: 3 },
  messageText: { fontSize: 14, color: "#1e293b", lineHeight: 20 },
  messageTextMine: { color: "#fff" },
  messageImage: { width: 190, height: 190, borderRadius: 12 },
  timeText: { fontSize: 10.5, color: "#94a3b8", marginTop: 3, marginLeft: 4 },
  timeTextMine: { marginLeft: 0, marginRight: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    maxHeight: 100,
    backgroundColor: "#f8fafc",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
  },
  previewBar: {
    padding: 14,
    gap: 10,
    backgroundColor: "#fff",
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
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  previewSendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 14,
    paddingVertical: 12,
  },
  previewSendText: { color: "#fff", fontWeight: "700", fontSize: 14.5 },
});
