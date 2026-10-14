import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { errorMessage, useAdminUsers, useSetRole, useStaff, type AdminUser, type UserRole } from "../../../api/admin";
import { SearchField } from "../../../components/theme/SearchField";
import { AdminButton, Panel, PersonCell, Select, StatusBadge, humanize, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useTheme } from "../../../theme/ThemeContext";
import { useAdminNav } from "../AdminContext";
import { SectionTitle, useDebounced } from "../shared";
import { RoleBadge } from "./UsersSection";

const ROLES: UserRole[] = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"];

// What each role can do. Mirrors the checks in backend/src/modules/admin/admin.routes.ts.
const CAPABILITIES: { label: string; min: UserRole }[] = [
  { label: "View dashboard, users, trips, events, analytics", min: "MODERATOR" },
  { label: "Resolve reports and feedback", min: "MODERATOR" },
  { label: "Hide trips, remove reviews and comments", min: "MODERATOR" },
  { label: "Suspend and reactivate regular members", min: "MODERATOR" },
  { label: "Edit member profiles and trips", min: "ADMIN" },
  { label: "Feature, close, cancel or delete trips", min: "ADMIN" },
  { label: "Approve requests and remove participants", min: "ADMIN" },
  { label: "Suspend moderators", min: "ADMIN" },
  { label: "Send announcements, change settings", min: "ADMIN" },
  { label: "Download exports, view audit log", min: "ADMIN" },
  { label: "Assign roles, manage admins", min: "SUPER_ADMIN" },
];

const RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

function PermissionMatrix() {
  const { colors } = useTheme();
  const cols: UserRole[] = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];
  return (
    <View style={[styles.matrix, { borderColor: colors.border }]}>
      <View style={[styles.matrixRow, { backgroundColor: colors.fieldBg, borderColor: colors.border }]}>
        <Text style={[styles.matrixHead, styles.matrixLabel, { color: colors.muted }]}>Capability</Text>
        {cols.map((c) => (
          <Text key={c} style={[styles.matrixHead, styles.matrixCell, { color: colors.muted }]}>
            {humanize(c)}
          </Text>
        ))}
      </View>
      {CAPABILITIES.map((cap) => (
        <View key={cap.label} style={[styles.matrixRow, { borderColor: colors.divider }]}>
          <Text style={[styles.matrixLabel, styles.matrixText, { color: colors.ink }]}>{cap.label}</Text>
          {cols.map((c) => {
            const yes = RANK[c] >= RANK[cap.min];
            return (
              <View key={c} style={styles.matrixCell} accessibilityLabel={`${humanize(c)}: ${yes ? "allowed" : "not allowed"}`}>
                <MaterialCommunityIcons name={yes ? "check-circle" : "minus"} size={18} color={yes ? colors.primary : colors.mutedLight} />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function RolesSection() {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const isSuper = nav.role === "SUPER_ADMIN";
  const staff = useStaff();
  const setRole = useSetRole();
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const candidates = useAdminUsers({ search: query, role: "USER", pageSize: 5 });

  const changeRole = (user: AdminUser, role: UserRole) => {
    if (role === user.role) return;
    confirm({
      title: `Make ${user.name} ${role === "USER" ? "a regular member" : `a ${humanize(role)}`}?`,
      message:
        role === "USER"
          ? "They lose access to the admin dashboard immediately."
          : `They get ${humanize(role)} access to the admin dashboard immediately.`,
      confirmLabel: "Change role",
      destructive: RANK[role] < RANK[user.role],
      onConfirm: async () => {
        await setRole.mutateAsync({ id: user.id, role });
        toast(`${user.name} is now ${role === "USER" ? "a regular member" : humanize(role)}`);
      },
    });
  };

  return (
    <View style={{ gap: 16 }}>
      <SectionTitle title="Roles & Permissions" description="Who can do what in the admin dashboard. Every rule is enforced by the server." />
      <View style={styles.columns}>
        <Panel title="Staff" subtitle={isSuper ? "Change a role from the list." : "Only Super Admins can change roles."} style={styles.wide}>
          <DataTable<AdminUser>
            columns={[
              { key: "who", title: "Member", flex: 2, primary: true, render: (u) => <PersonCell name={u.name} photoUrl={u.photoUrl} sub={u.email ?? undefined} /> },
              {
                key: "role",
                title: "Role",
                flex: 1.6,
                render: (u) =>
                  isSuper && u.id !== nav.myId ? (
                    <Select label="Role" value={u.role} options={ROLES.map((r) => ({ value: r, label: humanize(r) }))} onChange={(v) => v && changeRole(u, v)} />
                  ) : (
                    <RoleBadge role={u.role} />
                  ),
              },
              { key: "since", title: "Member since", flex: 1, hideOnNarrow: true, render: (u) => <CellText muted>{formatDate(u.createdAt)}</CellText> },
            ]}
            rows={staff.data}
            keyOf={(u) => u.id}
            loading={staff.isLoading}
            error={staff.error ? errorMessage(staff.error) : null}
            onRetry={staff.refetch}
            empty={{ icon: "shield-account-outline", title: "No staff yet" }}
            onRowPress={(u) => nav.openUser(u.id)}
          />
        </Panel>
        <Panel title="Permissions by role" style={styles.narrow}>
          <PermissionMatrix />
        </Panel>
      </View>

      {isSuper && (
        <Panel title="Add staff" subtitle="Find a member and give them dashboard access.">
          <SearchField value={search} onChangeText={setSearch} placeholder="Search members by name or email…" />
          <View style={{ marginTop: 12 }}>
            {query.trim().length < 2 ? (
              <Text style={[styles.hint, { color: colors.muted }]}>Type at least two characters.</Text>
            ) : (
              <DataTable<AdminUser>
                columns={[
                  { key: "who", title: "Member", flex: 2, primary: true, render: (u) => <PersonCell name={u.name} photoUrl={u.photoUrl} sub={u.email ?? u.location ?? undefined} /> },
                  { key: "status", title: "Status", flex: 1, render: (u) => <StatusBadge label={humanize(u.status)} tone={u.status === "ACTIVE" ? "success" : "danger"} /> },
                ]}
                rows={candidates.data?.items}
                keyOf={(u) => u.id}
                loading={candidates.isLoading}
                error={candidates.error ? errorMessage(candidates.error) : null}
                empty={{ icon: "account-search-outline", title: "No regular members match" }}
                actions={(u) => (
                  <>
                    <AdminButton label="Moderator" small onPress={() => changeRole(u, "MODERATOR")} />
                    <AdminButton label="Admin" small onPress={() => changeRole(u, "ADMIN")} />
                  </>
                )}
              />
            )}
          </View>
        </Panel>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  wide: { flexGrow: 3, flexBasis: 480, flexShrink: 1, minWidth: 0 },
  narrow: { flexGrow: 2, flexBasis: 340, flexShrink: 1, minWidth: 0 },
  matrix: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  matrixRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingVertical: 8, paddingHorizontal: 10 },
  matrixHead: { fontSize: 11.5, fontWeight: "700", textTransform: "uppercase" },
  matrixLabel: { flex: 2.4 },
  matrixText: { fontSize: 13 },
  matrixCell: { flex: 1, alignItems: "center", textAlign: "center" },
  hint: { fontSize: 13 },
});
