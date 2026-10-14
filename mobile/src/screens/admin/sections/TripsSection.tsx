import { useState } from "react";
import { View } from "react-native";
import { atLeast, errorMessage, useAdminTrips, useBulkTrips, useUpdateTrip, type AdminTrip } from "../../../api/admin";
import { TRAVEL_MODES, type TravelMode, type TripStatus } from "../../../types";
import { travelModeText } from "../../../utils/travelModeIcons";
import { SPORT_INFO } from "../../../utils/sports";
import { SearchField } from "../../../components/theme/SearchField";
import { AdminButton, Pagination, Select, StatusBadge, humanize, useConfirm, useToast, type Tone } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useAdminNav } from "../AdminContext";
import { BulkBar, SectionTitle, Toolbar, useDebounced, useSelection } from "../shared";

const STATUSES: TripStatus[] = ["PLANNING", "OPEN", "ALMOST_FULL", "FULL", "STARTED", "COMPLETED", "CANCELLED"];

const STATUS_TONE: Partial<Record<TripStatus, Tone>> = {
  OPEN: "success",
  ALMOST_FULL: "warning",
  FULL: "info",
  STARTED: "info",
  CANCELLED: "danger",
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <StatusBadge label={humanize(status)} tone={STATUS_TONE[status] ?? "neutral"} />;
}

// Featured / hidden flags as badges.
export function TripFlags({ trip }: { trip: Pick<AdminTrip, "featured" | "hidden"> }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      {trip.featured && <StatusBadge label="Featured" tone="info" icon="star" />}
      {trip.hidden && <StatusBadge label="Hidden" tone="warning" icon="eye-off-outline" />}
      {!trip.featured && !trip.hidden && <CellText muted>—</CellText>}
    </View>
  );
}

type BulkAction = "feature" | "unfeature" | "hide" | "unhide" | "cancel" | "close";

export function TripsSection() {
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const isAdmin = atLeast(nav.role, "ADMIN");
  const [search, setSearch] = useState(nav.initialParams.search ?? "");
  const [status, setStatus] = useState<TripStatus | "">("");
  const [mode, setMode] = useState<TravelMode | "">("");
  const [visibility, setVisibility] = useState<"" | "featured" | "hidden">("");
  const [page, setPage] = useState(1);
  const query = useDebounced(search);
  const { data, isLoading, isFetching, error, refetch } = useAdminTrips({
    search: query,
    status,
    travelMode: mode,
    featured: visibility === "featured" ? true : undefined,
    hidden: visibility === "hidden" ? true : undefined,
    page,
  });
  const selection = useSelection();
  const bulk = useBulkTrips();
  const update = useUpdateTrip();

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    selection.clear();
  };

  const runBulk = (action: BulkAction) => {
    const ids = [...selection.selected];
    const destructive = action === "cancel" || action === "hide";
    confirm({
      title: `${humanize(action)} ${ids.length} trip${ids.length === 1 ? "" : "s"}?`,
      message:
        action === "hide"
          ? "Hidden trips disappear from Discover and search. Their organizers and members can still open them."
          : action === "cancel"
            ? "Cancelled trips stop accepting participants."
            : action === "close"
              ? "Closed trips are marked as completed."
              : "This updates every selected trip.",
      confirmLabel: humanize(action),
      destructive,
      onConfirm: async () => {
        await bulk.mutateAsync({ ids, action });
        toast(`${ids.length} trip${ids.length === 1 ? "" : "s"} updated`);
        selection.clear();
      },
    });
  };

  const toggle = async (trip: AdminTrip, field: "featured" | "hidden") => {
    try {
      await update.mutateAsync({ id: trip.id, [field]: !trip[field] });
      toast(field === "featured" ? (trip.featured ? "Removed from featured" : "Trip featured") : trip.hidden ? "Trip is visible again" : "Trip hidden");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <View>
      <SectionTitle title="Trips" description="Review, edit, feature or remove trips, and act on reported ones." />
      <Toolbar>
        <View style={{ flexGrow: 1, flexBasis: 260, maxWidth: 420 }}>
          <SearchField value={search} onChangeText={reset(setSearch)} placeholder="Search title, destination or organizer…" />
        </View>
        <Select label="Status" value={status} options={[{ value: "", label: "Any" }, ...STATUSES.map((s) => ({ value: s, label: humanize(s) }))]} onChange={reset(setStatus)} />
        <Select label="Type" value={mode} options={[{ value: "", label: "Any" }, ...TRAVEL_MODES.map((m) => ({ value: m, label: travelModeText(m) }))]} onChange={reset(setMode)} />
        <Select
          label="Visibility"
          value={visibility}
          options={[
            { value: "", label: "Any" },
            { value: "featured", label: "Featured" },
            { value: "hidden", label: "Hidden" },
          ]}
          onChange={reset(setVisibility)}
        />
      </Toolbar>
      <BulkBar count={selection.selected.size} onClear={selection.clear}>
        {isAdmin && <AdminButton label="Feature" icon="star-outline" small onPress={() => runBulk("feature")} />}
        {isAdmin && <AdminButton label="Unfeature" small onPress={() => runBulk("unfeature")} />}
        <AdminButton label="Hide" icon="eye-off-outline" small onPress={() => runBulk("hide")} />
        <AdminButton label="Unhide" icon="eye-outline" small onPress={() => runBulk("unhide")} />
        {isAdmin && <AdminButton label="Close" small onPress={() => runBulk("close")} />}
        {isAdmin && <AdminButton label="Cancel" variant="danger" small onPress={() => runBulk("cancel")} />}
      </BulkBar>
      <DataTable<AdminTrip>
        columns={[
          {
            key: "title",
            title: "Trip",
            flex: 2,
            primary: true,
            render: (t) => (
              <View style={{ minWidth: 0 }}>
                <CellText strong>{t.title}</CellText>
                <CellText muted>
                  {t.destination} · {t.category === "SPORTS" ? SPORT_INFO[t.sport ?? "OTHER"].label : travelModeText(t.travelMode)}
                </CellText>
              </View>
            ),
          },
          { key: "owner", title: "Organizer", flex: 1.2, render: (t) => <CellText>{t.owner.name}</CellText> },
          { key: "dates", title: "Dates", flex: 1.2, render: (t) => <CellText muted>{`${formatDate(t.startDate)} – ${formatDate(t.endDate)}`}</CellText> },
          { key: "status", title: "Status", flex: 1, render: (t) => <TripStatusBadge status={t.status} /> },
          { key: "seats", title: "Seats", flex: 0.7, align: "right", render: (t) => <CellText>{`${t.seatsFilled}/${t.seats}`}</CellText> },
          { key: "flags", title: "Visibility", flex: 1.1, render: (t) => <TripFlags trip={t} /> },
        ]}
        rows={data?.items}
        keyOf={(t) => t.id}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error, "Couldn't load trips.") : null}
        onRetry={refetch}
        empty={{ icon: "map-search-outline", title: "No trips found", message: "Try a different search or clear the filters." }}
        onRowPress={(t) => nav.openTrip(t.id)}
        selected={selection.selected}
        onToggleSelect={selection.toggle}
        onToggleAll={selection.toggleAll}
        actions={(t) => (
          <>
            {isAdmin && <AdminButton label={t.featured ? "Unfeature" : "Feature"} icon={t.featured ? "star" : "star-outline"} small onPress={() => toggle(t, "featured")} />}
            <AdminButton label={t.hidden ? "Unhide" : "Hide"} icon={t.hidden ? "eye-outline" : "eye-off-outline"} small onPress={() => toggle(t, "hidden")} />
          </>
        )}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}
