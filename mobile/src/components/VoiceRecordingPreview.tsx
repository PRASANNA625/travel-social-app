import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useVoicePlayback } from "../hooks/useVoicePlayback";
import { waveformBarHeights } from "../utils/waveform";
import { formatDuration } from "../utils/duration";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";

const BAR_COUNT = 28;
const BAR_MAX_HEIGHT = 22;

// Lets the user review a just-recorded voice note before sending, reusing
// the exact same playback hook (and single-playback coordination) as sent
// voice bubbles - this is the "Preview" step between Record and Send.
export function VoiceRecordingPreview({ uri, durationMs }: { uri: string; durationMs: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const playback = useVoicePlayback(`preview:${uri}`, uri);
  const bars = useMemo(() => waveformBarHeights(uri), [uri]);

  const totalMs = playback.durationMs > 0 ? playback.durationMs : durationMs;
  const progress = totalMs > 0 ? Math.min(1, playback.currentTimeMs / totalMs) : 0;
  const filledBars = Math.round(progress * BAR_COUNT);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.playButton} onPress={playback.toggle} disabled={playback.isLoading}>
        {playback.isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons name={playback.isPlaying ? "pause" : "play"} size={18} color={colors.primary} />
        )}
      </TouchableOpacity>
      <View style={styles.waveformCol}>
        <View style={styles.waveformRow}>
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                { height: Math.max(3, height * BAR_MAX_HEIGHT), backgroundColor: index < filledBars ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
        <Text style={styles.durationText}>
          {playback.isPlaying ? `${formatDuration(playback.currentTimeMs)} / ${formatDuration(totalMs)}` : formatDuration(totalMs)}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    playButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.successBg,
      alignItems: "center",
      justifyContent: "center",
    },
    waveformCol: { flex: 1 },
    waveformRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 22 },
    waveformBar: { width: 3, borderRadius: 1.5 },
    durationText: { fontSize: 10.5, color: colors.muted, marginTop: 4 },
  });
}
