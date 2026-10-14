import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  atLeast,
  errorMessage,
  useAdminSettings,
  useAnnouncements,
  useAudienceSize,
  useNotificationStats,
  useSaveSettings,
  useSendAnnouncement,
  type Announcement,
  type Audience,
} from "../../../api/admin";
import { BarList } from "../../../components/admin/Charts";
import { AdminButton, Pagination, Panel, Select, StatusBadge, humanize, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useTheme } from "../../../theme/ThemeContext";
import { RADIUS } from "../../../theme/tokens";
import { useAdminNav } from "../AdminContext";
import { SectionTitle } from "../shared";

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "ALL", label: "All active members" },
  { value: "ACTIVE_30D", label: "Active in the last 30 days" },
  { value: "ORGANIZERS", label: "Trip organizers" },
  { value: "STAFF", label: "Staff only (moderators & admins)" },
];

function Composer() {
  const { colors } = useTheme();
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("STAFF");
  const size = useAudienceSize(audience);
  const send = useSendAnnouncement();
  const settings = useAdminSettings();
  const saveSettings = useSaveSettings();
  const templates = settings.data?.announcementTemplates ?? [];
  const valid = title.trim().length >= 3 && body.trim().length >= 3;

  const onSend = () =>
    confirm({
      title: "Send this announcement?",
      message: `"${title.trim()}" goes to ${size.data?.count ?? "…"} ${AUDIENCES.find((a) => a.value === audience)!.label.toLowerCase()} as an in-app notification. It can't be unsent.`,
      confirmLabel: "Send now",
      onConfirm: async () => {
        await send.mutateAsync({ title: title.trim(), body: body.trim(), audience });
        toast(`Announcement sent to ${size.data?.count ?? 0} people`);
        setTitle("");
        setBody("");
      },
    });

  const saveTemplate = async () => {
    if (!settings.data || !valid) return;
    const name = title.trim().slice(0, 40);
    const next = [...templates.filter((t) => t.name !== name), { name, title: title.trim(), body: body.trim() }].slice(-20);
    try {
      await saveSettings.mutateAsync({ ...settings.data, announcementTemplates: next });
      toast("Saved as a template");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const deleteTemplate = (name: string) =>
    confirm({
      title: `Delete the "${name}" template?`,
      message: "Announcements already sent aren't affected.",
      confirmLabel: "Delete template",
      destructive: true,
      onConfirm: async () => {
        await saveSettings.mutateAsync({ ...settings.data!, announcementTemplates: templates.filter((t) => t.name !== name) });
        toast("Template deleted");
      },
    });

  return (
    <Panel title="New announcement" subtitle="Delivered as an in-app notification to everyone in the audience.">
      {templates.length > 0 && (
        <View style={styles.templates}>
          <Text style={[styles.label, { color: colors.muted }]}>Templates</Text>
          <View style={styles.templateRow}>
            {templates.map((t) => (
              <View key={t.name} style={[styles.templateChip, { borderColor: colors.border, backgroundColor: colors.fieldBg }]}>
                <TouchableOpacity
                  onPress={() => {
                    setTitle(t.title);
                    setBody(t.body);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use template ${t.name}`}
                >
                  <Text style={[styles.templateText, { color: colors.ink }]}>{t.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTemplate(t.name)} hitSlop={8} accessibilityLabel={`Delete template ${t.name}`}>
                  <MaterialCommunityIcons name="close" size={14} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}
      <Text style={[styles.label, { color: colors.muted }]}>Title</Text>
      <TextInput
        style={[styles.input, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        placeholder="e.g. Monsoon trips are here"
        placeholderTextColor={colors.mutedLight}
        accessibilityLabel="Announcement title"
      />
      <Text style={[styles.label, { color: colors.muted }]}>Message</Text>
      <TextInput
        style={[styles.input, styles.textarea, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
        value={body}
        onChangeText={setBody}
        maxLength={500}
        multiline
        placeholder="What do members need to know?"
        placeholderTextColor={colors.mutedLight}
        accessibilityLabel="Announcement message"
      />
      <Text style={[styles.counter, { color: colors.mutedLight }]}>{body.length}/500</Text>
      <View style={styles.footer}>
        <View style={styles.audience}>
          <Select label="Audience" value={audience} options={AUDIENCES} onChange={(v) => v && setAudience(v)} />
          <StatusBadge label={size.data ? `${size.data.count.toLocaleString()} recipients` : "Counting…"} icon="account-multiple-outline" />
        </View>
        <View style={styles.actions}>
          <AdminButton label="Save as template" icon="content-save-outline" onPress={saveTemplate} disabled={!valid} loading={saveSettings.isPending} />
          <AdminButton label="Send" icon="send-outline" variant="primary" onPress={onSend} disabled={!valid || !size.data?.count} />
        </View>
      </View>
    </Panel>
  );
}

export function NotificationsSection() {
  const nav = useAdminNav();
  const canSend = atLeast(nav.role, "ADMIN");
  const [page, setPage] = useState(1);
  const history = useAnnouncements({ page });
  const stats = useNotificationStats();

  return (
    <View style={{ gap: 16 }}>
      <SectionTitle title="Notifications" description="Send system announcements and see what the app is notifying people about." />
      {canSend && <Composer />}
      <View style={styles.columns}>
        <View style={styles.wide}>
          <Panel title="Sent announcements">
            <DataTable<Announcement>
              columns={[
                {
                  key: "title",
                  title: "Announcement",
                  flex: 2.5,
                  primary: true,
                  render: (a) => (
                    <View style={{ gap: 2 }}>
                      <CellText strong>{a.title}</CellText>
                      <CellText muted>{a.body}</CellText>
                    </View>
                  ),
                },
                { key: "audience", title: "Audience", flex: 1.2, render: (a) => <CellText>{AUDIENCES.find((x) => x.value === a.audience)?.label ?? humanize(a.audience)}</CellText> },
                { key: "recipients", title: "Recipients", flex: 0.8, align: "right", render: (a) => <CellText>{a.recipientCount.toLocaleString()}</CellText> },
                { key: "sent", title: "Sent", flex: 1.2, render: (a) => <CellText muted>{`${formatDate(a.createdAt, true)}${a.createdBy ? ` · ${a.createdBy.name}` : ""}`}</CellText> },
              ]}
              rows={history.data?.items}
              keyOf={(a) => a.id}
              loading={history.isLoading}
              error={history.error ? errorMessage(history.error) : null}
              onRetry={history.refetch}
              empty={{ icon: "bullhorn-outline", title: "No announcements yet", message: canSend ? "Compose one above." : undefined }}
            />
            {history.data && <Pagination page={history.data.page} pageSize={history.data.pageSize} total={history.data.total} onPage={setPage} />}
          </Panel>
        </View>
        <View style={styles.narrow}>
          <Panel title="Notifications sent" subtitle="By type, last 30 days">
            <BarList items={(stats.data ?? []).map((s) => ({ label: humanize(s.type), value: s.count }))} unit="notifications" />
          </Panel>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  templates: { marginBottom: 8, gap: 6 },
  templateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  templateChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 12, height: 32 },
  templateText: { fontSize: 13, fontWeight: "600" },
  label: { fontSize: 12.5, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5 },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", fontSize: 11.5, marginTop: 4 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 12 },
  audience: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  wide: { flexGrow: 2, flexBasis: 480, flexShrink: 1, minWidth: 0 },
  narrow: { flexGrow: 1, flexBasis: 280, flexShrink: 1, minWidth: 0 },
});
