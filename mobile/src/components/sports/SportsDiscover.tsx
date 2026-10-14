import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTrips } from "../../api/trips";
import { SKILL_LEVELS, SPORTS, type SkillLevel, type Sport, type Trip } from "../../types";
import { useTheme } from "../../theme/ThemeContext";
import { gridColumnsFor, toRows } from "../../theme/layout";
import { getCurrentLocationOrThrow } from "../../utils/currentLocation";
import { Alert } from "../../utils/alert";
import { SKILL_LABELS, SPORT_INFO } from "../../utils/sports";
import { FilterChip } from "../theme/FilterChip";
import { SelectChip } from "../theme/SelectChip";
import { EmptyState } from "../theme/EmptyState";
import { PrimaryButton } from "../theme/PrimaryButton";
import { TripCardSkeleton } from "../TripCardSkeleton";
import { SportCard } from "./SportCard";
import { InviteBuddiesModal } from "./InviteBuddiesModal";

type When = "today" | "tomorrow" | "week" | "weekend";
const WHEN_OPTIONS: { value: When | ""; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "Next 7 days" },
  { value: "weekend", label: "This weekend" },
];
const NEAR_ME_RADIUS_KM = 25;
const PAGE = 12;

// Local-day ranges for the "When" filter.
function rangeFor(when: When) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const at = (offsetDays: number) => new Date(start.getTime() + offsetDays * day);
  switch (when) {
    case "today":
      return { from: new Date(), to: at(1) };
    case "tomorrow":
      return { from: at(1), to: at(2) };
    case "week":
      return { from: new Date(), to: at(7) };
    case "weekend": {
      const dow = start.getDay(); // 0 Sun ... 6 Sat
      const toSat = dow === 0 ? -1 : 6 - dow;
      return { from: dow === 0 || dow === 6 ? new Date() : at(toSat), to: at(toSat + 2) };
    }
  }
}

// Discover's Sports view: filter sports meetups and join or invite from the cards.
export function SportsDiscover({
  search,
  contentWidth,
  gutter,
  onOpen,
  onCreate,
  onFindBuddies,
}: {
  search: string;
  contentWidth: number;
  gutter: number;
  onOpen: (trip: Trip) => void;
  onCreate?: () => void;
  onFindBuddies: () => void;
}) {
  const { colors } = useTheme();
  const [sports, setSports] = useState<Sport[]>([]);
  const [when, setWhen] = useState<When | "">("");
  const [skill, setSkill] = useState<SkillLevel | "">("");
  const [openSlots, setOpenSlots] = useState(true);
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [inviteFor, setInviteFor] = useState<Trip | null>(null);

  const range = when ? rangeFor(when) : null;
  const { data, isLoading, isFetching, error, refetch } = useTrips({
    category: "SPORTS",
    upcoming: true,
    search: search.trim() || undefined,
    sport: sports,
    skillLevel: skill || undefined,
    openSlots,
    dateFrom: range?.from.toISOString(),
    dateTo: range?.to.toISOString(),
    lat: nearMe?.lat,
    lng: nearMe?.lng,
    radiusKm: nearMe ? NEAR_ME_RADIUS_KM : undefined,
    pageSize: limit,
  });
  const items = data?.items ?? [];
  const columns = Math.min(3, gridColumnsFor(contentWidth));
  const rows = useMemo(() => toRows(items, columns), [items, columns]);
  const filtersOn = sports.length > 0 || !!when || !!skill || !!nearMe || !openSlots;

  const toggleSport = (s: Sport) => setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleNearMe = async () => {
    if (nearMe) return setNearMe(null);
    setLocating(true);
    try {
      setNearMe(await getCurrentLocationOrThrow());
    } catch (err: any) {
      Alert.alert("Location unavailable", err?.message ?? "Allow location access to see activities near you.");
    } finally {
      setLocating(false);
    }
  };
  const clearAll = () => {
    setSports([]);
    setWhen("");
    setSkill("");
    setNearMe(null);
    setOpenSlots(true);
  };

  return (
    <View style={{ paddingHorizontal: gutter, gap: 14 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Sport type">
        <FilterChip label="All sports" icon="view-grid-outline" active={sports.length === 0} onPress={() => setSports([])} />
        {SPORTS.map((s) => (
          <FilterChip key={s} label={SPORT_INFO[s].label} icon={SPORT_INFO[s].icon} active={sports.includes(s)} onPress={() => toggleSport(s)} />
        ))}
      </ScrollView>

      <View style={styles.filters}>
        <SelectChip label="When" value={when} options={WHEN_OPTIONS} onChange={setWhen} />
        <SelectChip
          label="Level"
          value={skill}
          options={[{ value: "", label: "Any level" }, ...SKILL_LEVELS.filter((l) => l !== "ANY").map((l) => ({ value: l, label: SKILL_LABELS[l] }))]}
          onChange={setSkill}
        />
        <FilterChip label="Open spots" icon="account-check-outline" active={openSlots} onPress={() => setOpenSlots((v) => !v)} />
        <FilterChip
          label={locating ? "Locating…" : nearMe ? `Near me · ${NEAR_ME_RADIUS_KM} km` : "Near me"}
          icon="map-marker"
          iconColor={colors.danger}
          active={!!nearMe}
          onPress={toggleNearMe}
        />
        {filtersOn && (
          <Text style={[styles.clear, { color: colors.primary }]} onPress={clearAll} accessibilityRole="button">
            Clear filters
          </Text>
        )}
      </View>

      <View style={styles.resultsHead}>
        <Text style={[styles.heading, { color: colors.ink }]} accessibilityRole="header">
          Sports & Activities
        </Text>
        {data && (
          <Text style={[styles.count, { color: colors.muted }]}>
            {data.total} {data.total === 1 ? "activity" : "activities"}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.row}>
          {Array.from({ length: columns }, (_, i) => (
            <View key={i} style={styles.cell}>
              <TripCardSkeleton />
            </View>
          ))}
        </View>
      ) : error ? (
        <EmptyState icon="wifi-off" title="Couldn't load activities" message="Check your connection and try again." actionLabel="Try again" onAction={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={nearMe ? "map-marker-radius-outline" : "trophy-outline"}
          title={filtersOn || search ? "No activities match" : "No upcoming activities yet"}
          message={
            nearMe
              ? `Nothing within ${NEAR_ME_RADIUS_KM} km of you. Try a wider search or start one yourself.`
              : filtersOn || search
                ? "Try fewer filters, or start the game yourself."
                : "Be the first to organize a game and invite your buddies."
          }
          actionLabel={onCreate ? "Create an activity" : undefined}
          onAction={onCreate}
        />
      ) : (
        <View style={{ gap: 16 }}>
          {rows.map((row) => (
            <View key={row.map((t) => t.id).join("-")} style={styles.row}>
              {row.map((trip) => (
                <View key={trip.id} style={styles.cell}>
                  <SportCard trip={trip} onPress={() => onOpen(trip)} onInvite={() => setInviteFor(trip)} />
                </View>
              ))}
              {Array.from({ length: columns - row.length }, (_, i) => (
                <View key={`filler-${i}`} style={styles.cell} />
              ))}
            </View>
          ))}
          {data && data.total > items.length && (
            <PrimaryButton label={isFetching ? "Loading…" : "Show more"} variant="outline" onPress={() => setLimit((l) => l + PAGE)} disabled={isFetching} style={styles.more} />
          )}
        </View>
      )}

      {inviteFor && (
        <InviteBuddiesModal
          visible
          tripId={inviteFor.id}
          tripTitle={inviteFor.title}
          onClose={() => setInviteFor(null)}
          onFindBuddies={() => {
            setInviteFor(null);
            onFindBuddies();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 2 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  clear: { fontSize: 13.5, fontWeight: "700", paddingHorizontal: 6 },
  resultsHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 },
  heading: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  count: { fontSize: 13.5 },
  row: { flexDirection: "row", gap: 16 },
  cell: { flex: 1, minWidth: 0 },
  more: { alignSelf: "center", minWidth: 200 },
});
