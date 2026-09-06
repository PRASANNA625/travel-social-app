import { StyleSheet, View } from "react-native";
import { Skeleton } from "./theme/Skeleton";
import { useTheme } from "../theme/ThemeContext";

// Mirrors TripCard's shape (image + title row + meta row) so the loading
// state reads as "trip cards are coming" instead of a blank list.
export function TripCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
      <Skeleton style={styles.image} />
      <View style={styles.body}>
        <Skeleton style={styles.line} />
        <Skeleton style={styles.lineShort} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: "hidden", marginBottom: 16 },
  image: { width: "100%", height: 170, borderRadius: 0 },
  body: { padding: 14, paddingTop: 10, gap: 8 },
  line: { height: 14, width: "70%" },
  lineShort: { height: 12, width: "45%" },
});
