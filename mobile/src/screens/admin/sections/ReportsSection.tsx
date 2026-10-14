import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { errorMessage, useReports, useResolveReport, type AdminReport, type ReportReason, type ReportStatus } from "../../../api/admin";
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
      <SectionTitle title="Reports" description="Accounts reported by members. Review each report and take action." />
      <View style={[styles.privacy, { backgroundColor: colors.primaryMuted }]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={18} color={colors.primary} />
        <Text style={[styles.privacyText, { color: colors.ink }]}>
          Private chats are never shown here. Decide using the report, the account's history and its public trips, reviews and
          comments.
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
          { key: "details", title: "Details", flex: 2, render: (r) => <CellText muted>{r.details || "No details given"}</CellText> },
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
});
