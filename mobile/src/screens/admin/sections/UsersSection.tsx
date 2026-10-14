import { useState } from "react";
import { View } from "react-native";
import {
  ROLE_RANK,
  errorMessage,
  useActivateUser,
  useAdminUsers,
  useBulkUsers,
  useSuspendUser,
  type AccountStatus,
  type AdminUser,
  type UserRole,
} from "../../../api/admin";
import { SearchField } from "../../../components/theme/SearchField";
import { AdminButton, Pagination, PersonCell, Select, StatusBadge, humanize, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useAdminNav } from "../AdminContext";
import { BulkBar, SectionTitle, Toolbar, useDebounced, useSelection } from "../shared";

const ROLES: UserRole[] = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"];

// Mirrors the backend rule: you manage accounts ranked below you (Super Admins:
// anyone but themselves).
export function canManage(actorRole: UserRole, actorId: string, target: { id: string; role: UserRole }) {
  if (target.id === actorId) return false;
  return actorRole === "SUPER_ADMIN" || ROLE_RANK[target.role] < ROLE_RANK[actorRole];
}

export function RoleBadge({ role }: { role: UserRole }) {
  if (role === "USER") return <StatusBadge label="User" />;
  return <StatusBadge label={humanize(role)} tone="info" icon="shield-account-outline" />;
}

export function AccountBadge({ status }: { status: AccountStatus }) {
  return status === "ACTIVE" ? (
    <StatusBadge label="Active" tone="success" icon="check-circle-outline" />
  ) : (
    <StatusBadge label="Suspended" tone="danger" icon="cancel" />
  );
}

// Suspend / reactivate with confirmation, reason and feedback. Shared with the user drawer.
export function useAccountActions() {
  const confirm = useConfirm();
  const toast = useToast();
  const suspend = useSuspendUser();
  const activate = useActivateUser();
  return {
    suspend: (user: { id: string; name: string }) =>
      confirm({
        title: `Suspend ${user.name}?`,
        message: "They'll be signed out right away and can't use Triply until reactivated. Their trips and messages stay as they are.",
        confirmLabel: "Suspend account",
        destructive: true,
        reasonLabel: "Reason (recorded in the audit log)",
        onConfirm: async ({ reason }) => {
          await suspend.mutateAsync({ id: user.id, reason });
          toast(`${user.name} was suspended`);
        },
      }),
    activate: (user: { id: string; name: string }) =>
      confirm({
        title: `Reactivate ${user.name}?`,
        message: "They'll be able to sign in and use Triply again.",
        confirmLabel: "Reactivate",
        onConfirm: async () => {
          await activate.mutateAsync(user.id);
          toast(`${user.name} was reactivated`);
        },
      }),
  };
}

export function UsersSection() {
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState(nav.initialParams.search ?? "");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<AccountStatus | "">((nav.initialParams.status as AccountStatus) ?? "");
  const [page, setPage] = useState(1);
  const query = useDebounced(search);
  const { data, isLoading, error, refetch, isFetching } = useAdminUsers({ search: query, role, status, page });
  const selection = useSelection();
  const bulk = useBulkUsers();
  const actions = useAccountActions();

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    selection.clear();
  };

  const runBulk = (action: "suspend" | "activate") => {
    const ids = [...selection.selected];
    confirm({
      title: action === "suspend" ? `Suspend ${ids.length} accounts?` : `Reactivate ${ids.length} accounts?`,
      message:
        action === "suspend"
          ? "Accounts you're not allowed to manage (your own, or equal or higher roles) are skipped."
          : "Selected suspended accounts will be able to sign in again.",
      confirmLabel: action === "suspend" ? "Suspend accounts" : "Reactivate",
      destructive: action === "suspend",
      reasonLabel: action === "suspend" ? "Reason (recorded in the audit log)" : undefined,
      onConfirm: async ({ reason }) => {
        const res = await bulk.mutateAsync({ ids, action, reason: reason || undefined });
        const skipped = ids.length - res.succeeded;
        toast(`${res.succeeded} updated${skipped ? `, ${skipped} skipped` : ""}`, skipped && !res.succeeded ? "error" : "success");
        selection.clear();
      },
    });
  };

  return (
    <View>
      <SectionTitle title="Users" description="Find, review and manage member accounts." />
      <Toolbar>
        <View style={{ flexGrow: 1, flexBasis: 260, maxWidth: 420 }}>
          <SearchField value={search} onChangeText={resetPage(setSearch)} placeholder="Search name, email, phone or city…" />
        </View>
        <Select label="Role" value={role} options={[{ value: "", label: "Any" }, ...ROLES.map((r) => ({ value: r, label: humanize(r) }))]} onChange={resetPage(setRole)} />
        <Select
          label="Status"
          value={status}
          options={[
            { value: "", label: "Any" },
            { value: "ACTIVE", label: "Active" },
            { value: "SUSPENDED", label: "Suspended" },
          ]}
          onChange={resetPage(setStatus)}
        />
      </Toolbar>
      <BulkBar count={selection.selected.size} onClear={selection.clear}>
        <AdminButton label="Suspend" icon="account-cancel-outline" variant="danger" small onPress={() => runBulk("suspend")} />
        <AdminButton label="Reactivate" icon="account-check-outline" small onPress={() => runBulk("activate")} />
      </BulkBar>
      <DataTable<AdminUser>
        columns={[
          {
            key: "name",
            title: "Member",
            flex: 2,
            primary: true,
            render: (u) => <PersonCell name={u.name} photoUrl={u.photoUrl} sub={u.email ?? u.phone ?? "No contact on file"} />,
          },
          { key: "location", title: "Location", flex: 1, render: (u) => <CellText muted>{u.location ?? "—"}</CellText> },
          { key: "role", title: "Role", flex: 1, render: (u) => <RoleBadge role={u.role} /> },
          { key: "status", title: "Status", flex: 1, render: (u) => <AccountBadge status={u.status} /> },
          { key: "trips", title: "Trips", flex: 0.6, align: "right", render: (u) => <CellText>{u._count.trips}</CellText> },
          {
            key: "reports",
            title: "Reports",
            flex: 0.7,
            align: "right",
            render: (u) =>
              u._count.reportsReceived > 0 ? <StatusBadge label={String(u._count.reportsReceived)} tone="warning" icon="flag-outline" /> : <CellText muted>0</CellText>,
          },
          { key: "joined", title: "Joined", flex: 1, hideOnNarrow: true, render: (u) => <CellText muted>{formatDate(u.createdAt)}</CellText> },
        ]}
        rows={data?.items}
        keyOf={(u) => u.id}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error, "Couldn't load users.") : null}
        onRetry={refetch}
        empty={{ icon: "account-search-outline", title: "No users found", message: "Try a different search or clear the filters." }}
        onRowPress={(u) => nav.openUser(u.id)}
        selected={selection.selected}
        onToggleSelect={selection.toggle}
        onToggleAll={selection.toggleAll}
        actions={(u) =>
          canManage(nav.role, nav.myId, u) ? (
            u.status === "ACTIVE" ? (
              <AdminButton label="Suspend" variant="danger" small onPress={() => actions.suspend(u)} />
            ) : (
              <AdminButton label="Reactivate" small onPress={() => actions.activate(u)} />
            )
          ) : null
        }
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}
