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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useGroup } from "../api/groups";
import { useLiveGroupChat, useMessageHistory, useUploadChatImage } from "../api/messages";
import type { ChatMessage } from "../types";

type Props = NativeStackScreenProps<AppStackParamList, "GroupChat">;

export function GroupChatScreen({ route }: Props) {
  const { groupId } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: group } = useGroup(groupId);
  const { data: history, isLoading } = useMessageHistory(groupId);
  const { messages, sendMessage } = useLiveGroupChat(groupId, history?.items ?? []);
  const uploadImage = useUploadChatImage();
  const [text, setText] = useState("");
  const insets = useSafeAreaInsets();

  const onSend = () => {
    if (!text.trim()) return;
    sendMessage({ type: "TEXT", content: text.trim() });
    setText("");
  };

  const onSendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    const url = await uploadImage.mutateAsync(result.assets[0]);
    sendMessage({ type: "IMAGE", mediaUrl: url });
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === me?.id;
    return (
      <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
        <View style={[styles.bubble, isMine && styles.bubbleMine]}>
          {!isMine && <Text style={styles.senderName}>{item.sender.name}</Text>}
          {item.type === "IMAGE" && item.mediaUrl ? (
            <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
          ) : (
            <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {group && (
        <View style={styles.membersBar}>
          <Text style={styles.membersText}>
            👥 {group.members.map((m) => m.user.name).join(", ")}
          </Text>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity onPress={onSendImage} style={styles.attachButton}>
          <Text style={{ fontSize: 20 }}>📷</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message the group..."
          value={text}
          onChangeText={setText}
          onSubmitEditing={onSend}
        />
        <TouchableOpacity onPress={onSend} style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  membersBar: { backgroundColor: "#fff", padding: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  membersText: { fontSize: 12, color: "#64748b" },
  list: { padding: 12, gap: 8 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { backgroundColor: "#fff", borderRadius: 12, padding: 10, maxWidth: "75%", marginBottom: 4 },
  bubbleMine: { backgroundColor: "#0f766e" },
  senderName: { fontSize: 11, fontWeight: "700", color: "#0f766e", marginBottom: 2 },
  messageText: { fontSize: 14, color: "#1e293b" },
  messageTextMine: { color: "#fff" },
  messageImage: { width: 180, height: 180, borderRadius: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  attachButton: { padding: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  sendButton: { paddingHorizontal: 12 },
  sendText: { color: "#0f766e", fontWeight: "700" },
});
