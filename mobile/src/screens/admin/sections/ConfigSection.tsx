import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { atLeast, errorMessage, useAdminSettings, useAnalytics, useSaveSettings, type AppSettings } from "../../../api/admin";
import { TRAVEL_MODES } from "../../../types";
import { TRAVEL_MODE_ICONS, travelModeText } from "../../../utils/travelModeIcons";
import { FilterChip } from "../../../components/theme/FilterChip";
import { AdminButton, ErrorBlock, LoadingBlock, Panel, StatusBadge, useToast } from "../../../components/admin/AdminUI";
import { BarList } from "../../../components/admin/Charts";
import { useTheme } from "../../../theme/ThemeContext";
import { RADIUS } from "../../../theme/tokens";
import { useAdminNav } from "../AdminContext";
import { SectionTitle } from "../shared";

const FEATURES: { key: keyof AppSettings["features"]; label: string; help: string }[] = [
  { key: "tripCreation", label: "Trip creation", help: "Members can create new trips. When off, the Create Trip button is hidden and the API refuses new trips." },
  { key: "travelBuddies", label: "Travel buddy requests", help: "Members can send buddy requests from Meetups and Discover." },
  { key: "aiAssistant", label: "AI Trip Assistant", help: "The assistant in Profile. When off, it's hidden and its API is closed." },
];

export function ConfigSection() {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const toast = useToast();
  const canEdit = atLeast(nav.role, "ADMIN");
  const { data, isLoading, error, refetch } = useAdminSettings();
  const analytics = useAnalytics(90);
  const save = useSaveSettings();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [newInterest, setNewInterest] = useState("");

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || (!draft && !error)) return <LoadingBlock label="Loading settings…" />;
  if (error || !draft) return <ErrorBlock message={errorMessage(error, "Couldn't load settings.")} onRetry={refetch} />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const set = (patch: Partial<AppSettings>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const toggleMode = (mode: (typeof TRAVEL_MODES)[number]) =>
    set({
      disabledTravelModes: draft.disabledTravelModes.includes(mode)
        ? draft.disabledTravelModes.filter((m) => m !== mode)
        : [...draft.disabledTravelModes, mode],
    });

  const addInterest = () => {
    const value = newInterest.trim();
    if (!value || draft.suggestedInterests.some((i) => i.toLowerCase() === value.toLowerCase())) return;
    set({ suggestedInterests: [...draft.suggestedInterests, value] });
    setNewInterest("");
  };

  const onSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast("Settings saved. Apps pick them up within a minute.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <SectionTitle
        title="Categories & Configuration"
        description="Switch features on or off, choose which travel types are offered, and manage suggestions."
        right={
          canEdit ? (
            <>
              <AdminButton label="Discard" onPress={() => setDraft(data!)} disabled={!dirty} />
              <AdminButton label="Save changes" icon="content-save-outline" variant="primary" onPress={onSave} disabled={!dirty} loading={save.isPending} />
            </>
          ) : (
            <StatusBadge label="View only. Admins can edit." icon="lock-outline" />
          )
        }
      />

      <Panel title="Features">
        {FEATURES.map((f) => (
          <View key={f.key} style={[styles.featureRow, { borderColor: colors.divider }]}>
            <View style={styles.flex1}>
              <Text style={[styles.featureLabel, { color: colors.ink }]}>{f.label}</Text>
              <Text style={[styles.help, { color: colors.muted }]}>{f.help}</Text>
            </View>
            <Switch
              value={draft.features[f.key]}
              onValueChange={(v) => set({ features: { ...draft.features, [f.key]: v } })}
              disabled={!canEdit}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel={f.label}
            />
          </View>
        ))}
      </Panel>

      <Panel title="Travel types" subtitle="Switched-off types disappear from Discover filters and the create-trip form. Existing trips keep their type.">
        <View style={styles.chips}>
          {TRAVEL_MODES.map((mode) => (
            <FilterChip
              key={mode}
              label={travelModeText(mode)}
              icon={TRAVEL_MODE_ICONS[mode]}
              active={!draft.disabledTravelModes.includes(mode)}
              onPress={() => canEdit && toggleMode(mode)}
            />
          ))}
        </View>
        <Text style={[styles.help, { color: colors.muted, marginTop: 10 }]}>
          {TRAVEL_MODES.length - draft.disabledTravelModes.length} of {TRAVEL_MODES.length} types offered
        </Text>
      </Panel>

      <View style={styles.columns}>
        <Panel title="Suggested interests" subtitle="Offered when members edit their profile." style={styles.column}>
          <View style={styles.chips}>
            {draft.suggestedInterests.map((interest) => (
              <View key={interest} style={[styles.tag, { backgroundColor: colors.primaryMuted }]}>
                <Text style={[styles.tagText, { color: colors.ink }]}>{interest}</Text>
                {canEdit && (
                  <TouchableOpacity
                    onPress={() => set({ suggestedInterests: draft.suggestedInterests.filter((i) => i !== interest) })}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${interest}`}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
          {canEdit && (
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
                value={newInterest}
                onChangeText={setNewInterest}
                onSubmitEditing={addInterest}
                placeholder="Add an interest"
                placeholderTextColor={colors.mutedLight}
                maxLength={40}
                accessibilityLabel="New interest"
              />
              <AdminButton label="Add" icon="plus" onPress={addInterest} disabled={!newInterest.trim()} />
            </View>
          )}
        </Panel>

        <Panel title="Discover banner" subtitle="An optional notice at the top of Discover. Leave empty to hide it." style={styles.column}>
          <TextInput
            style={[styles.input, styles.textarea, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
            value={draft.announcementBanner}
            onChangeText={(v) => set({ announcementBanner: v })}
            editable={canEdit}
            multiline
            maxLength={200}
            placeholder="e.g. Monsoon season: check road conditions before you travel."
            placeholderTextColor={colors.mutedLight}
            accessibilityLabel="Discover banner text"
          />
          <Text style={[styles.counter, { color: colors.mutedLight }]}>{draft.announcementBanner.length}/200</Text>
        </Panel>
      </View>

      <Panel title="Popular destinations" subtitle="Destinations are typed by organizers. These are the most used in the last 90 days.">
        <BarList items={(analytics.data?.popularDestinations ?? []).map((d) => ({ label: d.destination, value: d.trips }))} unit="trips" />
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, borderBottomWidth: 1 },
  featureLabel: { fontSize: 14.5, fontWeight: "700" },
  help: { fontSize: 12.5, marginTop: 2, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: RADIUS.pill, paddingHorizontal: 12, height: 32 },
  tagText: { fontSize: 13, fontWeight: "600" },
  addRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", fontSize: 11.5, marginTop: 4 },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  column: { flexGrow: 1, flexBasis: 320, flexShrink: 1, minWidth: 0 },
});
