import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAssistantReply } from "../api/assistant";
import type { AssistantMessage } from "../types";
import { GradientBackground } from "../components/theme/GradientBackground";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";

type Props = NativeStackScreenProps<AppStackParamList, "Assistant">;
type ChatEntry = AssistantMessage & { id: string };

function TypingDots() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] },
          ]}
        />
      ))}
    </View>
  );
}

export function AssistantScreen({ navigation }: Props) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const listRef = useRef<FlatList<ChatEntry>>(null);
  const insets = useSafeAreaInsets();
  const sendMutation = useAssistantReply();

  const makeId = () => `${Date.now()}-${nextId.current++}`;

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages, error, sendMutation.isPending]);

  const dispatch = (history: AssistantMessage[]) => {
    setError(null);
    sendMutation.mutate(history, {
      onSuccess: (reply) => setMessages((prev) => [...prev, { ...reply, id: makeId() }]),
      onError: (err: any) =>
        setError(err?.response?.data?.error ?? "Couldn't get a response, please try again."),
    });
  };

  const onSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    const userEntry: ChatEntry = { id: makeId(), role: "user", content: text };
    const history = [...messages, userEntry];
    setMessages(history);
    setInput("");
    dispatch(history);
  };

  const onRetry = () => {
    if (sendMutation.isPending) return;
    dispatch(messages);
  };

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <GradientBackground style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitleRow}>
            <View style={styles.robotBadge}>
              <MaterialCommunityIcons name="robot-outline" size={18} color={COLORS.white} />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Trip Assistant</Text>
              <Text style={styles.headerSubtitle}>Ask about destinations, budgets, itineraries...</Text>
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </GradientBackground>

      {messages.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="robot-happy-outline" size={44} color={COLORS.mutedLight} />
          <Text style={styles.emptyTitle}>Plan your next trip</Text>
          <Text style={styles.emptySubtitle}>
            Try "Suggest a 5-day budget trip to Goa" or "What's the best time to visit Manali?"
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[styles.bubbleRow, item.role === "user" && styles.bubbleRowMine]}>
              <View style={[styles.bubble, item.role === "user" ? styles.bubbleMine : styles.bubbleAssistant]}>
                <Text style={[styles.bubbleText, item.role === "user" && styles.bubbleTextMine]}>{item.content}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={
            sendMutation.isPending ? (
              <View style={styles.bubbleRow}>
                <TypingDots />
              </View>
            ) : null
          }
        />
      )}

      {error && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} disabled={sendMutation.isPending}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputRow, { paddingBottom: 10 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask the assistant..."
          placeholderTextColor={COLORS.mutedLight}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={onSend}
          multiline
        />
        <TouchableOpacity
          onPress={onSend}
          style={[styles.sendButton, (!input.trim() || sendMutation.isPending) && styles.sendButtonDisabled]}
          disabled={!input.trim() || sendMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <MaterialCommunityIcons name="send" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.fieldBg },
  header: { paddingHorizontal: 12, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  headerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  robotBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...TYPE.heading, fontSize: 17, color: COLORS.white },
  headerSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 11.5, marginTop: 2 },
  headerSpacer: { width: 36 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.ink },
  emptySubtitle: { fontSize: 13, color: COLORS.mutedLight, textAlign: "center", lineHeight: 19 },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 10 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 16, padding: 12 },
  bubbleAssistant: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: "#1e293b", lineHeight: 20 },
  bubbleTextMine: { color: COLORS.white },
  typingBubble: { flexDirection: "row", gap: 4, alignItems: "center", paddingVertical: 14 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.mutedLight },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: RADIUS.field,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorderLight,
  },
  errorText: { flex: 1, fontSize: 12.5, color: COLORS.danger },
  retryButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.danger },
  retryText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
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
  sendButtonDisabled: { backgroundColor: COLORS.mutedLight },
});
