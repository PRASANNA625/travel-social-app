import { useState } from "react";
import { View } from "react-native";
import { errorMessage, useAdminTrips, type AdminTrip } from "../../../api/admin";
import { Pagination, SegmentTabs, StatusBadge } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { travelModeText } from "../../../utils/travelModeIcons";
import { useAdminNav } from "../AdminContext";
import { SectionTitle } from "../shared";
import { TripStatusBadge } from "./TripsSection";

// Meetups and events on Triply are trips: participants are the trip group's members,
// approvals are join requests, cancellation is the CANCELLED status. Opening a row
// shows the participant list and pending requests, where admins approve, decline
// or remove people.
export function EventsSection() {
  const nav = useAdminNav();
  const [when, setWhen] = useState<"upcoming" | "all" | "cancelled">("upcoming");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useAdminTrips({
    upcoming: when === "upcoming" ? true : undefined,
    status: when === "cancelled" ? "CANCELLED" : undefined,
    page,
  });

  return (
    <View>
      <SectionTitle
        title="Meetups & Events"
        description="Every trip is a meetup: manage participants, approve or decline join requests, and handle cancellations. Open an event to manage its people."
      />
      <View style={{ marginBottom: 12 }}>
        <SegmentTabs
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "all", label: "All events" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          value={when}
          onChange={(v) => {
            setWhen(v);
            setPage(1);
          }}
        />
      </View>
      <DataTable<AdminTrip>
        columns={[
          {
            key: "event",
            title: "Event",
            flex: 2,
            primary: true,
            render: (t) => (
              <View style={{ minWidth: 0 }}>
                <CellText strong>{t.title}</CellText>
                <CellText muted>
                  {t.destination} · {travelModeText(t.travelMode)}
                </CellText>
              </View>
            ),
          },
          { key: "date", title: "Starts", flex: 1, render: (t) => <CellText>{formatDate(t.startDate)}</CellText> },
          { key: "organizer", title: "Organizer", flex: 1.2, render: (t) => <CellText>{t.owner.name}</CellText> },
          {
            key: "attendance",
            title: "Attendance",
            flex: 1,
            render: (t) => (
              <StatusBadge
                label={`${t.seatsFilled}/${t.seats} going`}
                tone={t.seatsFilled >= t.seats ? "info" : "neutral"}
                icon="account-group-outline"
              />
            ),
          },
          { key: "requests", title: "Requests", flex: 0.8, align: "right", render: (t) => <CellText>{t._count.joinRequests}</CellText> },
          { key: "status", title: "Status", flex: 1, render: (t) => <TripStatusBadge status={t.status} /> },
        ]}
        rows={data?.items}
        keyOf={(t) => t.id}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error, "Couldn't load events.") : null}
        onRetry={refetch}
        empty={{ icon: "calendar-blank-outline", title: when === "upcoming" ? "No upcoming events" : "No events here", message: "Trips people create show up here." }}
        onRowPress={(t) => nav.openTrip(t.id)}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}
