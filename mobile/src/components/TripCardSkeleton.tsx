import { StyleSheet, View } from "react-native";
import { Skeleton } from "./theme/Skeleton";
import { COLORS } from "../theme/tokens";

// Mirrors TripCard's shape (image + title row + meta row) so the loading
// state reads as "trip cards are coming" instead of a blank list.
export function TripCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.image} />
      <View style={styles.body}>
        <Skeleton style={styles.line} />
        <Skeleton style={styles.lineShort} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: 20, overflow: "hidden", marginBottom: 16 },
  image: { width: "100%", height: 170, borderRadius: 0 },
  body: { padding: 14, paddingTop: 10, gap: 8 },
  line: { height: 14, width: "70%" },
  lineShort: { height: 12, width: "45%" },
});
