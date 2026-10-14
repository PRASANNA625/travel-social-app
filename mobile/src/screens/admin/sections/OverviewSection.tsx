import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useOverview, errorMessage } from "../../../api/admin";
import { DailyColumnChart } from "../../../components/admin/Charts";
import { ErrorBlock, LoadingBlock, Panel, PersonCell, StatTile, StatusBadge, humanize } from "../../../components/admin/AdminUI";
import { formatDate } from "../../../components/admin/DataTable";
import { useTheme } from "../../../theme/ThemeContext";
import { useAdminNav } from "../AdminContext";
import { SectionTitle } from "../shared";
import { describeAction } from "./AuditSection";

const TILE_GAP = 12;

export function OverviewSection() {
  const { colors } = useTheme();
  const nav = useAdminNav();
  const { data, isLoading, error, refetch } = useOverview();
  // Eight tiles on an even grid: four across, two on narrow screens.
  const [gridWidth, setGridWidth] = useState(0);
  const columns = gridWidth >= 720 ? 4 : 2;
  const tile = gridWidth ? { flexGrow: 0, flexBasis: (gridWidth - TILE_GAP * (columns - 1)) / columns, minWidth: 0 } : undefined;

  if (isLoading) return <LoadingBlock label="Loading dashboard…" />;
  if (error || !data) return <ErrorBlock message={errorMessage(error, "Couldn't load the dashboard.")} onRetry={refetch} />;
  const s = data.stats;

  return (
    <View style={styles.gap}>
      <SectionTitle title="Dashboard" description="Everything happening on Triply at a glance." />

      <View style={styles.tiles} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        <StatTile style={tile} label="Total users" value={s.totalUsers} icon="account-multiple-outline" note={`+${s.newUsers7d} in the last 7 days`} onPress={() => nav.goTo("users")} />
        <StatTile style={tile} label="Active trips" value={s.activeTrips} icon="map-marker-path" note="Open, full or underway" onPress={() => nav.goTo("trips")} />
        <StatTile style={tile} label="Upcoming events" value={s.upcomingTrips} icon="calendar-month-outline" note="Not yet started" onPress={() => nav.goTo("events")} />
        <StatTile style={tile} label="Join requests" value={s.pendingJoinRequests} icon="calendar-account-outline" note="Awaiting organizers" onPress={() => nav.goTo("events")} />
        <StatTile style={tile} label="Buddy requests" value={s.pendingConnections} icon="account-heart-outline" note="Awaiting a reply" onPress={() => nav.goTo("buddies")} />
        <StatTile
          style={tile}
          label="Open reports"
          value={s.openReports}
          icon="flag-outline"
          tone={s.openReports > 0 ? "danger" : "success"}
          note={s.openReports > 0 ? "Needs review" : "All clear"}
          onPress={() => nav.goTo("reports")}
        />
        <StatTile style={tile} label="New feedback" value={s.newFeedback} icon="message-alert-outline" tone={s.newFeedback > 0 ? "warning" : "neutral"} note="Not yet triaged" onPress={() => nav.goTo("reviews")} />
        <StatTile style={tile} label="Suspended" value={s.suspendedUsers} note="Accounts" icon="account-cancel-outline" onPress={() => nav.goTo("users", { status: "SUSPENDED" })} />
      </View>

      <View style={styles.columns}>
        <Panel title="New users" subtitle="Sign-ups per day, last 30 days" style={styles.column}>
          <DailyColumnChart data={data.series.signups} unit="sign-ups" />
        </Panel>
        <Panel title="New trips" subtitle="Trips created per day, last 30 days" style={styles.column}>
          <DailyColumnChart data={data.series.tripsCreated} unit="trips" />
        </Panel>
      </View>

      <View style={styles.columns}>
        <Panel title="Recent admin activity" style={styles.column}>
          {data.recentActivity.length === 0 ? (
            <Text style={[styles.muted, { color: colors.muted }]}>No admin actions yet.</Text>
          ) : (
            data.recentActivity.map((a) => (
              <View key={a.id} style={[styles.listRow, { borderColor: colors.divider }]}>
                <Text style={[styles.listText, { color: colors.ink }]} numberOfLines={2}>
                  <Text style={styles.bold}>{a.actor?.name ?? "System"}</Text> {describeAction(a.action)}
                </Text>
                <Text style={[styles.listMeta, { color: colors.muted }]}>{formatDate(a.createdAt, true)}</Text>
              </View>
            ))
          )}
        </Panel>
        <Panel title="Newest members" style={styles.column}>
          {data.recentUsers.map((u) => (
            <TouchableOpacity key={u.id} style={[styles.listRow, { borderColor: colors.divider }]} onPress={() => nav.openUser(u.id)}>
              <PersonCell name={u.name} photoUrl={u.photoUrl} sub={u.location ?? "Location not shared"} />
              <Text style={[styles.listMeta, { color: colors.muted }]}>{formatDate(u.createdAt)}</Text>
            </TouchableOpacity>
          ))}
        </Panel>
        <Panel title="Latest trips" style={styles.column}>
          {data.recentTrips.map((t) => (
            <TouchableOpacity key={t.id} style={[styles.listRow, { borderColor: colors.divider }]} onPress={() => nav.openTrip(t.id)}>
              <View style={styles.flexShrink}>
                <Text style={[styles.listText, styles.bold, { color: colors.ink }]} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={[styles.listMeta, { color: colors.muted }]} numberOfLines={1}>
                  {t.destination} · by {t.owner.name}
                </Text>
              </View>
              <StatusBadge label={humanize(t.status)} />
            </TouchableOpacity>
          ))}
        </Panel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  column: { flexGrow: 1, flexBasis: 320, flexShrink: 1, minWidth: 0 },
  listRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  listText: { fontSize: 13.5, flexShrink: 1 },
  listMeta: { fontSize: 12 },
  bold: { fontWeight: "700" },
  muted: { fontSize: 13.5 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
});
