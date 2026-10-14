import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  errorMessage,
  uploadHeroMedia,
  useCreateHeroBanner,
  useUpdateHeroBanner,
  type AdminHeroBanner,
  type HeroBannerInput,
  type HeroBannerStatus,
} from "../../api/admin";
import { HERO_DESTINATIONS, type HeroFocalPoint, type HeroSettings, type HeroTextAlign } from "../../api/hero";
import { AdminButton, SegmentTabs, Select, useToast } from "../../components/admin/AdminUI";
import { DateTimeField } from "../../components/admin/DateTimeField";
import { HeroPreview } from "../../components/hero/HeroPreview";
import { useTheme } from "../../theme/ThemeContext";
import { RADIUS } from "../../theme/tokens";
import { Drawer } from "./Drawers";

const IMAGE_MAX_MB = 10;
const VIDEO_MAX_MB = 60;
const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;
const VIDEO_TYPES = /^video\/(mp4|webm|quicktime)$/;

const FOCAL: { value: HeroFocalPoint; label: string }[] = [
  { value: "center", label: "Center" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];
const OVERLAYS = [
  { value: "0", label: "None" },
  { value: "0.25", label: "Light" },
  { value: "0.45", label: "Medium" },
  { value: "0.65", label: "Strong" },
];
const ALIGNS: { value: HeroTextAlign; label: string }[] = [
  { value: "LEFT", label: "Left" },
  { value: "CENTER", label: "Center" },
  { value: "RIGHT", label: "Right" },
];
const SWATCHES = ["#FFFFFF", "#FEF3C7", "#CCFBF1", "#0F172A"];
const CUSTOM = "custom";

type Draft = Omit<HeroBannerInput, "status" | "mediaType" | "mediaUrl" | "mediaKey"> & {
  mediaType: HeroBannerInput["mediaType"] | null;
  mediaUrl: string | null;
  mediaKey: string | null;
};

const EMPTY: Draft = {
  title: "",
  mediaType: null,
  mediaUrl: null,
  mediaKey: null,
  posterUrl: null,
  posterKey: null,
  focalPoint: "center",
  heading: "",
  subtitle: "",
  tagline: "",
  textColor: "#FFFFFF",
  overlayOpacity: 0.45,
  textAlign: "LEFT",
  ctaLabel: "",
  ctaUrl: null,
  startsAt: null,
  endsAt: null,
};

// Checked here for a quick message; the server checks again (including the file's real contents).
function checkAsset(asset: ImagePicker.ImagePickerAsset, imagesOnly: boolean) {
  const type = asset.mimeType ?? "";
  const isVideo = asset.type === "video" || type.startsWith("video/");
  if (isVideo && imagesOnly) return "Choose an image for the fallback.";
  if (type && !(isVideo ? VIDEO_TYPES : IMAGE_TYPES).test(type)) return "Use a JPG, PNG or WebP image, or an MP4 or WebM video.";
  const max = (isVideo ? VIDEO_MAX_MB : IMAGE_MAX_MB) * 1024 * 1024;
  if (asset.fileSize && asset.fileSize > max) return `${isVideo ? "Videos" : "Images"} can be up to ${isVideo ? VIDEO_MAX_MB : IMAGE_MAX_MB} MB.`;
  return null;
}

export function HeroEditor({
  banner,
  visible,
  settings,
  onClose,
}: {
  banner: AdminHeroBanner | null; // null = new
  visible: boolean;
  settings: HeroSettings;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateHeroBanner();
  const update = useUpdateHeroBanner();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [progress, setProgress] = useState<{ kind: "media" | "poster"; value: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [ctaChoice, setCtaChoice] = useState<string>("");

  useEffect(() => {
    if (!visible) return;
    const start = banner ? { ...EMPTY, ...banner, heading: banner.heading ?? "", subtitle: banner.subtitle ?? "", tagline: banner.tagline ?? "", ctaLabel: banner.ctaLabel ?? "" } : EMPTY;
    setDraft(start);
    setCtaChoice(!start.ctaUrl ? "" : HERO_DESTINATIONS.some((d) => d.value === start.ctaUrl) ? start.ctaUrl : CUSTOM);
    setUploadError(null);
    setProgress(null);
  }, [visible, banner]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const pick = async (kind: "media" | "poster") => {
    setUploadError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "poster" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.All,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const problem = checkAsset(asset, kind === "poster");
    if (problem) return setUploadError(problem);
    setProgress({ kind, value: 0 });
    try {
      const stored = await uploadHeroMedia(asset, kind, (value) => setProgress({ kind, value }));
      if (kind === "poster") set({ posterUrl: stored.url, posterKey: stored.key });
      else set({ mediaType: stored.mediaType, mediaUrl: stored.url, mediaKey: stored.key, posterUrl: stored.posterUrl, posterKey: null });
    } catch (err) {
      setUploadError(errorMessage(err, "Upload failed. Check your connection and try again."));
    } finally {
      setProgress(null);
    }
  };

  const startsLater = !!draft.startsAt && new Date(draft.startsAt) > new Date();
  const live = banner?.state === "LIVE";

  const save = async (status: HeroBannerStatus) => {
    if (!draft.title.trim()) return toast("Give the banner a name.", "error");
    if (!draft.mediaUrl || !draft.mediaKey || !draft.mediaType) return toast("Upload an image or video first.", "error");
    if (!!draft.ctaLabel?.trim() !== !!draft.ctaUrl) return toast("A button needs both a label and a destination.", "error");
    const input: HeroBannerInput = {
      ...draft,
      mediaType: draft.mediaType,
      mediaUrl: draft.mediaUrl,
      mediaKey: draft.mediaKey,
      title: draft.title.trim(),
      status,
    };
    try {
      if (banner) await update.mutateAsync({ id: banner.id, input });
      else await create.mutateAsync(input);
      toast(
        status === "DRAFT" ? "Saved as a draft." : status === "SCHEDULED" ? "Scheduled. It goes live at its start time." : "Published. Discover shows it within a minute."
      );
      onClose();
    } catch (err) {
      toast(errorMessage(err, "Couldn't save the banner."), "error");
    }
  };

  const saving = create.isPending || update.isPending;
  const uploading = !!progress;
  const previewSlide = draft.mediaUrl && draft.mediaType
    ? [{ ...draft, id: "preview", mediaType: draft.mediaType, mediaUrl: draft.mediaUrl, heading: draft.heading || null, subtitle: draft.subtitle || null, tagline: draft.tagline || null, ctaLabel: draft.ctaLabel || null }]
    : [];

  return (
    <Drawer
      visible={visible}
      title={banner ? `Edit "${banner.title}"` : "New banner"}
      onClose={onClose}
      panelWidth={760}
      footer={
        <>
          <AdminButton label="Cancel" onPress={onClose} disabled={saving} />
          <AdminButton label={live ? "Unpublish & save" : "Save as draft"} icon="content-save-outline" onPress={() => save("DRAFT")} disabled={saving || uploading} />
          <AdminButton
            label={startsLater ? "Schedule" : live ? "Save live banner" : "Publish"}
            icon={startsLater ? "calendar-clock" : "rocket-launch-outline"}
            variant="primary"
            onPress={() => save(startsLater ? "SCHEDULED" : "PUBLISHED")}
            loading={saving}
            disabled={uploading}
          />
        </>
      }
    >
      <Section title="Preview" right={<SegmentTabs options={[{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }]} value={preview} onChange={setPreview} />}>
        <HeroPreview slides={previewSlide} settings={settings} variant={preview} />
      </Section>

      <Section title="Media">
        <View style={styles.mediaRow}>
          <AdminButton
            label={draft.mediaUrl ? "Replace image or video" : "Upload image or video"}
            icon="cloud-upload-outline"
            variant={draft.mediaUrl ? "secondary" : "primary"}
            onPress={() => pick("media")}
            disabled={uploading}
          />
          {draft.mediaType && (
            <Text style={[styles.help, { color: colors.muted }]}>
              <MaterialCommunityIcons name={draft.mediaType === "VIDEO" ? "video-outline" : "image-outline"} size={14} /> {draft.mediaType === "VIDEO" ? "Video" : "Image"} uploaded
            </Text>
          )}
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          JPG, PNG or WebP up to {IMAGE_MAX_MB} MB, or MP4/WebM video up to {VIDEO_MAX_MB} MB. Wide, at least 1920px across, works best. Videos play muted and loop.
        </Text>
        {progress && <ProgressBar value={progress.value} label={progress.kind === "poster" ? "Uploading fallback image" : "Uploading"} />}
        {uploadError && (
          <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
            {uploadError}
          </Text>
        )}
        {draft.mediaType === "VIDEO" && (
          <View style={styles.mediaRow}>
            <AdminButton label={draft.posterKey ? "Replace fallback image" : "Add fallback image"} icon="image-outline" onPress={() => pick("poster")} disabled={uploading} small />
            <Text style={[styles.help, { color: colors.muted, flex: 1 }]}>Shown while the video loads, and on phones that save data or can't play it.</Text>
          </View>
        )}
        <Label text="Crop focus" />
        <SegmentTabs options={FOCAL} value={draft.focalPoint} onChange={(focalPoint) => set({ focalPoint })} />
      </Section>

      <Section title="Text">
        <Input label="Banner name (only admins see this)" value={draft.title} onChange={(title) => set({ title })} max={80} />
        <Input label="Heading" value={draft.heading ?? ""} onChange={(heading) => set({ heading })} max={60} placeholder="Discover" />
        <Input label="Subtitle" value={draft.subtitle ?? ""} onChange={(subtitle) => set({ subtitle })} max={160} multiline placeholder="Find amazing trips, meet like-minded travelers…" />
        <Input label="Tagline (desktop; up to three lines, separated by commas)" value={draft.tagline ?? ""} onChange={(tagline) => set({ tagline })} max={60} placeholder="Explore, Connect, Belong" />
        <Label text="Text color" />
        <View style={styles.mediaRow}>
          {SWATCHES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => set({ textColor: c })}
              style={[styles.swatch, { backgroundColor: c, borderColor: draft.textColor.toUpperCase() === c ? colors.primary : colors.border }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.textColor.toUpperCase() === c }}
              accessibilityLabel={`Text color ${c}`}
            />
          ))}
          <TextInput
            style={[styles.input, styles.hex, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
            value={draft.textColor}
            onChangeText={(textColor) => set({ textColor: textColor.startsWith("#") ? textColor : `#${textColor}` })}
            maxLength={7}
            accessibilityLabel="Text color hex"
          />
        </View>
        <Label text="Darken image behind text" />
        <SegmentTabs options={OVERLAYS} value={String(draft.overlayOpacity)} onChange={(v) => set({ overlayOpacity: Number(v) })} />
        {draft.overlayOpacity === 0 && draft.textColor.toUpperCase() !== "#0F172A" && (
          <Text style={[styles.help, { color: colors.warningText }]}>Light text with no overlay can be hard to read. Check both previews.</Text>
        )}
        <Label text="Text position" />
        <SegmentTabs options={ALIGNS} value={draft.textAlign} onChange={(textAlign) => set({ textAlign })} />
      </Section>

      <Section title="Button (optional)">
        <Input label="Button label" value={draft.ctaLabel ?? ""} onChange={(ctaLabel) => set({ ctaLabel })} max={30} placeholder="e.g. Find a game" />
        <View style={styles.mediaRow}>
          <Select
            label="Opens"
            value={ctaChoice}
            options={[{ value: "", label: "Nothing" }, ...HERO_DESTINATIONS, { value: CUSTOM, label: "A web link" }]}
            onChange={(v) => {
              setCtaChoice(v);
              set({ ctaUrl: v === CUSTOM ? "https://" : v || null });
            }}
          />
        </View>
        {ctaChoice === CUSTOM && <Input label="Link (https://…)" value={draft.ctaUrl ?? ""} onChange={(ctaUrl) => set({ ctaUrl })} max={500} />}
      </Section>

      <Section title="Schedule (optional)">
        <View style={styles.dates}>
          <DateTimeField label="Show from" value={draft.startsAt} onChange={(startsAt) => set({ startsAt })} />
          <DateTimeField label="Show until" value={draft.endsAt} onChange={(endsAt) => set({ endsAt })} />
        </View>
        <Text style={[styles.help, { color: colors.muted }]}>
          {startsLater ? "Saving as Schedule makes it go live automatically at the start time." : "Leave empty to show it as soon as it's published, until you unpublish it."}
        </Text>
      </Section>
    </Drawer>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Label({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.label, { color: colors.muted }]}>{text}</Text>;
}

function Input({ label, value, onChange, max, multiline, placeholder }: { label: string; value: string; onChange: (v: string) => void; max: number; multiline?: boolean; placeholder?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.labelRow}>
        <Label text={label} />
        <Text style={[styles.counter, { color: colors.mutedLight }]}>
          {value.length}/{max}
        </Text>
      </View>
      <TextInput
        style={[styles.input, multiline && styles.textarea, { color: colors.ink, borderColor: colors.border, backgroundColor: colors.fieldBg }]}
        value={value}
        onChangeText={onChange}
        maxLength={max}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const pct = Math.round(value * 100);
  return (
    <View style={{ gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} accessibilityLabel={label}>
      <View style={styles.labelRow}>
        <Text style={[styles.help, { color: colors.ink }]}>{pct < 100 ? `${label}… ${pct}%` : "Processing…"}</Text>
        {pct >= 100 && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      <View style={[styles.track, { backgroundColor: colors.fieldBg }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: RADIUS.card, padding: 14, gap: 10 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  sectionTitle: { fontSize: 15.5, fontWeight: "800" },
  mediaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  help: { fontSize: 12.5, lineHeight: 18 },
  error: { fontSize: 13, fontWeight: "600" },
  label: { fontSize: 12.5, fontWeight: "600" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  counter: { fontSize: 11.5 },
  input: { borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  textarea: { minHeight: 64, textAlignVertical: "top" },
  hex: { width: 110 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  dates: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});
