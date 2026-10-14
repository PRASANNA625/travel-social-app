import type { ComponentProps } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { LocationProblem } from "../utils/currentLocation";
import { useTheme } from "../theme/ThemeContext";
import { RADIUS, SHADOW } from "../theme/tokens";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const web = Platform.OS === "web";

// What went wrong and how to fix it, per reason.
const COPY: Record<LocationProblem, { icon: IconName; title: string; body: string }> = {
  denied: {
    icon: "map-marker-off-outline",
    title: "Location is blocked",
    body: web
      ? "Your browser is blocking location for Triply. Click the icon at the left of the address bar, set Location to Allow, then try again."
      : "Triply isn't allowed to use your location. Turn it on for Triply in your device settings, then try again.",
  },
  unavailable: {
    icon: "crosshairs-question",
    title: "Couldn't find your location",
    body: web
      ? "Your browser couldn't get a position from this device. Check that location is on (Windows: Settings › Privacy & security › Location) and that you're connected to Wi-Fi."
      : "Your device didn't report a position. Check that location services are on, then try again.",
  },
  timeout: {
    icon: "timer-sand",
    title: "Finding your location took too long",
    body: "Your device didn't report a position in time. Try again, or pick a place instead.",
  },
  insecure: {
    icon: "lock-alert-outline",
    title: "Location needs a secure page",
    body: "Browsers only share location on https pages or on localhost. Open Triply over https, or pick a place instead.",
  },
  unsupported: {
    icon: "map-marker-off-outline",
    title: "Location isn't available",
    body: "This browser can't share its location. Pick a place instead.",
  },
};

// Shown when "Near me" can't get a position. Offers a retry (when it might help)
// and picking a place by hand, so the filter works without device location.
export function LocationProblemModal({
  problem,
  subject,
  onClose,
  onRetry,
  onChoosePlace,
}: {
  problem: LocationProblem | null;
  subject: string; // "trips" | "activities"
  onClose: () => void;
  onRetry: () => void;
  onChoosePlace: () => void;
}) {
  const { colors } = useTheme();
  const copy = problem ? COPY[problem] : null;
  const canRetry = problem !== "insecure" && problem !== "unsupported";

  return (
    <Modal visible={!!copy} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}} accessibilityRole="alert">
          {copy && (
            <>
              <View style={[styles.icon, { backgroundColor: colors.dangerBg }]}>
                <MaterialCommunityIcons name={copy.icon} size={26} color={colors.danger} />
              </View>
              <Text style={[styles.title, { color: colors.ink }]}>{copy.title}</Text>
              <Text style={[styles.body, { color: colors.muted }]}>{copy.body}</Text>
              <Text style={[styles.body, { color: colors.muted }]}>You can also pick a place to see {subject} near it.</Text>
              <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={onChoosePlace} accessibilityRole="button">
                <MaterialCommunityIcons name="map-search-outline" size={17} color={colors.white} />
                <Text style={[styles.primaryText, { color: colors.white }]}>Choose a place</Text>
              </TouchableOpacity>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.secondary, { backgroundColor: colors.fieldBg }]} onPress={onClose} accessibilityRole="button">
                  <Text style={[styles.secondaryText, { color: colors.ink }]}>Not now</Text>
                </TouchableOpacity>
                {canRetry && (
                  <TouchableOpacity style={[styles.secondary, { backgroundColor: colors.fieldBg }]} onPress={onRetry} accessibilityRole="button">
                    <Text style={[styles.secondaryText, { color: colors.ink }]}>Try again</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 380, borderRadius: RADIUS.card, padding: 22, alignItems: "center", ...SHADOW.raised },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 16.5, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 13.5, lineHeight: 19, textAlign: "center", marginTop: 8 },
  primary: { alignSelf: "stretch", height: 44, borderRadius: RADIUS.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18 },
  primaryText: { fontSize: 14.5, fontWeight: "800" },
  row: { alignSelf: "stretch", flexDirection: "row", gap: 10, marginTop: 10 },
  secondary: { flex: 1, height: 42, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 14, fontWeight: "700" },
});
