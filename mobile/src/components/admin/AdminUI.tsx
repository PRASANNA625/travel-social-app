import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Animated, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import type { Palette } from "../../theme/palettes";
import { CONTROL, FONT, RADIUS, SHADOW } from "../../theme/tokens";
import { optimizedImageUrl } from "../../utils/optimizedImage";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// --- Status badge -------------------------------------------------------------------
// Status is never color alone: every badge carries its label (and an icon when given).

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

function toneColors(colors: Palette, tone: Tone) {
  switch (tone) {
    case "success":
      return { bg: colors.successBg, fg: colors.successText };
    case "warning":
      return { bg: colors.warningBg, fg: colors.warningText };
    case "danger":
      return { bg: colors.dangerBg, fg: colors.danger };
    case "info":
      return { bg: colors.primaryMuted, fg: colors.primary };
    default:
      return { bg: colors.fieldBg, fg: colors.muted };
  }
}

export function StatusBadge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { colors } = useTheme();
  const c = toneColors(colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon && <MaterialCommunityIcons name={icon} size={12} color={c.fg} />}
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Human labels for enum values: "ALMOST_FULL" -> "Almost full".
export function humanize(value: string) {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Avatar + person cell ------------------------------------------------------------

export function Avatar({ name, photoUrl, size = 32 }: { name: string; photoUrl?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl && !failed) {
    return <Image source={{ uri: optimizedImageUrl(photoUrl, size * 2) }} style={style} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[style, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: colors.white, fontWeight: "700", fontSize: size * 0.42 }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function PersonCell({ name, photoUrl, sub }: { name: string; photoUrl?: string | null; sub?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.person}>
      <Avatar name={name} photoUrl={photoUrl} />
      <View style={styles.personText}>
        <Text style={[styles.personName, { color: colors.ink }]} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={[styles.personSub, { color: colors.muted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// --- Panel (titled card) -----------------------------------------------------------------

export function Panel({
  title,
  subtitle,
  right,
  children,
  style,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, style]}>
      {(title || right) && (
        <View style={[styles.panelHeader, !padded && styles.panelHeaderPadded]}>
          <View style={styles.flexShrink}>
            {title ? <Text style={[styles.panelTitle, { color: colors.ink }]}>{title}</Text> : null}
            {subtitle ? <Text style={[styles.panelSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      <View style={padded ? undefined : styles.unpadded}>{children}</View>
    </View>
  );
}

// --- Stat tile --------------------------------------------------------------------------

export function compactNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

export function StatTile({
  label,
  value,
  icon,
  note,
  tone = "neutral",
  onPress,
  style: styleOverride,
}: {
  style?: StyleProp<ViewStyle>;
  label: string;
  value: number;
  icon: IconName;
  note?: string;
  // Tints the icon only; the number stays in ink.
  tone?: Tone;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const c = toneColors(colors, tone === "neutral" ? "info" : tone);
  const body = (
    <>
      <View style={styles.statTop}>
        <Text style={[styles.statLabel, { color: colors.muted }]} numberOfLines={2}>
          {label}
        </Text>
        <View style={[styles.statIcon, { backgroundColor: c.bg }]}>
          <MaterialCommunityIcons name={icon} size={16} color={c.fg} />
        </View>
      </View>
      <Text style={[styles.statValue, { color: colors.ink }]}>{compactNumber(value)}</Text>
      {note ? (
        <Text style={[styles.statNote, { color: colors.muted }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </>
  );
  const style = [styles.stat, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styleOverride];
  return onPress ? (
    <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      {body}
    </TouchableOpacity>
  ) : (
    <View style={style}>{body}</View>
  );
}

// --- Segmented tabs ---------------------------------------------------------------------

export function SegmentTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.segment, active && { backgroundColor: colors.surfaceElevated, ...SHADOW.card }]}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, { color: active ? colors.ink : colors.muted }]}>
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// --- Select (compact dropdown built on a modal list) ---------------------------------------

// The dropdown lives with the shared theme components; admin screens import it from here.
export { SelectChip as Select } from "../theme/SelectChip";

// --- Buttons ----------------------------------------------------------------------------

export function AdminButton({
  label,
  icon,
  onPress,
  variant = "secondary",
  disabled,
  loading,
  small,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    secondary: { bg: colors.surfaceElevated, fg: colors.ink, border: colors.border },
    danger: { bg: colors.dangerBg, fg: colors.danger, border: colors.dangerBorderLight },
    ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
  }[variant];
  return (
    <TouchableOpacity
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        icon && <MaterialCommunityIcons name={icon} size={small ? 15 : 17} color={palette.fg} />
      )}
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// --- Pagination -------------------------------------------------------------------------

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { colors } = useTheme();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <View style={styles.pagination}>
      <Text style={[styles.paginationText, { color: colors.muted }]}>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </Text>
      <View style={styles.paginationButtons}>
        <AdminButton label="Previous" icon="chevron-left" small onPress={() => onPage(page - 1)} disabled={page <= 1} />
        <Text style={[styles.paginationText, { color: colors.ink }]}>
          {page} / {pages}
        </Text>
        <AdminButton label="Next" icon="chevron-right" small onPress={() => onPage(page + 1)} disabled={page >= pages} />
      </View>
    </View>
  );
}

// --- Confirm dialog -----------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  // When set, the admin must type a reason; it's passed to onConfirm and stored in the audit log.
  reasonLabel?: string;
  // Extra checkbox (e.g. "Also suspend the reported account").
  checkboxLabel?: string;
  onConfirm: (input: { reason: string; checked: boolean }) => Promise<unknown>;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => void>(() => {});
export const useConfirm = () => useContext(ConfirmContext);

const ToastContext = createContext<(message: string, tone?: "success" | "error") => void>(() => {});
export const useToast = () => useContext(ToastContext);

// Provides useConfirm() and useToast() to the dashboard.
export function AdminFeedbackProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error"; id: number } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const confirm = useCallback((o: ConfirmOptions) => {
    setOptions(o);
    setReason("");
    setChecked(false);
    setError(null);
  }, []);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: false }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setToast(null));
    }, 3200);
    return () => clearTimeout(t);
  }, [toast, opacity]);

  const reasonOk = !options?.reasonLabel || reason.trim().length >= 3;

  const run = async () => {
    if (!options || !reasonOk) return;
    setBusy(true);
    setError(null);
    try {
      await options.onConfirm({ reason: reason.trim(), checked });
      setOptions(null);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={showToast}>
        {children}
        <Modal visible={!!options} transparent animationType="fade" onRequestClose={() => !busy && setOptions(null)}>
          <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => !busy && setOptions(null)}>
            <Pressable style={[styles.dialog, { backgroundColor: colors.surfaceElevated }]} onPress={() => {}}>
              {options && (
                <>
                  <View style={[styles.dialogIcon, { backgroundColor: options.destructive ? colors.dangerBg : colors.primaryMuted }]}>
                    <MaterialCommunityIcons
                      name={options.destructive ? "alert-outline" : "help-circle-outline"}
                      size={22}
                      color={options.destructive ? colors.danger : colors.primary}
                    />
                  </View>
                  <Text style={[styles.dialogTitle, { color: colors.ink }]}>{options.title}</Text>
                  <Text style={[styles.dialogMessage, { color: colors.muted }]}>{options.message}</Text>
                  {options.reasonLabel && (
                    <TextInput
                      style={[styles.dialogInput, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
                      placeholder={options.reasonLabel}
                      placeholderTextColor={colors.mutedLight}
                      value={reason}
                      onChangeText={setReason}
                      multiline
                      accessibilityLabel={options.reasonLabel}
                    />
                  )}
                  {options.checkboxLabel && (
                    <TouchableOpacity style={styles.checkRow} onPress={() => setChecked((c) => !c)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                      <MaterialCommunityIcons name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={checked ? colors.primary : colors.muted} />
                      <Text style={[styles.checkText, { color: colors.ink }]}>{options.checkboxLabel}</Text>
                    </TouchableOpacity>
                  )}
                  {error && <Text style={[styles.dialogError, { color: colors.danger }]}>{error}</Text>}
                  <View style={styles.dialogActions}>
                    <AdminButton label="Cancel" onPress={() => setOptions(null)} disabled={busy} />
                    <AdminButton
                      label={options.confirmLabel}
                      variant={options.destructive ? "danger" : "primary"}
                      onPress={run}
                      loading={busy}
                      disabled={!reasonOk}
                    />
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
        {toast && (
          <Animated.View
            pointerEvents="none"
            style={[styles.toast, { opacity, backgroundColor: toast.tone === "error" ? colors.danger : colors.ink }]}
            accessibilityLiveRegion="polite"
          >
            <MaterialCommunityIcons name={toast.tone === "error" ? "alert-circle-outline" : "check-circle-outline"} size={18} color={colors.surfaceElevated} />
            <Text style={[styles.toastText, { color: colors.surfaceElevated }]}>{toast.message}</Text>
          </Animated.View>
        )}
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}

// --- States -------------------------------------------------------------------------------

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.stateText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.state}>
      <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.danger} />
      <Text style={[styles.stateText, { color: colors.ink }]}>{message}</Text>
      {onRetry && <AdminButton label="Try again" icon="refresh" small onPress={onRetry} />}
    </View>
  );
}

export function EmptyBlock({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.state}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primaryMuted }]}>
        <MaterialCommunityIcons name={icon} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.ink }]}>{title}</Text>
      {message ? <Text style={[styles.stateText, { color: colors.muted }]}>{message}</Text> : null}
    </View>
  );
}


const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11.5, fontWeight: "700" },
  // maxWidth keeps it inside a table cell so long names and emails get an ellipsis.
  person: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, maxWidth: "100%" },
  personText: { flexShrink: 1, minWidth: 0 },
  personName: { fontSize: 14, fontWeight: "600" },
  personSub: { fontSize: 12, marginTop: 1 },
  panel: { borderRadius: RADIUS.card, borderWidth: 1, padding: 16, ...SHADOW.card },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  panelHeaderPadded: { paddingHorizontal: 16, paddingTop: 16 },
  unpadded: { marginHorizontal: -16, marginBottom: -16 },
  flexShrink: { flexShrink: 1 },
  panelTitle: { ...FONT.cardTitle },
  panelSubtitle: { fontSize: 12.5, marginTop: 2 },
  stat: { flexGrow: 1, flexBasis: 180, minWidth: 150, borderRadius: RADIUS.card, borderWidth: 1, padding: 16, gap: 4, ...SHADOW.card },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statLabel: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  statIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  statNote: { fontSize: 12 },
  segments: { flexDirection: "row", borderRadius: RADIUS.sm, borderWidth: 1, padding: 3, gap: 2, alignSelf: "flex-start", flexWrap: "wrap" },
  segment: { paddingHorizontal: 14, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 13, fontWeight: "600" },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: CONTROL.buttonSmall, paddingHorizontal: 14, borderRadius: RADIUS.sm, borderWidth: 1 },
  buttonSmall: { height: 32, paddingHorizontal: 10 },
  buttonText: { fontSize: 13.5, fontWeight: "700" },
  buttonTextSmall: { fontSize: 12.5 },
  disabled: { opacity: 0.5 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, flexWrap: "wrap" },
  paginationButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  paginationText: { fontSize: 13 },
  dialog: { width: "100%", maxWidth: 440, borderRadius: RADIUS.card, padding: 20, gap: 10, ...SHADOW.raised },
  dialogIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  dialogTitle: { ...FONT.screenTitle, fontSize: 18 },
  dialogMessage: { fontSize: 14, lineHeight: 20 },
  dialogInput: { minHeight: 72, borderWidth: 1, borderRadius: RADIUS.field, padding: 12, fontSize: 14, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkText: { fontSize: 14, flexShrink: 1 },
  dialogError: { fontSize: 13 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  toast: { position: "absolute", bottom: 24, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: RADIUS.pill, maxWidth: "90%", ...SHADOW.raised },
  toastText: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  state: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 36, paddingHorizontal: 16 },
  stateTitle: { ...FONT.cardTitle, textAlign: "center" },
  stateText: { fontSize: 13.5, textAlign: "center", maxWidth: 380 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
