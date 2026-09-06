import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore } from "../store/authStore";
import { COLORS, RADIUS, SHADOW } from "../theme/tokens";

export interface ProfileMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_WIDTH = 190;
const SCREEN_MARGIN = 12;

export function ProfileMenu({
  visible,
  anchor,
  onClose,
  onViewProfile,
}: {
  visible: boolean;
  anchor: ProfileMenuAnchor | null;
  onClose: () => void;
  onViewProfile: () => void;
}) {
  const logout = useAuthStore((s) => s.logout);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [visible, progress]);

  if (!visible || !anchor) return null;

  const screenWidth = Dimensions.get("window").width;
  const right = Math.max(SCREEN_MARGIN, screenWidth - (anchor.x + anchor.width));
  const top = anchor.y + anchor.height + 8;

  const onSelectViewProfile = () => {
    onClose();
    onViewProfile();
  };

  const onSelectLogout = () => {
    onClose();
    setConfirmVisible(true);
  };

  const onConfirmLogout = () => {
    setConfirmVisible(false);
    logout();
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            <Pressable style={styles.menuItem} onPress={onSelectViewProfile}>
              <View style={styles.menuIconWrap}>
                <MaterialCommunityIcons name="account-outline" size={17} color={COLORS.primary} />
              </View>
              <Text style={styles.menuItemText}>View Profile</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={onSelectLogout}>
              <View style={[styles.menuIconWrap, styles.menuIconWrapDanger]}>
                <MaterialCommunityIcons name="logout" size={17} color={COLORS.danger} />
              </View>
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Logout</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <View style={[styles.menuIconWrap, styles.menuIconWrapDanger, styles.confirmIconWrap]}>
              <MaterialCommunityIcons name="logout" size={22} color={COLORS.danger} />
            </View>
            <Text style={styles.confirmTitle}>Log out?</Text>
            <Text style={styles.confirmSubtitle}>You'll need to sign in again to access your trips and messages.</Text>
            <View style={styles.confirmButtonRow}>
              <Pressable style={styles.confirmCancelButton} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmLogoutButton} onPress={onConfirmLogout}>
                <Text style={styles.confirmLogoutText}>Log Out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.25)", alignItems: "center", justifyContent: "center" },
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.field,
    paddingVertical: 6,
    ...SHADOW.card,
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  menuIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapDanger: { backgroundColor: COLORS.dangerBg },
  menuItemText: { fontSize: 14, fontWeight: "600", color: COLORS.ink },
  menuItemTextDanger: { color: COLORS.danger },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 10 },
  confirmSheet: {
    width: "82%",
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: 22,
    alignItems: "center",
    ...SHADOW.card,
  },
  confirmIconWrap: { width: 48, height: 48, borderRadius: 24, marginBottom: 12 },
  confirmTitle: { fontSize: 17, fontWeight: "700", color: COLORS.ink, marginBottom: 6 },
  confirmSubtitle: { fontSize: 13, color: COLORS.muted, textAlign: "center", lineHeight: 19, marginBottom: 18 },
  confirmButtonRow: { flexDirection: "row", gap: 10, width: "100%" },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.field,
    alignItems: "center",
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmCancelText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  confirmLogoutButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.field,
    alignItems: "center",
    backgroundColor: COLORS.danger,
  },
  confirmLogoutText: { fontSize: 14, fontWeight: "700", color: COLORS.white },
});
