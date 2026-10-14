import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAudit, errorMessage, type AuditEntry } from "../../../api/admin";
import { DataTable, CellText, formatDate } from "../../../components/admin/DataTable";
import { Pagination, PersonCell, Select, StatusBadge, humanize } from "../../../components/admin/AdminUI";
import { useTheme } from "../../../theme/ThemeContext";
import { useAdminNav } from "../AdminContext";
import { SectionTitle, Toolbar } from "../shared";

const ACTION_TEXT: Record<string, string> = {
  "user.update": "edited a profile",
  "user.suspend": "suspended an account",
  "user.activate": "reactivated an account",
  "user.role_change": "changed a role",
  "trip.update": "edited a trip",
  "trip.feature": "featured a trip",
  "trip.unfeature": "unfeatured a trip",
  "trip.hide": "hid a trip",
  "trip.unhide": "restored a hidden trip",
  "trip.cancel": "cancelled a trip",
  "trip.close": "closed a trip",
  "trip.delete": "removed a trip",
  "trip.remove_participant": "removed a participant",
  "join_request.approve": "approved a join request",
  "join_request.reject": "declined a join request",
  "report.resolved": "resolved a report",
  "report.dismissed": "dismissed a report",
  "report.open": "reopened a report",
  "connection.delete": "removed a buddy connection",
  "review.delete": "removed a review",
  "comment.delete": "removed a comment",
  "message.remove": "removed a chat message",
  "feedback.status": "updated feedback status",
  "announcement.send": "sent an announcement",
  "settings.update": "changed app settings",
  "export.download": "downloaded a report",
};

export function describeAction(action: string) {
  return ACTION_TEXT[action] ?? humanize(action.replace(".", " "));
}

const TARGETS = ["USER", "TRIP", "REPORT", "REVIEW", "COMMENT", "MESSAGE", "FEEDBACK", "JOIN_REQUEST", "GROUP_MEMBER", "CONNECTION", "ANNOUNCEMENT", "SETTINGS", "EXPORT"] as const;

// Human-readable summary of an entry's details (reason, changes, role move...).
function detailText(entry: AuditEntry) {
  const d = entry.details ?? {};
  if (typeof d.reason === "string") return `Reason: ${d.reason}`;
  if (d.from && d.to) return `${humanize(String(d.from))} → ${humanize(String(d.to))}`;
  if (Array.isArray(d.changed)) return d.changed.length ? `Changed: ${d.changed.join(", ")}` : "No changes";
  if (d.changes && typeof d.changes === "object") return Object.keys(d.changes as object).join(", ");
  if (typeof d.recipients === "number") return `${d.recipients} recipients`;
  if (typeof d.type === "string") return `${d.type} export`;
  if (typeof d.note === "string") return d.note;
  return "";
}

export function AuditSection() {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState<string>("");
  const { data, isLoading, error, refetch } = useAudit({ page, pageSize: 30, targetType });

  return (
    <View>
      <SectionTitle title="Audit Log" description="Every administrative action, who took it and when. Entries can't be edited or deleted." />
      <Toolbar>
        <Select
          label="Target"
          value={targetType as (typeof TARGETS)[number] | ""}
          options={[{ value: "", label: "Any" }, ...TARGETS.map((t) => ({ value: t, label: humanize(t) }))]}
          onChange={(v) => {
            setTargetType(v);
            setPage(1);
          }}
        />
      </Toolbar>
      <DataTable
        columns={[
          {
            key: "when",
            title: "When",
            flex: 1,
            render: (a) => <CellText muted>{formatDate(a.createdAt, true)}</CellText>,
          },
          {
            key: "actor",
            title: "Admin",
            flex: 1.2,
            primary: true,
            render: (a) => <PersonCell name={a.actor?.name ?? "System (CLI)"} sub={a.actor?.role ? humanize(a.actor.role) : undefined} />,
          },
          { key: "action", title: "Action", flex: 1.4, render: (a) => <CellText strong>{describeAction(a.action)}</CellText> },
          {
            key: "target",
            title: "Target",
            flex: 1,
            render: (a) => (
              <Text
                style={[styles.link, { color: a.targetType === "USER" || a.targetType === "TRIP" ? colors.primary : colors.muted }]}
                onPress={
                  a.targetId && a.targetType === "USER"
                    ? () => nav.openUser(a.targetId!)
                    : a.targetId && a.targetType === "TRIP"
                      ? () => nav.openTrip(a.targetId!)
                      : undefined
                }
              >
                {humanize(a.targetType ?? "")}
              </Text>
            ),
          },
          { key: "details", title: "Details", flex: 2, render: (a) => <CellText muted>{detailText(a) || "—"}</CellText> },
        ]}
        rows={data?.items}
        keyOf={(a) => a.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        empty={{ icon: "history", title: "No actions recorded yet", message: "Admin actions appear here as they happen." }}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <View style={styles.note}>
        <StatusBadge label="Read-only" icon="lock-outline" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: 13.5, fontWeight: "600" },
  note: { marginTop: 12 },
});
