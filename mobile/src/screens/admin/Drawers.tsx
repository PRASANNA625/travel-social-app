import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  atLeast,
  errorMessage,
  useAdminTrip,
  useAdminUser,
  useDecideJoinRequest,
  useDeleteTrip,
  useRemoveParticipant,
  useUpdateTrip,
  useUpdateUser,
  type AdminTripDetail,
} from "../../api/admin";
import { TRAVEL_MODES, type TravelMode, type TripStatus } from "../../types";
import { travelModeText } from "../../utils/travelModeIcons";
import { AdminButton, Avatar, ErrorBlock, LoadingBlock, PersonCell, Select, StatusBadge, humanize, useConfirm, useToast } from "../../components/admin/AdminUI";
import { formatDate } from "../../components/admin/DataTable";
import { useTheme } from "../../theme/ThemeContext";
import { FONT, RADIUS, SHADOW } from "../../theme/tokens";
import { useAdminNav } from "./AdminContext";
import { AccountBadge, RoleBadge, canManage, useAccountActions } from "./sections/UsersSection";
import { TripFlags, TripStatusBadge } from "./sections/TripsSection";
import { describeAction } from "./sections/AuditSection";

// Side panel on wide screens, full screen on phones.
function Drawer({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const full = width < 720;
  return (
    <Modal visible={visible} transparent animationType={full ? "slide" : "fade"} onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: full ? colors.surface : colors.overlay }]}>
        {!full && <Pressable style={styles.flex1} onPress={onClose} accessibilityLabel="Close panel" />}
        <View style={[styles.drawer, full ? styles.drawerFull : styles.drawerSide, { backgroundColor: colors.surface }]}>
          <View style={[styles.drawerHeader, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.drawerTitle, { color: colors.ink }]} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.close, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Close">
              <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.drawerBody}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Block({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={styles.blockHead}>
        <Text style={[styles.blockTitle, { color: colors.ink }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={[styles.fieldValue, { color: colors.ink }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function Input({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

function History({ entries }: { entries: { id: string; action: string; createdAt: string; actor: { name: string } | null }[] }) {
  const { colors } = useTheme();
  if (entries.length === 0) return <Text style={[styles.muted, { color: colors.muted }]}>No admin actions yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {entries.map((e) => (
        <Text key={e.id} style={[styles.historyText, { color: colors.ink }]}>
          <Text style={{ fontWeight: "700" }}>{e.actor?.name ?? "System"}</Text> {describeAction(e.action)}
          <Text style={{ color: colors.muted }}> · {formatDate(e.createdAt, true)}</Text>
        </Text>
      ))}
    </View>
  );
}

// --- User ------------------------------------------------------------------------------

export function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const toast = useToast();
  const { data: user, isLoading, error, refetch } = useAdminUser(userId);
  const update = useUpdateUser();
  const actions = useAccountActions();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", bio: "" });

  useEffect(() => {
    if (user) setForm({ name: user.name, location: user.location ?? "", bio: user.bio ?? "" });
    setEditing(false);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const manageable = !!user && canManage(nav.role, nav.myId, user);
  const canEdit = manageable && atLeast(nav.role, "ADMIN");

  const saveProfile = async () => {
    if (!user) return;
    try {
      await update.mutateAsync({ id: user.id, name: form.name.trim(), location: form.location.trim() || null, bio: form.bio.trim() || null });
      setEditing(false);
      toast("Profile updated");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <Drawer visible={!!userId} title="Member details" onClose={onClose}>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !user ? (
        <ErrorBlock message={errorMessage(error, "Couldn't load this member.")} onRetry={refetch} />
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Avatar name={user.name} photoUrl={user.photoUrl} size={64} />
            <View style={styles.flex1}>
              <Text style={[styles.heroName, { color: colors.ink }]}>{user.name}</Text>
              <View style={styles.badges}>
                <RoleBadge role={user.role} />
                <AccountBadge status={user.status} />
              </View>
            </View>
          </View>
          {user.status === "SUSPENDED" && (
            <View style={[styles.notice, { backgroundColor: colors.dangerBg }]}>
              <MaterialCommunityIcons name="cancel" size={18} color={colors.danger} />
              <Text style={[styles.noticeText, { color: colors.ink }]}>
                Suspended {formatDate(user.suspendedAt, true)}
                {user.suspendedReason ? `: ${user.suspendedReason}` : ""}
              </Text>
            </View>
          )}
          {manageable && (
            <View style={styles.actionRow}>
              {user.status === "ACTIVE" ? (
                <AdminButton label="Suspend account" icon="account-cancel-outline" variant="danger" onPress={() => actions.suspend(user)} />
              ) : (
                <AdminButton label="Reactivate account" icon="account-check-outline" variant="primary" onPress={() => actions.activate(user)} />
              )}
              {canEdit && !editing && <AdminButton label="Edit profile" icon="pencil-outline" onPress={() => setEditing(true)} />}
            </View>
          )}

          {editing ? (
            <Block title="Edit profile">
              <Input label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              <Input label="Location" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
              <Input label="Bio" value={form.bio} onChange={(v) => setForm((f) => ({ ...f, bio: v }))} multiline />
              <View style={styles.actionRow}>
                <AdminButton label="Cancel" onPress={() => setEditing(false)} />
                <AdminButton label="Save" variant="primary" onPress={saveProfile} loading={update.isPending} disabled={!form.name.trim()} />
              </View>
            </Block>
          ) : (
            <Block title="Profile">
              <Field label="Email" value={user.email ?? "—"} />
              <Field label="Phone" value={user.phone ?? "—"} />
              <Field label="Location" value={user.location ?? "—"} />
              <Field label="Bio" value={user.bio ?? "—"} />
              <Field label="Interests" value={user.interests.length ? user.interests.join(", ") : "—"} />
              <Field label="Travel styles" value={user.preferredModes.length ? user.preferredModes.map(travelModeText).join(", ") : "—"} />
              <Field label="Joined" value={formatDate(user.createdAt)} />
              <Field label="Last seen" value={formatDate(user.lastSeenAt, true)} />
            </Block>
          )}

          <Block title={`Reports against them (${user.reportsReceived.length})`} right={<StatusBadge label={`Filed ${user.reportsMadeCount}`} />}>
            {user.reportsReceived.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted }]}>No reports.</Text>
            ) : (
              user.reportsReceived.map((r) => (
                <View key={r.id} style={[styles.listRow, { borderColor: colors.divider }]}>
                  <View style={styles.flex1}>
                    <Text style={[styles.listTitle, { color: colors.ink }]}>{humanize(r.reason)}</Text>
                    <Text style={[styles.muted, { color: colors.muted }]} numberOfLines={2}>
                      {r.details || "No details"} · by {r.reporter.name} · {formatDate(r.createdAt)}
                    </Text>
                  </View>
                  <StatusBadge label={humanize(r.status)} tone={r.status === "OPEN" ? "danger" : "neutral"} />
                </View>
              ))
            )}
          </Block>

          <Block title={`Trips organized (${user._count.trips})`}>
            {user.trips.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted }]}>No trips.</Text>
            ) : (
              user.trips.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.listRow, { borderColor: colors.divider }]} onPress={() => nav.openTrip(t.id)}>
                  <View style={styles.flex1}>
                    <Text style={[styles.listTitle, { color: colors.ink }]} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={[styles.muted, { color: colors.muted }]}>
                      {t.destination} · {formatDate(t.startDate)}
                    </Text>
                  </View>
                  <TripStatusBadge status={t.status} />
                </TouchableOpacity>
              ))
            )}
          </Block>

          <Block title="Admin history">
            <History entries={user.auditTrail} />
          </Block>
        </>
      )}
    </Drawer>
  );
}

// --- Trip / event ---------------------------------------------------------------------------

const STATUSES: TripStatus[] = ["PLANNING", "OPEN", "ALMOST_FULL", "FULL", "STARTED", "COMPLETED", "CANCELLED"];

function TripEditor({ trip, onDone }: { trip: AdminTripDetail; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdateTrip();
  const [form, setForm] = useState({
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate.slice(0, 10),
    endDate: trip.endDate.slice(0, 10),
    travelMode: trip.travelMode as TravelMode,
    status: trip.status as TripStatus,
  });
  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(form.endDate);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: trip.id,
        title: form.title.trim(),
        destination: form.destination.trim(),
        startDate: new Date(`${form.startDate}T00:00:00Z`).toISOString(),
        endDate: new Date(`${form.endDate}T00:00:00Z`).toISOString(),
        travelMode: form.travelMode,
        status: form.status,
      });
      toast("Trip updated");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <Block title="Edit trip">
      <Input label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
      <Input label="Destination" value={form.destination} onChange={(v) => setForm((f) => ({ ...f, destination: v }))} />
      <View style={styles.twoCol}>
        <View style={styles.flex1}>
          <Input label="Start date (YYYY-MM-DD)" value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
        </View>
        <View style={styles.flex1}>
          <Input label="End date (YYYY-MM-DD)" value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
        </View>
      </View>
      <View style={styles.actionRow}>
        <Select label="Type" value={form.travelMode} options={TRAVEL_MODES.map((m) => ({ value: m, label: travelModeText(m) }))} onChange={(v) => v && setForm((f) => ({ ...f, travelMode: v }))} />
        <Select label="Status" value={form.status} options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))} onChange={(v) => v && setForm((f) => ({ ...f, status: v }))} />
      </View>
      <View style={styles.actionRow}>
        <AdminButton label="Cancel" onPress={onDone} />
        <AdminButton label="Save" variant="primary" onPress={save} loading={update.isPending} disabled={!form.title.trim() || !form.destination.trim() || !datesValid} />
      </View>
    </Block>
  );
}

export function TripDrawer({ tripId, onClose }: { tripId: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const isAdmin = atLeast(nav.role, "ADMIN");
  const { data: trip, isLoading, error, refetch } = useAdminTrip(tripId);
  const update = useUpdateTrip();
  const remove = useDeleteTrip();
  const decide = useDecideJoinRequest();
  const removeParticipant = useRemoveParticipant();
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [tripId]);

  const flag = async (field: "featured" | "hidden") => {
    if (!trip) return;
    try {
      await update.mutateAsync({ id: trip.id, [field]: !trip[field] });
      toast(field === "featured" ? (trip.featured ? "Removed from featured" : "Trip featured") : trip.hidden ? "Trip is visible again" : "Trip hidden");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const setStatus = (status: TripStatus, verb: string) =>
    trip &&
    confirm({
      title: `${verb} "${trip.title}"?`,
      message: status === "CANCELLED" ? "The trip stops accepting participants and shows as cancelled." : "The trip is marked as completed.",
      confirmLabel: verb,
      destructive: status === "CANCELLED",
      onConfirm: async () => {
        await update.mutateAsync({ id: trip.id, status });
        toast(`Trip ${status === "CANCELLED" ? "cancelled" : "closed"}`);
      },
    });

  const deleteTrip = () =>
    trip &&
    confirm({
      title: `Delete "${trip.title}"?`,
      message: "The trip, its group chat, requests, comments and reviews are deleted permanently. The organizer is notified.",
      confirmLabel: "Delete trip",
      destructive: true,
      reasonLabel: "Reason (shown to the organizer and kept in the audit log)",
      onConfirm: async ({ reason }) => {
        await remove.mutateAsync({ id: trip.id, reason });
        toast("Trip deleted");
        onClose();
      },
    });

  const decideRequest = async (id: string, approve: boolean, name: string) => {
    try {
      await decide.mutateAsync({ id, approve });
      toast(approve ? `${name} approved` : `${name} declined`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const kick = (userId: string, name: string) =>
    trip &&
    confirm({
      title: `Remove ${name} from this trip?`,
      message: "They leave the group chat, their seat opens up, and they're notified.",
      confirmLabel: "Remove participant",
      destructive: true,
      reasonLabel: "Reason (recorded in the audit log)",
      onConfirm: async ({ reason }) => {
        await removeParticipant.mutateAsync({ tripId: trip.id, userId, reason });
        toast(`${name} removed`);
      },
    });

  const pending = trip?.joinRequests.filter((r) => r.status === "PENDING") ?? [];

  return (
    <Drawer visible={!!tripId} title="Trip details" onClose={onClose}>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !trip ? (
        <ErrorBlock message={errorMessage(error, "Couldn't load this trip.")} onRetry={refetch} />
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.flex1}>
              <Text style={[styles.heroName, { color: colors.ink }]}>{trip.title}</Text>
              <Text style={[styles.muted, { color: colors.muted }]}>
                {trip.startLocation} → {trip.destination} · {travelModeText(trip.travelMode)}
              </Text>
              <View style={[styles.badges, { marginTop: 8 }]}>
                <TripStatusBadge status={trip.status} />
                <TripFlags trip={trip} />
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            {isAdmin && <AdminButton label={trip.featured ? "Unfeature" : "Feature"} icon={trip.featured ? "star" : "star-outline"} onPress={() => flag("featured")} />}
            <AdminButton label={trip.hidden ? "Unhide" : "Hide"} icon={trip.hidden ? "eye-outline" : "eye-off-outline"} onPress={() => flag("hidden")} />
            {isAdmin && !editing && <AdminButton label="Edit" icon="pencil-outline" onPress={() => setEditing(true)} />}
            {isAdmin && trip.status !== "COMPLETED" && trip.status !== "CANCELLED" && (
              <>
                <AdminButton label="Close" icon="flag-checkered" onPress={() => setStatus("COMPLETED", "Close")} />
                <AdminButton label="Cancel trip" icon="calendar-remove-outline" variant="danger" onPress={() => setStatus("CANCELLED", "Cancel")} />
              </>
            )}
            {isAdmin && <AdminButton label="Delete" icon="trash-can-outline" variant="danger" onPress={deleteTrip} />}
          </View>

          {editing ? (
            <TripEditor trip={trip} onDone={() => setEditing(false)} />
          ) : (
            <Block title="Details">
              <TouchableOpacity onPress={() => nav.openUser(trip.owner.id)}>
                <Field label="Organizer" value={<PersonCell name={trip.owner.name} photoUrl={trip.owner.photoUrl} />} />
              </TouchableOpacity>
              <Field label="Dates" value={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`} />
              <Field label="Seats" value={`${trip.seatsFilled} of ${trip.seats} filled`} />
              <Field label="Joining" value={humanize(trip.joinType)} />
              <Field label="Budget" value={trip.budget ? `₹${trip.budget.toLocaleString()}` : "—"} />
              <Field label="Engagement" value={`${trip._count.likes} likes · ${trip._count.comments} comments · ${trip._count.reviews} reviews`} />
              <Field label="Description" value={trip.description || "—"} />
            </Block>
          )}

          <Block title={`Join requests (${pending.length} pending)`}>
            {trip.joinRequests.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted }]}>No requests yet.</Text>
            ) : (
              trip.joinRequests.map((r) => (
                <View key={r.id} style={[styles.listRow, { borderColor: colors.divider }]}>
                  <View style={styles.flex1}>
                    <PersonCell name={r.user.name} photoUrl={r.user.photoUrl} sub={r.message ? `"${r.message}"` : formatDate(r.createdAt)} />
                  </View>
                  {r.status === "PENDING" && isAdmin ? (
                    <View style={styles.inlineActions}>
                      <AdminButton label="Decline" small onPress={() => decideRequest(r.id, false, r.user.name)} />
                      <AdminButton label="Approve" variant="primary" small onPress={() => decideRequest(r.id, true, r.user.name)} />
                    </View>
                  ) : (
                    <StatusBadge label={humanize(r.status)} tone={r.status === "APPROVED" ? "success" : r.status === "PENDING" ? "warning" : "neutral"} />
                  )}
                </View>
              ))
            )}
          </Block>

          <Block title={`Participants (${trip.group?.members.length ?? 0})`}>
            {!trip.group || trip.group.members.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted }]}>No participants yet.</Text>
            ) : (
              trip.group.members.map((m) => (
                <View key={m.user.id} style={[styles.listRow, { borderColor: colors.divider }]}>
                  <TouchableOpacity style={styles.flex1} onPress={() => nav.openUser(m.user.id)}>
                    <PersonCell name={m.user.name} photoUrl={m.user.photoUrl} sub={m.role === "OWNER" ? "Organizer" : `Joined ${formatDate(m.joinedAt)}`} />
                  </TouchableOpacity>
                  {m.role !== "OWNER" && isAdmin && <AdminButton label="Remove" variant="danger" small onPress={() => kick(m.user.id, m.user.name)} />}
                </View>
              ))
            )}
          </Block>

          <Block title="Admin history">
            <History entries={trip.auditTrail} />
          </Block>
        </>
      )}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  flex1: { flex: 1, minWidth: 0 },
  drawer: { ...SHADOW.raised },
  drawerSide: { width: 520, maxWidth: "100%", height: "100%" },
  drawerFull: { flex: 1 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  drawerTitle: { ...FONT.screenTitle, fontSize: 18, flexShrink: 1 },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  drawerBody: { padding: 16, gap: 12, paddingBottom: 40 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: RADIUS.card, borderWidth: 1 },
  heroName: { ...FONT.screenTitle },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 6 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: RADIUS.field },
  noticeText: { fontSize: 13.5, flex: 1 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inlineActions: { flexDirection: "row", gap: 6 },
  block: { borderWidth: 1, borderRadius: RADIUS.card, padding: 14, gap: 10 },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  blockTitle: { ...FONT.cardTitle, fontSize: 15 },
  field: { gap: 2 },
  fieldLabel: { fontSize: 12, fontWeight: "700" },
  fieldValue: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1 },
  listTitle: { fontSize: 14, fontWeight: "600" },
  muted: { fontSize: 13 },
  historyText: { fontSize: 13, lineHeight: 18 },
});
