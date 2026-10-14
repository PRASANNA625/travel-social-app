import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Image, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ImagePickerAsset } from "expo-image-picker";
import { useTheme } from "../../theme/ThemeContext";
import { ACTION_BLUE, FONT, RADIUS, SHADOW } from "../../theme/tokens";
import { useEntrance, useNativeDriver, useReduceMotion } from "../../hooks/useReduceMotion";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Same limits as the backend upload route (10 MB per image).
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const TINTS = {
  blue: { light: { bg: "#e8f0fe", fg: ACTION_BLUE }, dark: { bg: "rgba(37,99,235,0.2)", fg: "#93b4fb" } },
  teal: { light: { bg: "#ddf3ee", fg: "#0f766e" }, dark: { bg: "rgba(20,162,148,0.2)", fg: "#5eead4" } },
  violet: { light: { bg: "#ede9fe", fg: "#6d28d9" }, dark: { bg: "rgba(139,92,246,0.22)", fg: "#c4b5fd" } },
};
export type Tint = keyof typeof TINTS;

export function useTint(tint: Tint) {
  const { scheme } = useTheme();
  return TINTS[tint][scheme === "dark" ? "dark" : "light"];
}

// A titled form card with an icon tile; fades and rises in, staggered by `index`.
export function FormSection({
  icon,
  tint,
  title,
  subtitle,
  index,
  decoration,
  children,
}: {
  icon: IconName;
  tint: Tint;
  title: string;
  subtitle: string;
  index: number;
  decoration?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const t = useTint(tint);
  const reduceMotion = useReduceMotion();
  const enter = useEntrance(120 + index * 90, reduceMotion, 520);
  return (
    <Animated.View
      style={[
        styles.section,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
      ]}
    >
      {decoration ? (
        <View style={styles.decoration} pointerEvents="none">
          {decoration}
        </View>
      ) : null}
      <View style={styles.sectionHead}>
        <View style={[styles.iconTile, { backgroundColor: t.bg }]}>
          <MaterialCommunityIcons name={icon} size={24} color={t.fg} />
        </View>
        <View style={styles.flexShrink}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.sectionSub, { color: colors.muted }]}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Animated.View>
  );
}

export function FieldLabel({ text, required, info, onInfo }: { text: string; required?: boolean; info?: boolean; onInfo?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: colors.ink }]}>
        {text}
        {required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      {info && (
        <TouchableOpacity onPress={onInfo} hitSlop={8} accessibilityRole="button" accessibilityLabel={`About ${text}`}>
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function FieldError({ message }: { message: string | false | undefined | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.danger} />
      <Text style={[styles.errorText, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.hint, { color: colors.muted }]}>{children}</Text>;
}

// --- Photos ----------------------------------------------------------------------------

// Browser File -> the same asset shape expo-image-picker returns on web.
function fileToAsset(file: File): ImagePickerAsset {
  return { uri: URL.createObjectURL(file), width: 0, height: 0, type: "image", file, fileName: file.name, mimeType: file.type, fileSize: file.size };
}

// Web only: accepts image files dropped onto the returned ref's element.
function useImageDrop(onFiles: (assets: ImagePickerAsset[], rejected: number) => void, max: number) {
  const ref = useRef<View>(null);
  const [over, setOver] = useState(false);
  const handler = useRef(onFiles);
  handler.current = onFiles;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    };
    const leave = () => setOver(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const ok = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES).slice(0, max);
      handler.current(ok.map(fileToAsset), files.length - ok.length);
    };
    el.addEventListener("dragover", enter);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", enter);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [max]);
  return { ref, over };
}

export function CoverDropzone({
  photo,
  onPick,
  onDropFiles,
  onRemove,
}: {
  photo: ImagePickerAsset | null;
  onPick: () => void;
  onDropFiles: (assets: ImagePickerAsset[], rejected: number) => void;
  onRemove: () => void;
}) {
  const { colors, scheme } = useTheme();
  const t = useTint("blue");
  const { ref, over } = useImageDrop(onDropFiles, 1);
  const isWeb = Platform.OS === "web";
  return (
    <View ref={ref}>
      {photo ? (
        <View style={styles.coverFrame}>
          <Image source={{ uri: photo.uri }} style={styles.coverImage} accessibilityLabel="Cover photo preview" />
          <View style={styles.coverActions}>
            <TouchableOpacity style={styles.coverAction} onPress={onPick} accessibilityRole="button">
              <MaterialCommunityIcons name="image-edit-outline" size={14} color="#ffffff" />
              <Text style={styles.coverActionText}>Change</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.coverAction} onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove cover photo">
              <MaterialCommunityIcons name="close" size={14} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={onPick}
          accessibilityRole="button"
          accessibilityLabel="Upload a cover photo"
          style={(state) => {
            const { hovered } = state as { hovered?: boolean };
            return [
              styles.dropzone,
              { borderColor: over || hovered ? ACTION_BLUE : scheme === "dark" ? colors.border : "#bfd3f5", backgroundColor: over ? t.bg : scheme === "dark" ? colors.fieldBg : "#f6f9ff" },
            ];
          }}
        >
          <View style={[styles.dropIcon, { backgroundColor: t.bg }]}>
            <MaterialCommunityIcons name="image-plus" size={28} color={t.fg} />
          </View>
          <Text style={[styles.dropTitle, { color: colors.ink }]}>{over ? "Drop to use as cover" : isWeb ? "Click to upload or drag and drop" : "Tap to choose a cover photo"}</Text>
          <Text style={[styles.dropSub, { color: colors.muted }]}>JPG, PNG or WebP · up to 10 MB</Text>
        </Pressable>
      )}
    </View>
  );
}

export function PhotoStrip({
  photos,
  max,
  onAdd,
  onDropFiles,
  onRemove,
}: {
  photos: ImagePickerAsset[];
  max: number;
  onAdd: () => void;
  onDropFiles: (assets: ImagePickerAsset[], rejected: number) => void;
  onRemove: (uri: string) => void;
}) {
  const { colors } = useTheme();
  const t = useTint("blue");
  const { ref, over } = useImageDrop(onDropFiles, Math.max(0, max - photos.length));
  const full = photos.length >= max;
  return (
    <View ref={ref} style={[styles.strip, over && { backgroundColor: t.bg, borderRadius: RADIUS.field }]}>
      {photos.length === 0 && (
        <TouchableOpacity style={[styles.addTile, { borderColor: colors.border, backgroundColor: colors.fieldBg }]} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add photos">
          <MaterialCommunityIcons name="plus" size={24} color={colors.muted} />
        </TouchableOpacity>
      )}
      {photos.map((p, i) => (
        <View key={p.uri} style={styles.thumbWrap}>
          <Image source={{ uri: p.uri }} style={styles.thumb} accessibilityLabel={`Photo ${i + 1}`} />
          <TouchableOpacity style={styles.thumbRemove} onPress={() => onRemove(p.uri)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
            <MaterialCommunityIcons name="close" size={12} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ))}
      {!full && (
        <TouchableOpacity style={[styles.addMore, { backgroundColor: t.bg }]} onPress={onAdd} accessibilityRole="button">
          <Text style={[styles.addMoreText, { color: t.fg }]}>+ {photos.length ? "Add more" : "Add photos"}</Text>
        </TouchableOpacity>
      )}
      <Text style={[styles.stripCount, { color: colors.mutedLight }]}>
        {photos.length}/{max}
      </Text>
    </View>
  );
}

// --- Choices ---------------------------------------------------------------------------

export function OptionPill({
  icon,
  label,
  selected,
  onPress,
  style,
  compact = false,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  // Tighter padding and type for two-column phone grids.
  compact?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const scale = useRef(new Animated.Value(1)).current;
  const bump = () =>
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver }),
    ]).start();
  const blue = dark ? "#93b4fb" : ACTION_BLUE;
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        onPress={() => {
          bump();
          onPress();
        }}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        style={(state) => {
          const { hovered } = state as { hovered?: boolean };
          return [
            styles.pill,
            compact && styles.pillCompact,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            hovered && !selected && { borderColor: dark ? "#3b5b9a" : "#a9c2f3", backgroundColor: dark ? colors.fieldBg : "#f7faff" },
            selected && { backgroundColor: dark ? "rgba(37,99,235,0.22)" : "#e8f0fe", borderColor: blue, ...SHADOW.card, shadowColor: ACTION_BLUE },
          ];
        }}
      >
        <MaterialCommunityIcons name={icon} size={17} color={selected ? blue : colors.ink} />
        <Text style={[styles.pillText, compact && styles.pillTextCompact, { color: selected ? blue : colors.ink }, selected && { fontWeight: "700" }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function RadioOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const blue = scheme === "dark" ? "#93b4fb" : ACTION_BLUE;
  return (
    <Pressable onPress={onPress} style={styles.radio} accessibilityRole="radio" accessibilityState={{ checked: selected }}>
      <View style={[styles.radioRing, { borderColor: selected ? blue : colors.mutedLight }]}>{selected && <View style={[styles.radioDot, { backgroundColor: blue }]} />}</View>
      <Text style={[styles.radioText, { color: colors.ink }, selected && { fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  );
}

// --- Decorations -----------------------------------------------------------------------

// Two pins joined by a dashed route, for the Route card's corner.
export function RouteArt() {
  const { scheme } = useTheme();
  const line = scheme === "dark" ? "rgba(147,180,251,0.6)" : "rgba(37,99,235,0.55)";
  return (
    <View style={styles.art}>
      <MaterialCommunityIcons name="image-filter-hdr" size={120} color={scheme === "dark" ? "rgba(94,234,212,0.12)" : "rgba(15,118,110,0.12)"} style={styles.artHills} />
      <View style={[styles.artPath, { borderColor: line }]} />
      <MaterialCommunityIcons name="map-marker" size={34} color={ACTION_BLUE} style={styles.artPinStart} />
      <MaterialCommunityIcons name="map-marker" size={40} color="#ef4444" style={styles.artPinEnd} />
    </View>
  );
}

export function FlightArt() {
  const { scheme } = useTheme();
  const line = scheme === "dark" ? "rgba(147,180,251,0.5)" : "rgba(37,99,235,0.4)";
  return (
    <View style={styles.art}>
      <View style={[styles.flightPath, { borderColor: line }]} />
      <MaterialCommunityIcons name="airplane" size={28} color={scheme === "dark" ? "#93b4fb" : "#6b8fd6"} style={styles.flightPlane} />
    </View>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  section: { borderWidth: 1, borderRadius: 22, padding: 22, overflow: "hidden", ...SHADOW.card },
  decoration: { position: "absolute", top: 0, right: 0 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  iconTile: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  sectionSub: { fontSize: 13.5, marginTop: 2 },
  sectionBody: { gap: 18 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  label: { ...FONT.label, fontSize: 14 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  errorText: { fontSize: 12.5, fontWeight: "600" },
  hint: { fontSize: 12.5, marginTop: 6, lineHeight: 18 },
  dropzone: { height: 150, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12 },
  dropIcon: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  dropTitle: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  dropSub: { fontSize: 12, textAlign: "center" },
  coverFrame: { height: 150, borderRadius: 16, overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  coverActions: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", gap: 6 },
  coverAction: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(15,23,42,0.72)", borderRadius: RADIUS.pill, paddingHorizontal: 10, height: 28 },
  coverActionText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  strip: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 2 },
  addTile: { width: 80, height: 64, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  thumbWrap: { width: 80, height: 64 },
  thumb: { width: "100%", height: "100%", borderRadius: 12 },
  thumbRemove: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(15,23,42,0.75)", alignItems: "center", justifyContent: "center" },
  addMore: { height: 44, borderRadius: RADIUS.pill, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  addMoreText: { fontSize: 13.5, fontWeight: "700" },
  stripCount: { fontSize: 12, marginLeft: "auto" },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: 12 },
  pillText: { fontSize: 14, fontWeight: "500", flexShrink: 1 },
  pillCompact: { paddingHorizontal: 8, gap: 6 },
  pillTextCompact: { fontSize: 13 },
  radio: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  radioRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  radioText: { fontSize: 14.5 },
  art: { width: 200, height: 150 },
  artHills: { position: "absolute", right: -6, top: 30 },
  artPath: { position: "absolute", left: 52, top: 44, width: 96, height: 60, borderLeftWidth: 2, borderBottomWidth: 2, borderStyle: "dashed", borderBottomLeftRadius: 40, transform: [{ rotate: "-28deg" }] },
  artPinStart: { position: "absolute", left: 44, top: 82 },
  artPinEnd: { position: "absolute", right: 46, top: 10 },
  flightPath: { position: "absolute", right: 40, top: 24, width: 120, height: 70, borderTopWidth: 2, borderRightWidth: 2, borderStyle: "dashed", borderTopRightRadius: 70 },
  flightPlane: { position: "absolute", right: 22, top: 18, transform: [{ rotate: "35deg" }] },
});
