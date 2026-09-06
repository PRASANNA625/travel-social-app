import { useMemo } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RADIUS, SHADOW } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

// Must stay byte-identical to backend/src/modules/messages/messages.service.ts's
// ALLOWED_REACTIONS - these emoji include invisible variation-selector
// codepoints, so copy this array verbatim rather than retyping it if you
// ever need to touch it again.
export const REACTION_EMOJI = ["❤️", "👍", "😂", "😍", "😮", "🙌"] as const;

export function ReactionPickerModal({
  visible,
  onClose,
  onSelect,
  currentReaction,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  currentReaction: string | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          {REACTION_EMOJI.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[styles.emojiButton, currentReaction === emoji && styles.emojiButtonActive]}
              onPress={() => onSelect(emoji)}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
    sheet: {
      flexDirection: "row",
      gap: 6,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 10,
      ...SHADOW.card,
    },
    emojiButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    emojiButtonActive: { backgroundColor: colors.fieldBg },
    emoji: { fontSize: 22 },
  });
}
