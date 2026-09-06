import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { GroupMember, MessageReadEntry, PresenceInfo } from "../types";
import { COLORS, RADIUS, TYPE } from "../theme/tokens";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatReadTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function SeenByModal({
  visible,
  onClose,
  members,
  presence,
  readBy,
}: {
  visible: boolean;
  onClose: () => void;
  members: GroupMember[];
  presence: Record<string, PresenceInfo>;
  readBy: MessageReadEntry[];
}) {
  const readByUserId = new Map(readBy.map((r) => [r.userId, r.readAt]));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Seen by</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.map((member) => {
              const info = presence[member.userId];
              const online = info?.online ?? false;
              const readAt = readByUserId.get(member.userId);
              return (
                <View key={member.userId} style={styles.row}>
                  <View style={styles.avatarWrap}>
                    {member.user.photoUrl ? (
                      <Image source={{ uri: optimizedImageUrl(member.user.photoUrl, 84) }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>{member.user.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    {online && <View style={styles.onlineDot} />}
                  </View>
                  <View style={styles.textWrap}>
                    <Text style={styles.name} numberOfLines={1}>
                      {member.user.name}
                    </Text>
                    <Text style={readAt ? styles.statusSeen : styles.statusUnseen}>
                      {readAt ? `Seen · ${formatReadTime(readAt)}` : "Not yet seen"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "75%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 14 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { ...TYPE.heading, fontSize: 17 },
  list: { marginTop: 4 },
  listContent: { paddingBottom: 24, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  textWrap: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: "700", color: COLORS.ink },
  statusSeen: { fontSize: 12, color: COLORS.primary, fontWeight: "600", marginTop: 2 },
  statusUnseen: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
