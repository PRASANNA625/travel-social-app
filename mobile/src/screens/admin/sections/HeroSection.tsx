import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  atLeast,
  errorMessage,
  useAdminHero,
  useDeleteHeroBanner,
  useReorderHero,
  useSaveHeroSettings,
  useUpdateHeroBanner,
  type AdminHeroBanner,
  type HeroBannerState,
  type HeroBannerStatus,
} from "../../../api/admin";
import type { HeroSettings } from "../../../api/hero";
import { AdminButton, EmptyBlock, ErrorBlock, LoadingBlock, Panel, SegmentTabs, Select, StatusBadge, useConfirm, useToast } from "../../../components/admin/AdminUI";
import { formatDate } from "../../../components/admin/DataTable";
import { HeroPreview } from "../../../components/hero/HeroPreview";
import { optimizedImageUrl } from "../../../utils/optimizedImage";
import { useTheme } from "../../../theme/ThemeContext";
import { RADIUS } from "../../../theme/tokens";
import { useAdminNav } from "../AdminContext";
import { SectionTitle } from "../shared";
import { HeroEditor } from "../HeroEditor";

const STATE_BADGE: Record<HeroBannerState, { label: string; tone: "success" | "info" | "neutral" | "warning" | "danger" }> = {
  LIVE: { label: "Live", tone: "success" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  DRAFT: { label: "Draft", tone: "neutral" },
  ENDED: { label: "Ended", tone: "warning" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

const INTERVALS = [4, 5, 7, 10, 15, 20].map((s) => ({ value: String(s), label: `${s} seconds` }));

export function HeroSection() {
  const nav = useAdminNav();
  const canEdit = atLeast(nav.role, "ADMIN");
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useAdminHero();
  const updateBanner = useUpdateHeroBanner();
  const deleteBanner = useDeleteHeroBanner();
  const reorder = useReorderHero();
  const saveSettings = useSaveHeroSettings();
  const [editing, setEditing] = useState<AdminHeroBanner | "new" | null>(null);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [settings, setSettings] = useState<HeroSettings | null>(null);

  useEffect(() => {
    if (data) setSettings(data.settings);
  }, [data]);

  if (isLoading || (!data && !error)) return <LoadingBlock label="Loading banners…" />;
  if (error || !data || !settings) return <ErrorBlock message={errorMessage(error, "Couldn't load banners.")} onRetry={refetch} />;

  const banners = data.banners;
  const live = banners.filter((b) => b.state === "LIVE");
  const settingsDirty = settings.intervalSeconds !== data.settings.intervalSeconds || settings.transition !== data.settings.transition;

  const setStatus = async (b: AdminHeroBanner, status: HeroBannerStatus, done: string) => {
    try {
      await updateBanner.mutateAsync({ id: b.id, input: { status } });
      toast(done);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const publish = (b: AdminHeroBanner) => {
    const later = b.startsAt && new Date(b.startsAt) > new Date();
    return setStatus(b, later ? "SCHEDULED" : "PUBLISHED", later ? "Scheduled." : "Published. Discover shows it within a minute.");
  };
  const move = async (from: number, to: number) => {
    const ids = banners.map((b) => b.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    try {
      await reorder.mutateAsync(ids);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const remove = (b: AdminHeroBanner) =>
    confirm({
      title: "Delete this banner?",
      message: `"${b.title}" and its uploaded media will be deleted for good. To keep it for later, archive it instead.`,
      confirmLabel: "Delete banner",
      destructive: true,
      onConfirm: async () => {
        await deleteBanner.mutateAsync(b.id);
        toast("Banner deleted.");
      },
    });

  return (
    <View style={{ gap: 16 }}>
      <SectionTitle
        title="Hero & Banners"
        description="What members see at the top of Discover. Upload photos or videos, write the text, and schedule when each banner shows."
        right={
          canEdit ? (
            <AdminButton label="New banner" icon="plus" variant="primary" onPress={() => setEditing("new")} />
          ) : (
            <StatusBadge label="View only. Admins can edit." icon="lock-outline" />
          )
        }
      />

      <Panel
        title="On Discover now"
        subtitle={
          live.length
            ? `${live.length} live banner${live.length === 1 ? "" : "s"}${live.length > 1 ? `, rotating every ${data.settings.intervalSeconds} s` : ""}.`
            : "No banner is live, so Discover shows the built-in mountain scene."
        }
        right={<SegmentTabs options={[{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }]} value={preview} onChange={setPreview} />}
      >
        {live.length ? (
          <HeroPreview slides={live} settings={data.settings} variant={preview} />
        ) : (
          <EmptyBlock icon="image-filter-hdr" title="Built-in scene" message="Publish a banner to replace it." />
        )}
      </Panel>

      <Panel title="Carousel" subtitle="How live banners rotate when there's more than one.">
        <View style={styles.settingsRow}>
          <Select
            label="Rotate every"
            value={String(settings.intervalSeconds)}
            options={INTERVALS}
            onChange={(v) => canEdit && v && setSettings({ ...settings, intervalSeconds: Number(v) })}
          />
          <SegmentTabs
            options={[
              { value: "fade", label: "Fade" },
              { value: "slide", label: "Slide" },
            ]}
            value={settings.transition}
            onChange={(transition) => canEdit && setSettings({ ...settings, transition })}
          />
          {canEdit && (
            <AdminButton
              label="Save"
              icon="content-save-outline"
              variant="primary"
              disabled={!settingsDirty}
              loading={saveSettings.isPending}
              onPress={async () => {
                try {
                  await saveSettings.mutateAsync(settings);
                  toast("Carousel settings saved.");
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
            />
          )}
        </View>
      </Panel>

      <Panel title="Banners" subtitle="Shown in this order. Drafts, scheduled and archived banners stay hidden from members.">
        {banners.length === 0 ? (
          <EmptyBlock icon="image-plus" title="No banners yet" message={canEdit ? "Create one with New banner." : "Admins can create banners here."} />
        ) : (
          <View style={{ gap: 10 }}>
            {banners.map((b, i) => (
              <BannerRow
                key={b.id}
                banner={b}
                canEdit={canEdit}
                busy={updateBanner.isPending || reorder.isPending}
                onUp={i > 0 ? () => move(i, i - 1) : undefined}
                onDown={i < banners.length - 1 ? () => move(i, i + 1) : undefined}
                onEdit={() => setEditing(b)}
                onPublish={() => publish(b)}
                onUnpublish={() => setStatus(b, "DRAFT", "Moved back to drafts.")}
                onArchive={() => setStatus(b, "ARCHIVED", "Archived.")}
                onRestore={() => setStatus(b, "DRAFT", "Restored as a draft.")}
                onDelete={() => remove(b)}
              />
            ))}
          </View>
        )}
      </Panel>

      {canEdit && (
        <HeroEditor
          visible={editing !== null}
          banner={editing === "new" ? null : editing}
          settings={data.settings}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

function BannerRow({
  banner: b,
  canEdit,
  busy,
  onUp,
  onDown,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onDelete,
}: {
  banner: AdminHeroBanner;
  canEdit: boolean;
  busy: boolean;
  onUp?: () => void;
  onDown?: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const badge = STATE_BADGE[b.state];
  const thumb = b.mediaType === "IMAGE" ? b.mediaUrl : b.posterUrl;
  const window =
    b.startsAt || b.endsAt
      ? `${b.startsAt ? `From ${formatDate(b.startsAt, true)}` : "Now"}${b.endsAt ? ` until ${formatDate(b.endsAt, true)}` : ""}`
      : "No schedule";

  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.thumb}>
        {thumb ? (
          <Image source={{ uri: optimizedImageUrl(thumb, 240) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#0f766e", "#1e3a8a"]} style={StyleSheet.absoluteFill} />
        )}
        {b.mediaType === "VIDEO" && (
          <View style={styles.videoTag}>
            <MaterialCommunityIcons name="play" size={12} color="#ffffff" />
            <Text style={styles.videoTagText}>Video</Text>
          </View>
        )}
      </View>
      <View style={styles.rowText}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
            {b.title}
          </Text>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
        <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
          {b.heading || "Discover"}
          {b.ctaLabel ? ` · Button: ${b.ctaLabel}` : ""}
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
          {window} · Updated {formatDate(b.updatedAt)}
        </Text>
      </View>
      {canEdit && (
        <View style={styles.actions}>
          <View style={styles.orderButtons}>
            <IconButton icon="chevron-up" label={`Move ${b.title} up`} onPress={onUp} disabled={busy} />
            <IconButton icon="chevron-down" label={`Move ${b.title} down`} onPress={onDown} disabled={busy} />
          </View>
          <AdminButton label="Edit" icon="pencil-outline" small onPress={onEdit} />
          {(b.state === "DRAFT" || b.state === "ENDED") && <AdminButton label="Publish" icon="rocket-launch-outline" small variant="primary" onPress={onPublish} disabled={busy || b.state === "ENDED"} />}
          {(b.state === "LIVE" || b.state === "SCHEDULED") && <AdminButton label="Unpublish" icon="eye-off-outline" small onPress={onUnpublish} disabled={busy} />}
          {b.state !== "ARCHIVED" && b.state !== "DRAFT" && <AdminButton label="Archive" icon="archive-outline" small onPress={onArchive} disabled={busy} />}
          {b.state === "ARCHIVED" && <AdminButton label="Restore" icon="restore" small onPress={onRestore} disabled={busy} />}
          {(b.state === "DRAFT" || b.state === "ARCHIVED" || b.state === "ENDED") && <AdminButton label="Delete" icon="trash-can-outline" small variant="danger" onPress={onDelete} />}
        </View>
      )}
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled }: { icon: "chevron-up" | "chevron-down"; label: string; onPress?: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const off = !onPress || disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      style={[styles.iconButton, { borderColor: colors.border, opacity: off ? 0.35 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={18} color={colors.ink} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  settingsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: RADIUS.field, padding: 10 },
  thumb: { width: 128, height: 72, borderRadius: 10, overflow: "hidden", backgroundColor: "#0c2b28" },
  videoTag: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(15,23,42,0.7)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  videoTagText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  rowText: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  sub: { fontSize: 12.5 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  orderButtons: { flexDirection: "row", gap: 4 },
  iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
