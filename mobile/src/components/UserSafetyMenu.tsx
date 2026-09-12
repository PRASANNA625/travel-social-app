import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SHADOW } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

export interface UserSafetyMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_WIDTH = 190;
const SCREEN_MARGIN = 12;

export function UserSafetyMenu({
  visible,
  anchor,
  isBlocked,
  userName,
  onClose,
  onSelectReport,
  onConfirmBlock,
  onConfirmUnblock,
}: {
  visible: boolean;
  anchor: UserSafetyMenuAnchor | null;
  isBlocked: boolean;
  userName: string;
  onClose: () => void;
  onSelectReport: () => void;
  onConfirmBlock: () => void;
  onConfirmUnblock: () => void;
}) {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [visible, progress]);

  const screenWidth = Dimensions.get("window").width;
  const top = anchor ? anchor.y + anchor.height + 8 : 0;
  const right = anchor ? Math.max(SCREEN_MARGIN, screenWidth - (anchor.x + anchor.width)) : SCREEN_MARGIN;

  const onSelectReportItem = () => {
    onClose();
    onSelectReport();
  };

  const onSelectBlockItem = () => {
    onClose();
    if (isBlocked) {
      onConfirmUnblock();
    } else {
      setConfirmVisible(true);
    }
  };

  const onConfirm = () => {
    setConfirmVisible(false);
    onConfirmBlock();
  };

  return (
    <>
      <Modal visible={visible && !!anchor} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Animated.View
            style={[
              styles.menu,
              {
                top,
                right,
                opacity: progress,
                transform: [
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
                ],
              },
            ]}
          >
            <Pressable style={styles.menuItem} onPress={onSelectReportItem}>
              <View style={styles.menuIconWrap}>
                <MaterialCommunityIcons name="flag-outline" size={17} color={colors.primary} />
              </View>
              <Text style={styles.menuItemText}>Report User</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={onSelectBlockItem}>
              <View style={[styles.menuIconWrap, styles.menuIconWrapDanger]}>
                <MaterialCommunityIcons
                  name={isBlocked ? "account-check-outline" : "account-cancel-outline"}
                  size={17}
                  color={colors.danger}
                />
              </View>
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                {isBlocked ? "Unblock User" : "Block User"}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <View style={[styles.menuIconWrap, styles.menuIconWrapDanger, styles.confirmIconWrap]}>
              <MaterialCommunityIcons name="account-cancel-outline" size={22} color={colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Block {userName}?</Text>
            <Text style={styles.confirmSubtitle}>
              They won't be able to send you buddy requests or appear in your matches, and you won't appear in theirs.
            </Text>
            <View style={styles.confirmButtonRow}>
              <Pressable style={styles.confirmCancelButton} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBlockButton} onPress={onConfirm}>
                <Text style={styles.confirmBlockText}>Block</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
    menu: {
      position: "absolute",
      width: MENU_WIDTH,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.field,
      paddingVertical: 6,
      ...SHADOW.card,
    },
    menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
    menuIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.successBg,
      alignItems: "center",
      justifyContent: "center",
    },
    menuIconWrapDanger: { backgroundColor: colors.dangerBg },
    menuItemText: { fontSize: 14, fontWeight: "600", color: colors.ink },
    menuItemTextDanger: { color: colors.danger },
    menuDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 10 },
    confirmSheet: {
      width: "82%",
      maxWidth: 340,
      backgroundColor: colors.surfaceElevated,
      borderRadius: RADIUS.card,
      padding: 22,
      alignItems: "center",
      ...SHADOW.card,
    },
    confirmIconWrap: { width: 48, height: 48, borderRadius: 24, marginBottom: 12 },
    confirmTitle: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 6 },
    confirmSubtitle: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19, marginBottom: 18 },
    confirmButtonRow: { flexDirection: "row", gap: 10, width: "100%" },
    confirmCancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.fieldBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmCancelText: { fontSize: 14, fontWeight: "700", color: colors.ink },
    confirmBlockButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: RADIUS.field,
      alignItems: "center",
      backgroundColor: colors.danger,
    },
    confirmBlockText: { fontSize: 14, fontWeight: "700", color: colors.white },
  });
}
