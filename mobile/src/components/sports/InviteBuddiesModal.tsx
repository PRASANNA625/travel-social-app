import { useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInvitableBuddies, useSendInvitation, type InvitableBuddy } from "../../api/joinRequests";
import { useTheme } from "../../theme/ThemeContext";
import { ACTION_BLUE, RADIUS, SHADOW } from "../../theme/tokens";
import { optimizedImageUrl } from "../../utils/optimizedImage";
import { SearchField } from "../theme/SearchField";

// Organizers invite their accepted travel buddies to a trip or sports meetup.
export function InviteBuddiesModal({
  visible,
  tripId,
  tripTitle,
  onClose,
  onFindBuddies,
}: {
  visible: boolean;
  tripId: string;
  tripTitle: string;
  onClose: () => void;
  onFindBuddies?: () => void;
}) {
  const { colors } = useTheme();
  const { data, isLoading, error, refetch } = useInvitableBuddies(tripId, visible);
  const invite = useSendInvitation(tripId);
  const [search, setSearch] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);

  const q = search.trim().toLowerCase();
  const buddies = (data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q) || b.location?.toLowerCase().includes(q));

  const send = (buddy: InvitableBuddy) => {
    setSendingTo(buddy.id);
    setFailed(null);
    invite.mutate(buddy.id, {
      onError: (err: any) => setFailed({ id: buddy.id, message: err?.response?.data?.error ?? "Couldn't send the invitation" }),
      onSettled: () => setSendingTo(null),
    });
  };

  const stateFor = (b: InvitableBuddy) => {
    switch (b.status) {
      case "APPROVED":
        return { label: "Joined", done: true };
      case "INVITED":
        return { label: "Invited", done: true };
      case "PENDING":
        return { label: "Approve", done: false };
      default:
        return { label: b.status === "REJECTED" ? "Invite again" : "Invite", done: false };
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
                Invite buddies
              </Text>
              <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
                to {tripTitle}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.close, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Close">
              <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          {(data?.length ?? 0) > 5 && <SearchField value={search} onChangeText={setSearch} placeholder="Search your buddies" />}

          {isLoading ? (
            <ActivityIndicator style={styles.state} color={colors.primary} />
          ) : error ? (
            <View style={styles.state}>
              <Text style={[styles.stateText, { color: colors.muted }]}>Couldn't load your buddies.</Text>
              <Text style={[styles.link, { color: colors.primary }]} onPress={() => refetch()}>
                Try again
              </Text>
            </View>
          ) : buddies.length === 0 ? (
            <View style={styles.state}>
              <MaterialCommunityIcons name="account-heart-outline" size={36} color={colors.mutedLight} />
              <Text style={[styles.stateTitle, { color: colors.ink }]}>{q ? "No buddies match" : "No travel buddies yet"}</Text>
              {!q && (
                <Text style={[styles.stateText, { color: colors.muted }]}>
                  You can invite people once you're connected as buddies. Anyone can still find this and ask to join.
                </Text>
              )}
              {!q && onFindBuddies && (
                <Text style={[styles.link, { color: colors.primary }]} onPress={onFindBuddies}>
                  Find travel buddies
                </Text>
              )}
            </View>
          ) : (
            <FlatList
              data={buddies}
              keyExtractor={(b) => b.id}
              style={styles.list}
              renderItem={({ item }) => {
                const st = stateFor(item);
                return (
                  <View style={[styles.row, { borderColor: colors.divider }]}>
                    {item.photoUrl ? (
                      <Image source={{ uri: optimizedImageUrl(item.photoUrl, 80) }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
                        <Text style={styles.initial}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {failed?.id === item.id ? (
                        <Text style={[styles.sub, { color: colors.danger }]} numberOfLines={2}>
                          {failed.message}
                        </Text>
                      ) : item.location ? (
                        <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
                          {item.location}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => send(item)}
                      disabled={st.done || sendingTo === item.id}
                      style={[styles.button, st.done ? { backgroundColor: colors.fieldBg } : styles.buttonPrimary]}
                      accessibilityRole="button"
                      accessibilityLabel={`${st.label} ${item.name}`}
                    >
                      {sendingTo === item.id ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          {st.done && <MaterialCommunityIcons name="check" size={14} color={colors.muted} />}
                          <Text style={[styles.buttonText, { color: st.done ? colors.muted : "#ffffff" }]}>{st.label}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 460, maxHeight: "80%", borderRadius: 20, padding: 18, gap: 12, ...SHADOW.raised },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, fontWeight: "800" },
  subtitle: { fontSize: 13.5, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  initial: { color: "#ffffff", fontWeight: "800" },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 14.5, fontWeight: "700" },
  sub: { fontSize: 12.5, marginTop: 1 },
  button: { minWidth: 92, height: 34, borderRadius: RADIUS.pill, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  buttonPrimary: { backgroundColor: ACTION_BLUE },
  buttonText: { fontSize: 13, fontWeight: "800" },
  state: { alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 12 },
  stateTitle: { fontSize: 15.5, fontWeight: "800" },
  stateText: { fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  link: { fontSize: 14, fontWeight: "800", marginTop: 4 },
});
