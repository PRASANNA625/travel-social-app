import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { ImagePickerAsset } from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SHADOW } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: "bug", label: "🐛 Bug / Something isn't working" },
  { value: "chat", label: "💬 Chat issue" },
  { value: "notification", label: "🔔 Notification issue" },
  { value: "location", label: "📍 Location issue" },
  { value: "login", label: "🔐 Login/Account issue" },
  { value: "ui", label: "🎨 UI/Design issue" },
  { value: "other", label: "Other" },
];

const FEEDBACK_TYPES: { value: string; label: string }[] = [
  { value: "suggestion", label: "Suggestion" },
  { value: "improvement", label: "Improvement" },
  { value: "general", label: "General Feedback" },
];

export function FeedbackModal({
  visible,
  mode,
  isSubmitting,
  justSubmitted,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: "report" | "feedback";
  isSubmitting: boolean;
  justSubmitted: boolean;
  onClose: () => void;
  onSubmit: (input: { type: string; description: string; screenshot?: ImagePickerAsset }) => void;
}) {
  const [type, setType] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<ImagePickerAsset | null>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      setType(mode === "report" ? "bug" : null);
      setDescription("");
      setScreenshot(null);
    }
  }, [visible, mode]);

  const isReport = mode === "report";
  const typeOptions = isReport ? REPORT_TYPES : FEEDBACK_TYPES;
  const canSubmit = !!type && description.trim().length > 0;

  const onPickScreenshot = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (result.canceled) return;
    setScreenshot(result.assets[0]);
  };

  const onSubmitPress = () => {
    if (!canSubmit || !type) return;
    onSubmit({ type, description: description.trim(), screenshot: screenshot ?? undefined });
  };

  const onDonePress = () => {
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={justSubmitted ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {justSubmitted ? (
            <>
              <View style={[styles.iconWrap, { backgroundColor: colors.successBg }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={26} color={colors.primary} />
              </View>
              <Text style={styles.title}>Thanks! Your feedback has been submitted.</Text>
              <Pressable style={styles.doneButton} onPress={onDonePress}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={[styles.iconWrap, { backgroundColor: isReport ? colors.dangerBg : colors.successBg }]}>
                <MaterialCommunityIcons
                  name={isReport ? "bug-outline" : "lightbulb-on-outline"}
                  size={22}
                  color={isReport ? colors.danger : colors.primary}
                />
              </View>
              <Text style={styles.title}>{isReport ? "Report a Problem" : "Send Feedback"}</Text>
              <Text style={styles.subtitle}>
                {isReport ? "Found something that isn't working correctly?" : "Have an idea or suggestion to improve Triply?"}
              </Text>

              <ScrollView style={styles.typeList} nestedScrollEnabled>
                {typeOptions.map((opt) => (
                  <Pressable key={opt.value} style={styles.typeRow} onPress={() => setType(opt.value)}>
                    <View style={[styles.radio, type === opt.value && styles.radioSelected]}>
                      {type === opt.value && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.typeLabel}>{opt.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                style={styles.descriptionInput}
                placeholder={isReport ? "Tell us what happened…" : "Tell us your idea…"}
                placeholderTextColor={colors.mutedLight}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={2000}
              />

              {screenshot ? (
                <View style={styles.screenshotPreviewRow}>
                  <Image source={{ uri: screenshot.uri }} style={styles.screenshotThumb} />
                  <Pressable style={styles.screenshotRemove} onPress={() => setScreenshot(null)}>
                    <MaterialCommunityIcons name="close-circle" size={20} color={colors.mutedLight} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.screenshotButton} onPress={onPickScreenshot}>
                  <MaterialCommunityIcons name="camera-plus-outline" size={16} color={colors.muted} />
                  <Text style={styles.screenshotButtonText}>Add screenshot/photo</Text>
                </Pressable>
              )}

              <View style={styles.buttonRow}>
                <Pressable style={styles.cancelButton} onPress={onClose} disabled={isSubmitting}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                  onPress={onSubmitPress}
                  disabled={!canSubmit || isSubmitting}
                >
                  <Text style={styles.submitText}>
                    {isSubmitting ? "Submitting…" : isReport ? "Submit Report" : "Submit"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
    sheet: {
      width: "88%",
      maxWidth: 380,
      maxHeight: "85%",
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      padding: 22,
      alignItems: "center",
      ...SHADOW.card,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 4, textAlign: "center" },
    subtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 14 },
    typeList: { width: "100%", maxHeight: 180 },
    typeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, width: "100%" },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioSelected: { borderColor: colors.primary },
    radioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.primary },
    typeLabel: { fontSize: 14, color: colors.ink, flexShrink: 1 },
    descriptionInput: {
      width: "100%",
      minHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.field,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      color: colors.ink,
      backgroundColor: colors.fieldBg,
      marginTop: 12,
      textAlignVertical: "top",
    },
    screenshotButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      alignSelf: "flex-start",
    },
    screenshotButtonText: { fontSize: 13, color: colors.muted },
    screenshotPreviewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, alignSelf: "flex-start" },
    screenshotThumb: { width: 44, height: 44, borderRadius: RADIUS.field, backgroundColor: colors.fieldBg },
    screenshotRemove: { padding: 2 },
    buttonRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 16 },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.fieldBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: { fontSize: 14, fontWeight: "700", color: colors.ink },
    submitButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.primary,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitText: { fontSize: 14, fontWeight: "700", color: colors.white },
    doneButton: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.primary,
      marginTop: 16,
    },
    doneText: { fontSize: 14, fontWeight: "700", color: colors.white },
  });
}
