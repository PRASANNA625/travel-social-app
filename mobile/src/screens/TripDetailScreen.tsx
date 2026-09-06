import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import {
  useAddComment,
  useBookmarkTrip,
  useLikeTrip,
  useTrip,
  useTripComments,
  useUpdateTripImages,
  useUploadTripImages,
} from "../api/trips";
import { useExpressInterest } from "../api/joinRequests";
import { useMyJoinRequests } from "../api/joinRequests";
import { useGroupByTrip } from "../api/groups";
import { Alert } from "../utils/alert";
import { TRAVEL_MODE_ICONS, travelModeText } from "../utils/travelModeIcons";
import { TRIP_STATUS_COLORS, TRIP_STATUS_LABELS } from "../utils/tripStatus";
import { PrimaryButton } from "../components/theme/PrimaryButton";
import { Skeleton } from "../components/theme/Skeleton";
import { COLORS, RADIUS } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const me = useAuthStore((s) => s.user);
  const { data: trip, isLoading } = useTrip(tripId);
  const { data: comments } = useTripComments(tripId);
  const { data: myRequests } = useMyJoinRequests();
  const { data: group } = useGroupByTrip(tripId);
  const [commentText, setCommentText] = useState("");
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [newPhotoAssets, setNewPhotoAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [heroWidth, setHeroWidth] = useState(width);
  const heroHeight = isWeb ? Math.min(Math.round(heroWidth / 2.4), 380) : 260;
  const scrollViewRef = useRef<ScrollView>(null);

  const likeTrip = useLikeTrip();
  const bookmarkTrip = useBookmarkTrip();
  const expressInterest = useExpressInterest(tripId);
  const addComment = useAddComment(tripId);
  const uploadImages = useUploadTripImages();
  const updateTripImages = useUpdateTripImages();

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  if (isLoading || !trip) {
    return (
      <View style={styles.flexScreen}>
        <Skeleton style={styles.skeletonHero} />
        <View style={styles.skeletonSection}>
          <Skeleton style={styles.skeletonLine} />
          <Skeleton style={styles.skeletonLineShort} />
          <Skeleton style={styles.skeletonLine} />
        </View>
      </View>
    );
  }

  const isOwner = trip.ownerId === me?.id;
  const myRequest = myRequests?.find((r) => r.tripId === tripId);
  const isMember = !!group?.members.some((m) => m.userId === me?.id);

  const startEditingPhotos = () => {
    setEditImages(trip.images);
    setNewPhotoAssets([]);
    setEditingPhotos(true);
  };

  const pickNewPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.7,
    });
    if (!result.canceled) {
      setNewPhotoAssets((prev) => [...prev, ...result.assets]);
    }
  };

  const savePhotos = async () => {
    try {
      const uploadedUrls = newPhotoAssets.length > 0 ? await uploadImages.mutateAsync(newPhotoAssets) : [];
      await updateTripImages.mutateAsync({ tripId, input: [...editImages, ...uploadedUrls] });
      setEditingPhotos(false);
    } catch (err: any) {
      Alert.alert("Couldn't save photos", err?.response?.data?.error ?? "Please try again");
    }
  };

  const isSavingPhotos = uploadImages.isPending || updateTripImages.isPending;

  const onExpressInterest = () => {
    expressInterest.mutate(undefined, {
      onSuccess: (req) =>
        Alert.alert(
          req.status === "APPROVED" ? "You're in!" : "Request sent",
          req.status === "APPROVED"
            ? "This trip is open — you've been added to the group."
            : "The organizer will review your request soon."
        ),
      onError: (err: any) => Alert.alert("Couldn't send request", err?.response?.data?.error ?? "Try again"),
    });
  };

  const onSendComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(commentText.trim(), { onSuccess: () => setCommentText("") });
  };

  let actionSlot: React.ReactNode;
  if (isOwner) {
    actionSlot = (
      <View style={styles.ownerActions}>
        <PrimaryButton
          label="Edit Trip"
          icon="pencil-outline"
          onPress={() => navigation.navigate("CreateTrip", { tripId })}
        />
        <View style={styles.stickyRow}>
          <PrimaryButton
            variant="outline"
            style={styles.stickyFlex}
            label={`Requests (${trip._count.joinRequests})`}
            icon="account-group-outline"
            onPress={() => navigation.navigate("JoinRequestsInbox", { tripId })}
          />
          {group && (
            <PrimaryButton
              variant="outline"
              style={styles.stickyFlex}
              label="Group Chat"
              icon="chat-processing-outline"
              onPress={() => navigation.navigate("GroupChat", { groupId: group.id, tripTitle: trip.title })}
            />
          )}
        </View>
      </View>
    );
  } else if (isMember && group) {
    actionSlot = (
      <PrimaryButton
        label="Open Group Chat"
        icon="chat-processing-outline"
        onPress={() => navigation.navigate("GroupChat", { groupId: group.id, tripTitle: trip.title })}
      />
    );
  } else if (myRequest?.status === "PENDING") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.warningText} />
        <Text style={styles.pendingText}>Your request is pending approval</Text>
      </View>
    );
  } else if (myRequest?.status === "REJECTED") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingText}>Your request wasn't approved for this trip</Text>
      </View>
    );
  } else if (trip.joinType === "INVITE_ONLY") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <MaterialCommunityIcons name="lock-outline" size={16} color={COLORS.warningText} />
        <Text style={styles.pendingText}>Invite-only — ask the organizer to add you</Text>
      </View>
    );
  } else if (trip.status === "FULL") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingText}>This trip is full</Text>
      </View>
    );
  } else if (trip.status === "COMPLETED") {
    actionSlot = (
      <View style={styles.pendingBadge}>
        <Text style={styles.pendingText}>This trip has ended</Text>
      </View>
    );
  } else {
    actionSlot = (
      <PrimaryButton
        label="I'm Interested"
        icon="hand-front-right"
        onPress={onExpressInterest}
        loading={expressInterest.isPending}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flexScreen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Trip Details
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      <View style={isWeb ? styles.pageInnerWeb : undefined}>
        {editingPhotos ? (
          <View style={styles.photoEditPanel}>
            <Text style={styles.blockTitle}>Edit photos</Text>
            <View style={styles.photoEditRow}>
              {editImages.map((uri) => (
                <View key={uri} style={styles.photoEditThumbWrap}>
                  <Image source={{ uri: optimizedImageUrl(uri, 76) }} style={styles.photoEditThumb} />
                  <TouchableOpacity
                    style={styles.photoRemoveBadge}
                    onPress={() => setEditImages((prev) => prev.filter((i) => i !== uri))}
                  >
                    <MaterialCommunityIcons name="close" size={13} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              ))}
              {newPhotoAssets.map((asset) => (
                <View key={asset.uri} style={styles.photoEditThumbWrap}>
                  <Image source={{ uri: asset.uri }} style={styles.photoEditThumb} />
                  <TouchableOpacity
                    style={styles.photoRemoveBadge}
                    onPress={() => setNewPhotoAssets((prev) => prev.filter((a) => a.uri !== asset.uri))}
                  >
                    <MaterialCommunityIcons name="close" size={13} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.photoAddTile} onPress={pickNewPhotos}>
                <MaterialCommunityIcons name="plus" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <View style={styles.photoEditActions}>
              <PrimaryButton
                variant="outline"
                style={styles.stickyFlex}
                label="Cancel"
                onPress={() => setEditingPhotos(false)}
                disabled={isSavingPhotos}
              />
              <PrimaryButton
                style={styles.stickyFlex}
                label="Save photos"
                onPress={savePhotos}
                disabled={isSavingPhotos}
                loading={isSavingPhotos}
              />
            </View>
          </View>
        ) : (
          <View
            style={[styles.hero, { height: heroHeight }, isWeb && styles.heroWeb]}
            onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
          >
            {trip.images.length > 0 ? (
              <FlatList
                style={styles.heroList}
                data={trip.images}
                keyExtractor={(uri) => uri}
                renderItem={({ item }) =>
                  failedImages.has(item) ? (
                    <LinearGradient
                      colors={["#2563eb", "#0f766e"]}
                      style={[styles.heroImage, { width: heroWidth, height: heroHeight }]}
                    />
                  ) : (
                    <Image
                      source={{ uri: optimizedImageUrl(item, heroWidth) }}
                      style={[styles.heroImage, { width: heroWidth, height: heroHeight }]}
                      onError={() => setFailedImages((prev) => new Set(prev).add(item))}
                    />
                  )
                }
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setActiveImageIndex(Math.round(e.nativeEvent.contentOffset.x / heroWidth))
                }
              />
            ) : (
              <LinearGradient colors={["#2563eb", "#0f766e"]} style={styles.heroImage} />
            )}

            {trip.images.length > 1 && (
              <View style={styles.dotsRow}>
                {trip.images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === activeImageIndex && styles.dotActive]} />
                ))}
              </View>
            )}

            <View style={[styles.statusPill, { backgroundColor: TRIP_STATUS_COLORS[trip.status] }]}>
              <Text style={styles.statusText}>{TRIP_STATUS_LABELS[trip.status]}</Text>
            </View>

            {isOwner && (
              <TouchableOpacity style={styles.photoEditTrigger} onPress={startEditingPhotos}>
                <MaterialCommunityIcons name="camera-outline" size={14} color={COLORS.white} />
                <Text style={styles.photoEditTriggerText}>Edit photos</Text>
              </TouchableOpacity>
            )}

            <LinearGradient colors={["transparent", "rgba(15,23,42,0.85)"]} style={styles.heroScrim}>
              <Text style={styles.title} numberOfLines={2}>
                {trip.title}
              </Text>
              <View style={styles.heroMetaRow}>
                <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.border} />
                <Text style={styles.heroSubtitle} numberOfLines={1}>
                  {trip.destination}
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="routes" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {trip.startLocation} → {trip.destination}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="calendar-range" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name={TRAVEL_MODE_ICONS[trip.travelMode]} size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>{travelModeText(trip.travelMode)}</Text>
          </View>
          {trip.budget != null && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="cash" size={18} color={COLORS.primary} />
              <Text style={styles.infoText}>Approx. budget ₹{trip.budget}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account-multiple" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {trip.seatsFilled}/{trip.seats} seats filled
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account-circle" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>Organized by {trip.owner.name}</Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => likeTrip.mutate({ tripId, input: !trip.isLiked })}
              style={[styles.iconAction, trip.isLiked && styles.iconActionLikeActive]}
            >
              <MaterialCommunityIcons
                name={trip.isLiked ? "heart" : "heart-outline"}
                size={16}
                color={trip.isLiked ? COLORS.danger : "#334155"}
              />
              <Text style={[styles.iconActionText, trip.isLiked && { color: COLORS.danger }]}>{trip._count.likes}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => bookmarkTrip.mutate({ tripId, input: !trip.isBookmarked })}
              style={[styles.iconAction, trip.isBookmarked && styles.iconActionSaveActive]}
            >
              <MaterialCommunityIcons
                name={trip.isBookmarked ? "bookmark" : "bookmark-outline"}
                size={16}
                color={trip.isBookmarked ? COLORS.primary : "#334155"}
              />
              <Text style={[styles.iconActionText, trip.isBookmarked && { color: COLORS.primary }]}>
                {trip.isBookmarked ? "Saved" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>{trip.description}</Text>

          {trip.placesToVisit.length > 0 && (
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <MaterialCommunityIcons name="map-marker-distance" size={16} color={COLORS.ink} />
                <Text style={styles.blockTitle}>Places to visit</Text>
              </View>
              {trip.placesToVisit.map((place) => (
                <View key={place} style={styles.listItemRow}>
                  <View style={styles.listDot} />
                  <Text style={styles.listItem}>{place}</Text>
                </View>
              ))}
            </View>
          )}

          {trip.notes && (
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <MaterialCommunityIcons name="note-text-outline" size={16} color={COLORS.ink} />
                <Text style={styles.blockTitle}>Special notes</Text>
              </View>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.blockHeaderRow}>
            <MaterialCommunityIcons name="comment-text-outline" size={16} color={COLORS.ink} />
            <Text style={styles.blockTitle}>Comments ({comments?.length ?? 0})</Text>
          </View>

          {!comments || comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <MaterialCommunityIcons name="comment-text-outline" size={32} color="#cbd5e1" />
              <Text style={styles.emptyCommentsText}>No comments yet. Start the conversation!</Text>
            </View>
          ) : (
            <ScrollView
              nestedScrollEnabled
              style={styles.commentsList}
              contentContainerStyle={styles.commentsListContent}
            >
              {comments.map((c) => (
                <View key={c.id} style={styles.commentCard}>
                  {c.user.photoUrl ? (
                    <Image source={{ uri: optimizedImageUrl(c.user.photoUrl, 34) }} style={styles.commentAvatar} />
                  ) : (
                    <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                      <Text style={styles.commentAvatarInitial}>{c.user.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.commentBody}>
                    <View style={styles.commentHeaderRow}>
                      <Text style={styles.commentAuthor}>{c.user.name}</Text>
                      <Text style={styles.commentTime}>{formatRelativeTime(c.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor={COLORS.mutedLight}
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={onSendComment}
              disabled={!commentText.trim() || addComment.isPending}
            >
              {addComment.isPending ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <MaterialCommunityIcons name="send" size={18} color={COLORS.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={isWeb ? styles.stickyBarInnerWeb : undefined}>{actionSlot}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexScreen: { flex: 1, backgroundColor: COLORS.white },
  skeletonHero: { width: "100%", height: 260, borderRadius: 0 },
  skeletonSection: { padding: 16, gap: 12 },
  skeletonLine: { height: 14, width: "80%" },
  skeletonLineShort: { height: 14, width: "50%" },
  container: { flex: 1, backgroundColor: COLORS.white },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.fieldBg,
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: COLORS.ink },
  headerSpacer: { width: 40, height: 40 },
  pageInnerWeb: { width: "100%", maxWidth: 760, alignSelf: "center" },
  hero: { width: "100%", borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" },
  heroWeb: { borderRadius: 20, marginTop: 20 },
  heroList: { flex: 1 },
  heroImage: { width: "100%", height: "100%" },
  statusPill: {
    position: "absolute",
    top: 14,
    right: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  statusText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  photoEditTrigger: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoEditTriggerText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  heroScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 18,
  },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  heroSubtitle: { fontSize: 13, color: COLORS.border, flexShrink: 1 },
  dotsRow: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: COLORS.white },
  photoEditPanel: { padding: 16, borderBottomWidth: 8, borderBottomColor: "#f1f5f9" },
  photoEditRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  photoEditThumbWrap: { width: 76, height: 76 },
  photoEditThumb: { width: 76, height: 76, borderRadius: 10 },
  photoRemoveBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAddTile: {
    width: 76,
    height: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoEditActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  section: { paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 8, borderBottomColor: "#f1f5f9" },
  title: { fontSize: 21, fontWeight: "700", color: COLORS.white },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  infoText: { fontSize: 14, color: "#334155", flexShrink: 1 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 4 },
  iconAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: COLORS.fieldBg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconActionLikeActive: { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorderLight },
  iconActionSaveActive: { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorderLight },
  iconActionText: { fontSize: 13, fontWeight: "600", color: "#334155" },
  description: { fontSize: 14, color: "#1e293b", marginTop: 16, lineHeight: 21 },
  block: { marginTop: 20 },
  blockHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  blockTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  listItemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  listDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.primary, marginTop: 7 },
  listItem: { fontSize: 13.5, color: "#334155", flexShrink: 1, lineHeight: 19 },
  notesText: {
    fontSize: 13.5,
    color: "#475569",
    lineHeight: 20,
    backgroundColor: COLORS.fieldBg,
    borderRadius: 12,
    padding: 12,
  },
  ownerActions: { gap: 10 },
  stickyRow: { flexDirection: "row", gap: 10 },
  stickyFlex: { flex: 1 },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.field,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  pendingText: { color: COLORS.warningText, textAlign: "center", fontSize: 13.5, flexShrink: 1 },
  stickyBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  stickyBarInnerWeb: { width: "100%", maxWidth: 480, alignSelf: "center" },
  emptyComments: { alignItems: "center", paddingVertical: 28, gap: 10 },
  emptyCommentsText: { fontSize: 13.5, color: COLORS.mutedLight, textAlign: "center" },
  commentsList: { maxHeight: 320, borderWidth: 1, borderColor: "#f1f5f9", borderRadius: RADIUS.field },
  commentsListContent: { padding: 10, gap: 10 },
  commentCard: { flexDirection: "row", gap: 10 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17 },
  commentAvatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  commentAvatarInitial: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  commentBody: { flex: 1 },
  commentHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  commentAuthor: { fontWeight: "700", fontSize: 13, color: COLORS.ink },
  commentTime: { fontSize: 11, color: COLORS.mutedLight },
  commentText: { fontSize: 13.5, color: "#334155", marginTop: 2, lineHeight: 19 },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 14 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
    maxHeight: 100,
    backgroundColor: COLORS.fieldBg,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
