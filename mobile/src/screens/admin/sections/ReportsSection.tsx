import { useState } from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  errorMessage,
  useRemoveMessage,
  useReports,
  useResolveReport,
  type AdminReport,
  type ReportReason,
  type ReportStatus,
} from "../../../api/admin";
import { AdminButton, Pagination, PersonCell, Select, SegmentTabs, StatusBadge, humanize, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useTheme } from "../../../theme/ThemeContext";
import { RADIUS } from "../../../theme/tokens";
import { useAdminNav } from "../AdminContext";
import { SectionTitle, Toolbar } from "../shared";
import { canManage } from "./UsersSection";

const REASONS: ReportReason[] = ["SPAM", "HARASSMENT", "FAKE_PROFILE", "INAPPROPRIATE_CONTENT", "SAFETY_CONCERN", "OTHER"];
const STATUS_BADGE: Record<ReportStatus, { label: string; tone: "danger" | "success" | "neutral" }> = {
  OPEN: { label: "Open", tone: "danger" },
  RESOLVED: { label: "Resolved", tone: "success" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
};

// The one reported message: never the conversation around it.
function ReportedMessageCard({ report }: { report: AdminReport }) {
  const { colors } = useTheme();
  const m = report.messageSnapshot!;
  const removed = report.message?.removedAt;
  return (
    <View style={[styles.quote, { borderColor: colors.border, backgroundColor: colors.fieldBg }]}>
      <Text style={[styles.quoteMeta, { color: colors.muted }]} numberOfLines={1}>
        {`Message in “${m.tripTitle}” · ${formatDate(m.sentAt, true)}`}
      </Text>
      {m.type === "IMAGE" && m.mediaUrl ? (
        <TouchableOpacity onPress={() => Linking.openURL(m.mediaUrl!)} accessibilityRole="link" accessibilityLabel="Open reported photo">
          <Image source={{ uri: m.mediaUrl }} style={styles.quoteImage} />
        </TouchableOpacity>
      ) : m.type === "AUDIO" && m.mediaUrl ? (
        <Text style={[styles.quoteLink, { color: colors.primary }]} onPress={() => Linking.openURL(m.mediaUrl!)} accessibilityRole="link">
          {`🎤 Play voice message (${Math.round((m.durationMs ?? 0) / 1000)}s)`}
        </Text>
      ) : (
        <Text style={[styles.quoteText, { color: colors.ink }]}>{m.content}</Text>
      )}
      {removed && <StatusBadge label={`Removed${report.message?.removedBy ? ` by ${report.message.removedBy.name}` : ""}`} tone="neutral" icon="message-minus-outline" />}
      {report.details ? <Text style={[styles.quoteNote, { color: colors.muted }]}>{`Reporter: ${report.details}`}</Text> : null}
    </View>
  );
}

export function ReportsSection() {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus>((nav.initialParams.status as ReportStatus) ?? "OPEN");
  const [reason, setReason] = useState<ReportReason | "">("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useReports({ status, reason, page });
  const resolve = useResolveReport();
  const removeMessage = useRemoveMessage();

  const removeReported = (report: AdminReport) =>
    confirm({
      title: "Remove this message?",
      message: `Everyone in “${report.messageSnapshot!.tripTitle}” will see “Message removed by Triply moderators” instead. ${report.reported.name} is notified. The report keeps a copy as evidence.`,
      confirmLabel: "Remove message",
      destructive: true,
      reasonLabel: "Reason (shown to the sender and recorded in the audit log)",
      onConfirm: async ({ reason: why }) => {
        await removeMessage.mutateAsync({ id: report.messageId!, reason: why });
        toast("Message removed");
      },
    });

  const act = (report: AdminReport, next: ReportStatus) => {
    const mayHaveSuspend =
      next === "RESOLVED" &&
      report.reported.status === "ACTIVE" &&
      !!report.reported.role &&
      canManage(nav.role, nav.myId, { id: report.reported.id, role: report.reported.role });
    confirm({
      title: next === "RESOLVED" ? "Resolve this report?" : next === "DISMISSED" ? "Dismiss this report?" : "Reopen this report?",
      message:
        next === "RESOLVED"
          ? `Mark the report about ${report.reported.name} as handled.`
          : next === "DISMISSED"
            ? "Use this when the report doesn't break the community guidelines."
            : "The report goes back into the open queue.",
      confirmLabel: next === "RESOLVED" ? "Resolve" : next === "DISMISSED" ? "Dismiss" : "Reopen",
      reasonLabel: next === "OPEN" ? undefined : "Resolution note (what you checked and decided)",
      checkboxLabel: mayHaveSuspend ? `Also suspend ${report.reported.name}` : undefined,
      destructive: false,
      onConfirm: async ({ reason: note, checked }) => {
        await resolve.mutateAsync({ id: report.id, status: next, note: note || undefined, suspendReported: checked });
        toast(checked ? `Report resolved and ${report.reported.name} suspended` : `Report ${STATUS_BADGE[next].label.toLowerCase()}`);
      },
    });
  };

  return (
    <View>
      <SectionTitle title="Reports" description="Accounts and chat messages reported by members. Review each report and take action." />
      <View style={[styles.privacy, { backgroundColor: colors.primaryMuted }]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={18} color={colors.primary} />
        <Text style={[styles.privacyText, { color: colors.ink }]}>
          Private chats are never shown here. For a reported message you see only that message, as it was when reported. Decide
          using it, the account's history and its public trips, reviews and comments.
        </Text>
      </View>
      <Toolbar>
        <SegmentTabs
          options={[
            { value: "OPEN", label: "Open" },
            { value: "RESOLVED", label: "Resolved" },
            { value: "DISMISSED", label: "Dismissed" },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Select
          label="Reason"
          value={reason}
          options={[{ value: "", label: "Any" }, ...REASONS.map((r) => ({ value: r, label: humanize(r) }))]}
          onChange={(v) => {
            setReason(v);
            setPage(1);
          }}
        />
      </Toolbar>
      <DataTable<AdminReport>
        columns={[
          {
            key: "reported",
            title: "Reported account",
            flex: 1.6,
            primary: true,
            render: (r) => (
              <PersonCell
                name={r.reported.name}
                photoUrl={r.reported.photoUrl}
                sub={`${r.reported._count.reportsReceived} report${r.reported._count.reportsReceived === 1 ? "" : "s"} total${r.reported.status === "SUSPENDED" ? " · suspended" : ""}`}
              />
            ),
          },
          { key: "reason", title: "Reason", flex: 1, render: (r) => <StatusBadge label={humanize(r.reason)} tone="warning" /> },
          {
            key: "details",
            title: "Details",
            flex: 2.4,
            render: (r) => (r.messageSnapshot ? <ReportedMessageCard report={r} /> : <CellText muted>{r.details || "No details given"}</CellText>),
          },
          { key: "by", title: "Reported by", flex: 1.2, hideOnNarrow: true, render: (r) => <CellText>{r.reporter.name}</CellText> },
          {
            key: "status",
            title: "Status",
            flex: 1.2,
            render: (r) => (
              <View style={{ gap: 4 }}>
                <StatusBadge {...STATUS_BADGE[r.status]} />
                {r.resolvedBy && <CellText muted>{`by ${r.resolvedBy.name}`}</CellText>}
              </View>
            ),
          },
          { key: "date", title: "Filed", flex: 1, render: (r) => <CellText muted>{formatDate(r.createdAt)}</CellText> },
        ]}
        rows={data?.items}
        keyOf={(r) => r.id}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error, "Couldn't load reports.") : null}
        onRetry={refetch}
        empty={{
          icon: status === "OPEN" ? "shield-check-outline" : "flag-outline",
          title: status === "OPEN" ? "No open reports" : "Nothing here yet",
          message: status === "OPEN" ? "New reports from members will appear here." : undefined,
        }}
        onRowPress={(r) => nav.openUser(r.reported.id)}
        actions={(r) =>
          r.status === "OPEN" ? (
            <>
              {r.messageId && r.messageSnapshot && !r.message?.removedAt && (
                <AdminButton label="Remove message" variant="danger" small onPress={() => removeReported(r)} />
              )}
              <AdminButton label="Resolve" variant="primary" small onPress={() => act(r, "RESOLVED")} />
              <AdminButton label="Dismiss" small onPress={() => act(r, "DISMISSED")} />
            </>
          ) : (
            <AdminButton label="Reopen" small onPress={() => act(r, "OPEN")} />
          )
        }
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: RADIUS.field, marginBottom: 12 },
  privacyText: { fontSize: 13, flex: 1, lineHeight: 18 },
  quote: { borderWidth: 1, borderLeftWidth: 3, borderRadius: RADIUS.sm, padding: 10, gap: 6, alignSelf: "stretch" },
  quoteMeta: { fontSize: 11.5, fontWeight: "600" },
  quoteText: { fontSize: 13.5, lineHeight: 19 },
  quoteLink: { fontSize: 13.5, fontWeight: "600" },
  quoteImage: { width: 140, height: 100, borderRadius: 8 },
  quoteNote: { fontSize: 12, fontStyle: "italic" },
});
