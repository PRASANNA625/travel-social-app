import type { ComponentProps } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RADIUS, SHADOW } from "../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface AttachmentOption {
  key: "camera" | "gallery" | "files";
  icon: IconName;
  label: string;
}

const OPTIONS: AttachmentOption[] = [
  { key: "camera", icon: "camera-outline", label: "Take Photo" },
  { key: "gallery", icon: "image-multiple-outline", label: "Choose from Gallery" },
  { key: "files", icon: "folder-outline", label: "Choose from Files" },
];

export function AttachmentSheet({
  visible,
  onClose,
  onTakePhoto,
  onChooseFromGallery,
  onChooseFromFiles,
}: {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseFromGallery: () => void;
  onChooseFromFiles: () => void;
}) {
  const select = (key: AttachmentOption["key"]) => {
    onClose();
    if (key === "camera") onTakePhoto();
    else if (key === "gallery") onChooseFromGallery();
    else onChooseFromFiles();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handle} />
          {OPTIONS.map((option) => (
            <TouchableOpacity key={option.key} style={styles.row} onPress={() => select(option.key)}>
              <View style={styles.iconBadge}>
                <MaterialCommunityIcons name={option.icon} size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.label}>{option.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    ...SHADOW.card,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.fieldBg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 15, fontWeight: "600", color: COLORS.ink },
  cancelButton: { marginTop: 8, paddingVertical: 13, alignItems: "center", borderTopWidth: 1, borderTopColor: COLORS.border },
  cancelText: { fontSize: 15, fontWeight: "700", color: COLORS.danger },
});
