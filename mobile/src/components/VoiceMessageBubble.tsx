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

export function VoiceMessageBubble({
  messageId,
  mediaUrl,
  durationMs,
  isMine,
}: {
  messageId: string;
  mediaUrl: string;
  durationMs: number;
  isMine: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const playback = useVoicePlayback(messageId, mediaUrl);
  const bars = useMemo(() => waveformBarHeights(messageId), [messageId]);

  const totalMs = playback.durationMs > 0 ? playback.durationMs : durationMs;
  const progress = totalMs > 0 ? Math.min(1, playback.currentTimeMs / totalMs) : 0;
  const filledBars = Math.round(progress * BAR_COUNT);
  const iconColor = isMine ? colors.white : colors.primary;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: isMine ? "rgba(255,255,255,0.22)" : colors.successBg }]}
        onPress={playback.toggle}
        disabled={playback.isLoading}
      >
        {playback.isLoading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : playback.hasError ? (
          <MaterialCommunityIcons name="refresh" size={18} color={iconColor} />
        ) : (
          <MaterialCommunityIcons name={playback.isPlaying ? "pause" : "play"} size={18} color={iconColor} />
        )}
      </TouchableOpacity>
      <View style={styles.waveformCol}>
        <View style={styles.waveformRow}>
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: Math.max(3, height * BAR_MAX_HEIGHT),
                  backgroundColor:
                    index < filledBars
                      ? isMine
                        ? colors.white
                        : colors.primary
                      : isMine
                        ? "rgba(255,255,255,0.4)"
                        : colors.border,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.durationText, isMine && styles.durationTextMine]}>
          {playback.isPlaying ? `${formatDuration(playback.currentTimeMs)} / ${formatDuration(totalMs)}` : formatDuration(totalMs)}
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 190, paddingVertical: 2 },
    playButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    waveformCol: { flex: 1 },
    waveformRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 22 },
    waveformBar: { width: 3, borderRadius: 1.5 },
    durationText: { fontSize: 10.5, color: colors.muted, marginTop: 4 },
    durationTextMine: { color: "rgba(255,255,255,0.85)" },
  });
}
