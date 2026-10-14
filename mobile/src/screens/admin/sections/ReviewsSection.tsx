import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  errorMessage,
  useAdminComments,
  useAdminFeedback,
  useAdminReviews,
  useDeleteComment,
  useDeleteReview,
  useSetFeedbackStatus,
  type AdminComment,
  type AdminFeedback,
  type AdminReview,
  type FeedbackStatus,
} from "../../../api/admin";
import { SearchField } from "../../../components/theme/SearchField";
import { AdminButton, Pagination, PersonCell, Select, SegmentTabs, StatusBadge, humanize, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { CellText, DataTable, formatDate } from "../../../components/admin/DataTable";
import { useTheme } from "../../../theme/ThemeContext";
import { optimizedImageUrl } from "../../../utils/optimizedImage";
import { useAdminNav } from "../AdminContext";
import { SectionTitle, Toolbar, useDebounced } from "../shared";

function Stars({ rating }: { rating: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stars} accessibilityLabel={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons key={i} name={i <= rating ? "star" : "star-outline"} size={14} color={i <= rating ? "#f59e0b" : colors.mutedLight} />
      ))}
    </View>
  );
}

function ReviewsTab() {
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [maxRating, setMaxRating] = useState<"" | "1" | "2" | "3">("");
  const [page, setPage] = useState(1);
  const query = useDebounced(search);
  const { data, isLoading, isFetching, error, refetch } = useAdminReviews({ search: query, maxRating: maxRating || undefined, page });
  const remove = useDeleteReview();

  const onRemove = (r: AdminReview) =>
    confirm({
      title: "Remove this review?",
      message: `The review by ${r.user.name} on "${r.trip.title}" will be deleted and the trip's rating recalculated.`,
      confirmLabel: "Remove review",
      destructive: true,
      reasonLabel: "Reason (recorded in the audit log)",
      onConfirm: async ({ reason }) => {
        await remove.mutateAsync({ tripId: r.tripId, userId: r.userId, reason });
        toast("Review removed");
      },
    });

  return (
    <View>
      <Toolbar>
        <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 380 }}>
          <SearchField value={search} onChangeText={(v) => (setSearch(v), setPage(1))} placeholder="Search review text…" />
        </View>
        <Select
          label="Rating"
          value={maxRating}
          options={[
            { value: "", label: "Any" },
            { value: "1", label: "1 star" },
            { value: "2", label: "2 stars or less" },
            { value: "3", label: "3 stars or less" },
          ]}
          onChange={(v) => (setMaxRating(v), setPage(1))}
        />
      </Toolbar>
      <DataTable<AdminReview>
        columns={[
          { key: "rating", title: "Rating", flex: 0.9, render: (r) => <Stars rating={r.rating} /> },
          { key: "comment", title: "Review", flex: 2.5, primary: true, render: (r) => <CellText>{r.comment || "(rating only)"}</CellText> },
          { key: "by", title: "By", flex: 1.2, render: (r) => <CellText>{r.user.name}</CellText> },
          {
            key: "trip",
            title: "Trip",
            flex: 1.4,
            render: (r) => <CellText muted>{r.trip.title}</CellText>,
          },
          { key: "date", title: "Date", flex: 1, hideOnNarrow: true, render: (r) => <CellText muted>{formatDate(r.createdAt)}</CellText> },
        ]}
        rows={data?.items}
        keyOf={(r) => `${r.tripId}:${r.userId}`}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        empty={{ icon: "star-outline", title: "No reviews found" }}
        onRowPress={(r) => nav.openTrip(r.tripId)}
        actions={(r) => <AdminButton label="Remove" variant="danger" small onPress={() => onRemove(r)} />}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}

function CommentsTab() {
  const nav = useAdminNav();
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(search);
  const { data, isLoading, isFetching, error, refetch } = useAdminComments({ search: query, page });
  const remove = useDeleteComment();

  const onRemove = (c: AdminComment) =>
    confirm({
      title: "Remove this comment?",
      message: `The comment by ${c.user.name} on "${c.trip.title}" will be deleted for everyone.`,
      confirmLabel: "Remove comment",
      destructive: true,
      reasonLabel: "Reason (recorded in the audit log)",
      onConfirm: async ({ reason }) => {
        await remove.mutateAsync({ id: c.id, reason });
        toast("Comment removed");
      },
    });

  return (
    <View>
      <Toolbar>
        <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 380 }}>
          <SearchField value={search} onChangeText={(v) => (setSearch(v), setPage(1))} placeholder="Search comment text…" />
        </View>
      </Toolbar>
      <DataTable<AdminComment>
        columns={[
          { key: "text", title: "Comment", flex: 3, primary: true, render: (c) => <CellText>{c.text}</CellText> },
          { key: "by", title: "By", flex: 1.2, render: (c) => <CellText>{c.user.name}</CellText> },
          { key: "trip", title: "Trip", flex: 1.4, render: (c) => <CellText muted>{c.trip.title}</CellText> },
          { key: "date", title: "Date", flex: 1, hideOnNarrow: true, render: (c) => <CellText muted>{formatDate(c.createdAt, true)}</CellText> },
        ]}
        rows={data?.items}
        keyOf={(c) => c.id}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        empty={{ icon: "comment-outline", title: "No comments found" }}
        onRowPress={(c) => nav.openTrip(c.trip.id)}
        actions={(c) => <AdminButton label="Remove" variant="danger" small onPress={() => onRemove(c)} />}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}

const FEEDBACK_BADGE: Record<FeedbackStatus, { label: string; tone: "warning" | "info" | "success" }> = {
  NEW: { label: "New", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
};

function FeedbackTab() {
  const { colors } = useTheme();
  const toast = useToast();
  const [status, setStatus] = useState<FeedbackStatus | "">("NEW");
  const [kind, setKind] = useState<"" | "REPORT" | "FEEDBACK">("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useAdminFeedback({ status, kind, page });
  const setFeedbackStatus = useSetFeedbackStatus();

  const move = async (f: AdminFeedback, next: FeedbackStatus) => {
    try {
      await setFeedbackStatus.mutateAsync({ id: f.id, status: next });
      toast(`Marked as ${FEEDBACK_BADGE[next].label.toLowerCase()}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <View>
      <Toolbar>
        <Select
          label="Status"
          value={status}
          options={[
            { value: "", label: "Any" },
            { value: "NEW", label: "New" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "RESOLVED", label: "Resolved" },
          ]}
          onChange={(v) => (setStatus(v), setPage(1))}
        />
        <Select
          label="Kind"
          value={kind}
          options={[
            { value: "", label: "Any" },
            { value: "REPORT", label: "Bug reports" },
            { value: "FEEDBACK", label: "Suggestions" },
          ]}
          onChange={(v) => (setKind(v), setPage(1))}
        />
      </Toolbar>
      <DataTable<AdminFeedback>
        columns={[
          {
            key: "kind",
            title: "Kind",
            flex: 1,
            render: (f) => <StatusBadge label={f.kind === "REPORT" ? "Bug report" : "Suggestion"} icon={f.kind === "REPORT" ? "bug-outline" : "lightbulb-outline"} />,
          },
          {
            key: "description",
            title: "Message",
            flex: 3,
            primary: true,
            render: (f) => (
              <View style={{ gap: 2 }}>
                <CellText strong>{humanize(f.type)}</CellText>
                <CellText>{f.description}</CellText>
                {f.screenshotUrl && (
                  <Text style={[styles.link, { color: colors.primary }]} onPress={() => Linking.openURL(optimizedImageUrl(f.screenshotUrl!, 1200))}>
                    View screenshot
                  </Text>
                )}
              </View>
            ),
          },
          { key: "from", title: "From", flex: 1.2, render: (f) => <PersonCell name={f.user.name} photoUrl={f.user.photoUrl} sub={`${f.platform} · v${f.appVersion}`} /> },
          { key: "status", title: "Status", flex: 1, render: (f) => <StatusBadge {...FEEDBACK_BADGE[f.status]} /> },
          { key: "date", title: "Received", flex: 1, hideOnNarrow: true, render: (f) => <CellText muted>{formatDate(f.createdAt)}</CellText> },
        ]}
        rows={data?.items}
        keyOf={(f) => f.id}
        loading={isLoading || isFetching}
        error={error ? errorMessage(error) : null}
        onRetry={refetch}
        empty={{ icon: "message-check-outline", title: "Nothing to review", message: "Bug reports and suggestions from the app land here." }}
        actions={(f) => (
          <>
            {f.status === "NEW" && <AdminButton label="Start" small onPress={() => move(f, "IN_PROGRESS")} />}
            {f.status !== "RESOLVED" ? (
              <AdminButton label="Resolve" variant="primary" small onPress={() => move(f, "RESOLVED")} />
            ) : (
              <AdminButton label="Reopen" small onPress={() => move(f, "NEW")} />
            )}
          </>
        )}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </View>
  );
}

export function ReviewsSection() {
  const [tab, setTab] = useState<"reviews" | "comments" | "feedback">("reviews");
  return (
    <View>
      <SectionTitle title="Reviews & Feedback" description="Moderate trip reviews and comments, and work through app feedback." />
      <View style={{ marginBottom: 12 }}>
        <SegmentTabs
          options={[
            { value: "reviews", label: "Trip reviews" },
            { value: "comments", label: "Comments" },
            { value: "feedback", label: "App feedback" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "reviews" ? <ReviewsTab /> : tab === "comments" ? <CommentsTab /> : <FeedbackTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: "row", gap: 1 },
  link: { fontSize: 13, fontWeight: "600" },
});
