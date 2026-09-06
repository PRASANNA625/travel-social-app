import { useMemo } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { GroupMember, PresenceInfo } from "../types";
import { RADIUS, TYPE } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { Palette } from "../theme/palettes";
import { optimizedImageUrl } from "../utils/optimizedImage";

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Offline";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d ago`;
}

export function GroupMembersModal({
  visible,
  onClose,
  members,
  presence,
  onSelectMember,
}: {
  visible: boolean;
  onClose: () => void;
  members: GroupMember[];
  presence: Record<string, PresenceInfo>;
  onSelectMember?: (member: GroupMember) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Group Members</Text>
            <Text style={styles.count}>{members.length}</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.map((member) => {
              const info = presence[member.userId];
              const online = info?.online ?? false;
              return (
                <TouchableOpacity
                  key={member.userId}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => onSelectMember?.(member)}
                >
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
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {member.user.name}
                      </Text>
                      {member.role === "OWNER" && (
                        <View style={styles.ownerChip}>
                          <Text style={styles.ownerChipText}>Owner</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.status}>{online ? "Online" : formatLastSeen(info?.lastSeenAt ?? null)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: RADIUS.card,
      borderTopRightRadius: RADIUS.card,
      paddingHorizontal: 20,
      paddingTop: 10,
      maxHeight: "75%",
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 14 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { ...TYPE.heading, fontSize: 17, color: colors.ink },
    count: { fontSize: 14, color: colors.muted, fontWeight: "600" },
    list: { marginTop: 4 },
    listContent: { paddingBottom: 24, gap: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
    avatarWrap: { position: "relative" },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    avatarInitial: { color: colors.white, fontSize: 16, fontWeight: "700" },
    onlineDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: "#22c55e",
      borderWidth: 2,
      borderColor: colors.surfaceElevated,
    },
    textWrap: { flex: 1 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { fontSize: 14.5, fontWeight: "700", color: colors.ink, flexShrink: 1 },
    ownerChip: { backgroundColor: colors.primary, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
    ownerChipText: { fontSize: 10.5, fontWeight: "700", color: colors.white },
    status: { fontSize: 12, color: colors.muted, marginTop: 2 },
  });
}
