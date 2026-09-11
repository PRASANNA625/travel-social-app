import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SHADOW } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import type { ReportReason } from "../types";

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment or abuse" },
  { value: "FAKE_PROFILE", label: "Fake profile" },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
  { value: "SAFETY_CONCERN", label: "Safety concern" },
  { value: "OTHER", label: "Other" },
];

export function ReportUserModal({
  visible,
  userName,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  userName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { reason: ReportReason; details?: string }) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const requiresDetails = reason === "OTHER";
  const canSubmit = !!reason && (!requiresDetails || details.trim().length > 0);

  const onClosePress = () => {
    setReason(null);
    setDetails("");
    onClose();
  };

  const onSubmitPress = () => {
    if (!canSubmit || !reason) return;
    onSubmit({ reason, details: details.trim() || undefined });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClosePress}>
      <Pressable style={styles.backdrop} onPress={onClosePress}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="flag-outline" size={22} color={colors.danger} />
          </View>
          <Text style={styles.title}>Report {userName}</Text>
          <Text style={styles.subtitle}>Why are you reporting this user?</Text>

          <ScrollView style={styles.reasonList} nestedScrollEnabled>
            {REPORT_REASONS.map((r) => (
              <Pressable key={r.value} style={styles.reasonRow} onPress={() => setReason(r.value)}>
                <View style={[styles.radio, reason === r.value && styles.radioSelected]}>
                  {reason === r.value && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={styles.detailsInput}
            placeholder={requiresDetails ? "Please describe what happened (required)" : "Additional details (optional)"}
            placeholderTextColor={colors.mutedLight}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
          />

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClosePress} disabled={isSubmitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={onSubmitPress}
              disabled={!canSubmit || isSubmitting}
            >
              <Text style={styles.submitText}>{isSubmitting ? "Submitting…" : "Submit Report"}</Text>
            </Pressable>
          </View>
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
      maxHeight: "80%",
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
      backgroundColor: colors.dangerBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 4 },
    subtitle: { fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 14 },
    reasonList: { width: "100%", maxHeight: 220 },
    reasonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, width: "100%" },
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
    reasonLabel: { fontSize: 14, color: colors.ink },
    detailsInput: {
      width: "100%",
      minHeight: 60,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.field,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 13.5,
      color: colors.ink,
      backgroundColor: colors.fieldBg,
      marginTop: 12,
    },
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
      backgroundColor: colors.danger,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitText: { fontSize: 14, fontWeight: "700", color: colors.white },
  });
}
