import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

// Same image and background as the native splash (app.json expo-splash-screen),
// so the hand-off from the OS splash to the app's loading state is seamless —
// and on web, where there's no native splash, this is the splash.
export const SPLASH_BACKGROUND = "#0b2a5b";

export function BrandSplash() {
  return (
    <View style={styles.container} accessibilityLabel="Triply – Travel Together, loading">
      <Image source={require("../../assets/splash-icon.png")} style={styles.image} resizeMode="contain" />
      <ActivityIndicator color="#a5f3fc" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: SPLASH_BACKGROUND },
  image: { width: 240, height: 240 },
  spinner: { marginTop: 8 },
});
