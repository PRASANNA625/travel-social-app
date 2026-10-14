import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { atLeast, downloadExport, errorMessage, useAnalytics } from "../../../api/admin";
import { travelModeText } from "../../../utils/travelModeIcons";
import { SPORT_INFO } from "../../../utils/sports";
import { DailyColumnChart, BarList } from "../../../components/admin/Charts";
import { AdminButton, ErrorBlock, LoadingBlock, Panel, SegmentTabs, StatTile, useToast } from "../../../components/admin/AdminUI";
import { useAdminNav } from "../AdminContext";
import { SectionTitle } from "../shared";

export function AnalyticsSection() {
  const nav = useAdminNav();
  const toast = useToast();
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const { data, isLoading, error, refetch, isFetching } = useAnalytics(Number(days));
  const [exporting, setExporting] = useState<string | null>(null);
  const canExport = atLeast(nav.role, "ADMIN");

  const exportCsv = async (type: "users" | "trips" | "destinations") => {
    setExporting(type);
    try {
      await downloadExport(type);
      toast("Download started");
    } catch (err) {
      toast(errorMessage(err, "Couldn't create the export."), "error");
    } finally {
      setExporting(null);
    }
  };

  const sum = (series: { count: number }[]) => series.reduce((s, d) => s + d.count, 0);

  return (
    <View style={{ gap: 16 }}>
      <SectionTitle
        title="Analytics & Reports"
        description="Growth, activity and engagement over time. Message counts only. Contents are never read."
        right={
          canExport ? (
            <>
              <AdminButton label="Users CSV" icon="download" small onPress={() => exportCsv("users")} loading={exporting === "users"} />
              <AdminButton label="Trips CSV" icon="download" small onPress={() => exportCsv("trips")} loading={exporting === "trips"} />
              <AdminButton label="Destinations CSV" icon="download" small onPress={() => exportCsv("destinations")} loading={exporting === "destinations"} />
            </>
          ) : undefined
        }
      />
      <SegmentTabs
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
        ]}
        value={days}
        onChange={setDays}
      />
      {isLoading ? (
        <LoadingBlock label="Crunching numbers…" />
      ) : error || !data ? (
        <ErrorBlock message={errorMessage(error, "Couldn't load analytics.")} onRetry={refetch} />
      ) : (
        <View style={{ gap: 16, opacity: isFetching ? 0.6 : 1 }}>
          <View style={styles.tiles}>
            <StatTile label="New users" value={sum(data.series.signups)} icon="account-plus-outline" note={`last ${data.days} days`} />
            <StatTile label="Active users" value={data.activeUsers} icon="account-clock-outline" note="seen in the app" />
            <StatTile label="Trips created" value={sum(data.series.tripsCreated)} icon="map-marker-plus-outline" />
            <StatTile label="Join requests" value={sum(data.series.joinRequests)} icon="account-arrow-right-outline" />
            <StatTile label="Messages sent" value={sum(data.series.messages)} icon="message-text-outline" />
            <StatTile label="Buddy requests" value={sum(data.series.connections)} icon="account-heart-outline" />
          </View>
          <View style={styles.columns}>
            <Panel title="User growth" subtitle="New sign-ups per day" style={styles.column}>
              <DailyColumnChart data={data.series.signups} unit="sign-ups" />
            </Panel>
            <Panel title="Trip activity" subtitle="Trips created per day" style={styles.column}>
              <DailyColumnChart data={data.series.tripsCreated} unit="trips" />
            </Panel>
            <Panel title="Engagement" subtitle="Join requests per day" style={styles.column}>
              <DailyColumnChart data={data.series.joinRequests} unit="join requests" />
            </Panel>
            <Panel title="Conversations" subtitle="Group chat messages per day" style={styles.column}>
              <DailyColumnChart data={data.series.messages} unit="messages" />
            </Panel>
          </View>
          <View style={styles.columns}>
            <Panel title="Popular destinations" subtitle="Trips created per destination" style={styles.column}>
              <BarList items={data.popularDestinations.map((d) => ({ label: d.destination, value: d.trips }))} unit="trips" />
            </Panel>
            <Panel title="Travel types" subtitle="Trips created per type" style={styles.column}>
              <BarList items={data.travelModes.map((m) => ({ label: travelModeText(m.travelMode), value: m.trips }))} unit="trips" />
            </Panel>
          </View>
          <View style={styles.columns}>
            <Panel title="Sports & activities" subtitle="Meetups created per sport" style={styles.column}>
              <BarList items={(data.sports ?? []).map((s) => ({ label: SPORT_INFO[s.sport].label, value: s.trips }))} unit="meetups" />
            </Panel>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  column: { flexGrow: 1, flexBasis: 360, flexShrink: 1, minWidth: 0 },
});
