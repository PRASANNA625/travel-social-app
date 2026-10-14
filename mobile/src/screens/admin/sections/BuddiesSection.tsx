import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { atLeast, errorMessage, useConnections, useDeleteConnection, useFlaggedAccounts, type AdminConnection, type FlaggedAccount } from "../../../api/admin";
import { SearchField } from "../../../components/theme/SearchField";
import { AdminButton, Pagination, Panel, PersonCell, SegmentTabs, StatusBadge, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useTheme } from "../../../theme/ThemeContext";
import { useAdminNav } from "../AdminContext";
import { SectionTitle, Toolbar, useDebounced } from "../shared";
import { AccountBadge, canManage, useAccountActions } from "./UsersSection";

const STATUS_BADGE = {
  PENDING: { label: "Pending", tone: "warning" as const },
  ACCEPTED: { label: "Connected", tone: "success" as const },
  REJECTED: { label: "Declined", tone: "neutral" as const },
};

export function BuddiesSection() {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const isAdmin = atLeast(nav.role, "ADMIN");
  const [status, setStatus] = useState<"" | "PENDING" | "ACCEPTED" | "REJECTED">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(search);
  const connections = useConnections({ status, search: query, page });
  const flagged = useFlaggedAccounts();
  const remove = useDeleteConnection();
  const accountActions = useAccountActions();

  const removeConnection = (c: AdminConnection) =>
    confirm({
      title: "Remove this connection?",
      message: `${c.fromUser.name} and ${c.toUser.name} will no longer be connected. Either of them can send a new request later.`,
      confirmLabel: "Remove connection",
      destructive: true,
      onConfirm: async () => {
        await remove.mutateAsync(c.id);
        toast("Connection removed");
      },
    });

  return (
    <View style={{ gap: 16 }}>
      <SectionTitle title="Travel Buddies" description="Buddy connections between members, and accounts showing suspicious patterns." />

      <Panel
        title="Accounts to review"
        subtitle="Reported two or more times (open reports), or sending 20+ buddy requests in a day."
      >
        {flagged.isLoading ? (
          <Text style={[styles.muted, { color: colors.muted }]}>Checking…</Text>
        ) : flagged.error ? (
          <Text style={[styles.muted, { color: colors.danger }]}>{errorMessage(flagged.error)}</Text>
        ) : (flagged.data ?? []).length === 0 ? (
          <View style={styles.allClear}>
            <StatusBadge label="All clear" tone="success" icon="shield-check-outline" />
            <Text style={[styles.muted, { color: colors.muted }]}>No accounts match the warning signs right now.</Text>
          </View>
        ) : (
          <DataTable<FlaggedAccount>
            columns={[
              { key: "who", title: "Account", flex: 2, primary: true, render: (u) => <PersonCell name={u.name} photoUrl={u.photoUrl} sub={u.location ?? undefined} /> },
              {
                key: "flags",
                title: "Signals",
                flex: 2,
                render: (u) => (
                  <View style={styles.flags}>
                    {u.flags.map((f) => (
                      <StatusBadge key={f} label={f} tone="warning" icon="alert-outline" />
                    ))}
                  </View>
                ),
              },
              { key: "status", title: "Status", flex: 1, render: (u) => (u.status ? <AccountBadge status={u.status} /> : null) },
            ]}
            rows={flagged.data}
            keyOf={(u) => u.id}
            empty={{ icon: "shield-check-outline", title: "All clear" }}
            onRowPress={(u) => nav.openUser(u.id)}
            actions={(u) =>
              u.status === "ACTIVE" && u.role && canManage(nav.role, nav.myId, { id: u.id, role: u.role }) ? (
                <AdminButton label="Suspend" variant="danger" small onPress={() => accountActions.suspend(u)} />
              ) : null
            }
          />
        )}
      </Panel>

      <View>
        <Toolbar>
          <SegmentTabs
            options={[
              { value: "", label: "All" },
              { value: "PENDING", label: "Pending" },
              { value: "ACCEPTED", label: "Connected" },
              { value: "REJECTED", label: "Declined" },
            ]}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
          <View style={{ flexGrow: 1, flexBasis: 220, maxWidth: 360 }}>
            <SearchField
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by member name…"
            />
          </View>
        </Toolbar>
        <DataTable<AdminConnection>
          columns={[
            {
              key: "from",
              title: "Requested by",
              flex: 1.5,
              primary: true,
              render: (c) => <PersonCell name={c.fromUser.name} photoUrl={c.fromUser.photoUrl} />,
            },
            { key: "to", title: "Sent to", flex: 1.5, render: (c) => <PersonCell name={c.toUser.name} photoUrl={c.toUser.photoUrl} /> },
            { key: "status", title: "Status", flex: 1, render: (c) => <StatusBadge {...STATUS_BADGE[c.status]} /> },
            { key: "date", title: "Requested", flex: 1, render: (c) => <CellText muted>{formatDate(c.createdAt)}</CellText> },
          ]}
          rows={connections.data?.items}
          keyOf={(c) => c.id}
          loading={connections.isLoading || connections.isFetching}
          error={connections.error ? errorMessage(connections.error) : null}
          onRetry={connections.refetch}
          empty={{ icon: "account-heart-outline", title: "No connections found" }}
          actions={isAdmin ? (c) => <AdminButton label="Remove" variant="danger" small onPress={() => removeConnection(c)} /> : undefined}
        />
        {connections.data && (
          <Pagination page={connections.data.page} pageSize={connections.data.pageSize} total={connections.data.total} onPage={setPage} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13.5 },
  allClear: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
