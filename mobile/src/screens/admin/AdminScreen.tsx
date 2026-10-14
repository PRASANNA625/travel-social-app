import { useMemo, useState, type ComponentType } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { isAxiosError } from "axios";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/types";
import { atLeast, errorMessage, useAdminAlerts, useAdminMe, type UserRole } from "../../api/admin";
import { AdminButton, AdminFeedbackProvider, Avatar, LoadingBlock, humanize } from "../../components/admin/AdminUI";
import { useTheme } from "../../theme/ThemeContext";
import { RADIUS, SHADOW } from "../../theme/tokens";
import { AdminNavContext, SECTIONS, type AdminNav, type SectionKey } from "./AdminContext";
import { TripDrawer, UserDrawer } from "./Drawers";
import { OverviewSection } from "./sections/OverviewSection";
import { UsersSection } from "./sections/UsersSection";
import { TripsSection } from "./sections/TripsSection";
import { EventsSection } from "./sections/EventsSection";
import { BuddiesSection } from "./sections/BuddiesSection";
import { ReportsSection } from "./sections/ReportsSection";
import { ReviewsSection } from "./sections/ReviewsSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { ConfigSection } from "./sections/ConfigSection";
import { AnalyticsSection } from "./sections/AnalyticsSection";
import { RolesSection } from "./sections/RolesSection";
import { AuditSection } from "./sections/AuditSection";

type Props = NativeStackScreenProps<AppStackParamList, "Admin">;

const SECTION_COMPONENTS: Record<SectionKey, ComponentType> = {
  overview: OverviewSection,
  users: UsersSection,
  trips: TripsSection,
  events: EventsSection,
  buddies: BuddiesSection,
  reports: ReportsSection,
  reviews: ReviewsSection,
  notifications: NotificationsSection,
  config: ConfigSection,
  analytics: AnalyticsSection,
  roles: RolesSection,
  audit: AuditSection,
};

// Width at which the section menu sits beside the content instead of behind a button.
const WIDE = 1024;

function visibleSections(role: UserRole) {
  return SECTIONS.map((g) => ({ ...g, items: g.items.filter((i) => atLeast(role, i.minRole)) })).filter((g) => g.items.length > 0);
}

function SectionMenu({ role, active, onSelect, onExit }: { role: UserRole; active: SectionKey; onSelect: (key: SectionKey) => void; onExit: () => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.menu}>
      {visibleSections(role).map((group) => (
        <View key={group.group} style={styles.menuGroup}>
          <Text style={[styles.menuGroupLabel, { color: colors.mutedLight }]}>{group.group}</Text>
          {group.items.map((item) => {
            const focused = item.key === active;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => onSelect(item.key)}
                style={[styles.menuItem, focused && { backgroundColor: colors.primaryMuted }]}
                accessibilityRole="link"
                accessibilityState={focused ? { selected: true } : {}}
              >
                <MaterialCommunityIcons name={item.icon} size={19} color={focused ? colors.primary : colors.muted} />
                <Text style={[styles.menuLabel, { color: focused ? colors.primary : colors.ink }, focused && styles.menuLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <TouchableOpacity onPress={onExit} style={[styles.menuItem, styles.menuExit, { borderColor: colors.border }]} accessibilityRole="link">
        <MaterialCommunityIcons name="arrow-left" size={19} color={colors.muted} />
        <Text style={[styles.menuLabel, { color: colors.ink }]}>Back to Triply</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Searches users or trips from anywhere in the dashboard.
function GlobalSearch({ onSearch }: { onSearch: (section: "users" | "trips", query: string) => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const query = text.trim();
  const go = (section: "users" | "trips") => {
    if (!query) return;
    onSearch(section, query);
    setText("");
    setOpen(false);
  };
  return (
    <View style={styles.search}>
      <View style={[styles.searchBox, { backgroundColor: colors.fieldBg, borderColor: focused ? colors.primary : colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={19} color={colors.muted} />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            setOpen(!!v.trim());
          }}
          onSubmitEditing={() => go("users")}
          placeholder="Search users and trips…"
          placeholderTextColor={colors.mutedLight}
          style={[styles.searchInput, { color: colors.ink }]}
          accessibilityLabel="Search users and trips"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {open && query ? (
        <View style={[styles.dropdown, styles.searchDropdown, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          {(["users", "trips"] as const).map((section) => (
            <TouchableOpacity key={section} onPress={() => go(section)} style={styles.dropdownRow} accessibilityRole="button">
              <MaterialCommunityIcons name={section === "users" ? "account-search-outline" : "map-search-outline"} size={18} color={colors.muted} />
              <Text style={[styles.dropdownText, { color: colors.ink }]} numberOfLines={1}>
                {section === "users" ? "Users" : "Trips"} matching “{query}”
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AlertsBell({ onGo }: { onGo: AdminNav["goTo"] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const { data } = useAdminAlerts();
  const items = data
    ? [
        { count: data.openReports, label: "open reports", icon: "flag-outline" as const, go: () => onGo("reports", { status: "OPEN" }) },
        { count: data.newFeedback, label: "new feedback", icon: "message-alert-outline" as const, go: () => onGo("reviews") },
        { count: data.staleJoinRequests, label: "join requests waiting over 3 days", icon: "account-clock-outline" as const, go: () => onGo("events") },
      ]
    : [];
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
        accessibilityRole="button"
        accessibilityLabel={total ? `Alerts, ${total} need attention` : "Alerts"}
      >
        <MaterialCommunityIcons name="bell-outline" size={20} color={colors.ink} />
        {total > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.danger }]}>
            <Text style={styles.badgeText}>{total > 99 ? "99+" : total}</Text>
          </View>
        )}
      </TouchableOpacity>
      {open && (
        <View style={[styles.dropdown, styles.alertsDropdown, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.dropdownTitle, { color: colors.ink }]}>Needs attention</Text>
          {total === 0 ? (
            <Text style={[styles.dropdownEmpty, { color: colors.muted }]}>All clear. Nothing is waiting.</Text>
          ) : (
            items
              .filter((i) => i.count > 0)
              .map((i) => (
                <TouchableOpacity
                  key={i.label}
                  onPress={() => {
                    setOpen(false);
                    i.go();
                  }}
                  style={styles.dropdownRow}
                  accessibilityRole="link"
                >
                  <MaterialCommunityIcons name={i.icon} size={18} color={colors.muted} />
                  <Text style={[styles.dropdownText, { color: colors.ink }]}>
                    <Text style={{ fontWeight: "800" }}>{i.count}</Text> {i.label}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedLight} />
                </TouchableOpacity>
              ))
          )}
        </View>
      )}
    </View>
  );
}

function NoAccess({ message, onExit, onRetry }: { message: string; onExit: () => void; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.surface }]}>
      <MaterialCommunityIcons name="shield-lock-outline" size={44} color={colors.mutedLight} />
      <Text style={[styles.noAccessTitle, { color: colors.ink }]}>Admin dashboard</Text>
      <Text style={[styles.noAccessText, { color: colors.muted }]}>{message}</Text>
      <View style={styles.row}>
        {onRetry && <AdminButton label="Try again" onPress={onRetry} />}
        <AdminButton label="Back to Triply" variant="primary" onPress={onExit} />
      </View>
    </View>
  );
}

export function AdminScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const me = useAdminMe();
  const [section, setSection] = useState<SectionKey>("overview");
  const [params, setParams] = useState<AdminNav["initialParams"]>({});
  // Bumped on every goTo so a section re-reads its starting filters.
  const [visit, setVisit] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);

  const exit = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs"));

  const nav = useMemo<AdminNav | null>(
    () =>
      me.data
        ? {
            role: me.data.role,
            myId: me.data.id,
            initialParams: params,
            goTo: (key, p) => {
              setSection(key);
              setParams(p ?? {});
              setVisit((v) => v + 1);
              setMenuOpen(false);
              setUserId(null);
              setTripId(null);
            },
            openUser: (id) => {
              setTripId(null);
              setUserId(id);
            },
            openTrip: (id) => {
              setUserId(null);
              setTripId(id);
            },
          }
        : null,
    [me.data, params]
  );

  if (me.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <LoadingBlock label="Checking your access…" />
      </View>
    );
  }
  if (me.error || !nav || !me.data) {
    const status = isAxiosError(me.error) ? me.error.response?.status : undefined;
    return status === 403 || status === 401 ? (
      <NoAccess message="This area is for Triply staff. Your account doesn't have dashboard access." onExit={exit} />
    ) : (
      <NoAccess message={errorMessage(me.error, "Couldn't open the dashboard.")} onExit={exit} onRetry={me.refetch} />
    );
  }

  const allowed = visibleSections(nav.role).flatMap((g) => g.items);
  const current = allowed.find((i) => i.key === section) ?? allowed[0];
  const Section = SECTION_COMPONENTS[current.key];

  return (
    <AdminNavContext.Provider value={nav}>
      <AdminFeedbackProvider>
        <View style={[styles.root, { backgroundColor: colors.surface }]}>
          {wide && (
            <View style={[styles.sidebar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={styles.brand}>
                <Image source={require("../../../assets/logo.png")} style={styles.logo} accessibilityIgnoresInvertColors />
                <View>
                  <Text style={[styles.brandName, { color: colors.ink }]}>Triply</Text>
                  <Text style={[styles.brandSub, { color: colors.muted }]}>Admin</Text>
                </View>
              </View>
              <SectionMenu role={nav.role} active={current.key} onSelect={(k) => nav.goTo(k)} onExit={exit} />
            </View>
          )}

          <View style={styles.main}>
            {/* zIndex keeps the search and alert dropdowns above the content below. */}
            <View style={[styles.topBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              {!wide && (
                <TouchableOpacity
                  onPress={() => setMenuOpen(true)}
                  style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open admin menu"
                >
                  <MaterialCommunityIcons name="menu" size={20} color={colors.ink} />
                </TouchableOpacity>
              )}
              {!wide && width < 560 ? (
                <Text style={[styles.topTitle, { color: colors.ink }]} numberOfLines={1}>
                  {current.label}
                </Text>
              ) : (
                <GlobalSearch onSearch={(k, q) => nav.goTo(k, { search: q })} />
              )}
              <View style={styles.topRight}>
                <AlertsBell onGo={nav.goTo} />
                <View style={styles.profile} accessibilityLabel={`Signed in as ${me.data.name}, ${humanize(me.data.role)}`}>
                  <Avatar name={me.data.name} photoUrl={me.data.photoUrl} size={34} />
                  {width >= 720 && (
                    <View>
                      <Text style={[styles.profileName, { color: colors.ink }]} numberOfLines={1}>
                        {me.data.name}
                      </Text>
                      <Text style={[styles.profileRole, { color: colors.primary }]}>{humanize(me.data.role)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <ScrollView style={styles.flex1} contentContainerStyle={[styles.content, { paddingHorizontal: width < 560 ? 14 : 24 }]}>
              {!wide && width < 560 && (
                <View style={styles.phoneSearch}>
                  <GlobalSearch onSearch={(k, q) => nav.goTo(k, { search: q })} />
                </View>
              )}
              <Section key={`${current.key}-${visit}`} />
            </ScrollView>
          </View>

          {!wide && (
            <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
              <View style={[styles.menuOverlay, { backgroundColor: colors.overlay }]}>
                <View style={[styles.menuSheet, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={[styles.menuSheetHead, { borderColor: colors.border }]}>
                    <Text style={[styles.brandName, { color: colors.ink }]}>Admin</Text>
                    <TouchableOpacity onPress={() => setMenuOpen(false)} style={[styles.iconButton, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Close menu">
                      <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
                    </TouchableOpacity>
                  </View>
                  <SectionMenu role={nav.role} active={current.key} onSelect={(k) => nav.goTo(k)} onExit={exit} />
                </View>
                <Pressable style={styles.flex1} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
              </View>
            </Modal>
          )}

          <UserDrawer userId={userId} onClose={() => setUserId(null)} />
          <TripDrawer tripId={tripId} onClose={() => setTripId(null)} />
        </View>
      </AdminFeedbackProvider>
    </AdminNavContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  flex1: { flex: 1 },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  noAccessTitle: { fontSize: 20, fontWeight: "800", marginTop: 6 },
  noAccessText: { fontSize: 14.5, textAlign: "center", maxWidth: 380, marginBottom: 6 },
  sidebar: { width: 248, borderRightWidth: 1, paddingTop: 22 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginBottom: 14 },
  logo: { width: 38, height: 38, borderRadius: 19 },
  brandName: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  brandSub: { fontSize: 12, fontWeight: "600", marginTop: -1 },
  menu: { paddingHorizontal: 12, paddingBottom: 20 },
  menuGroup: { marginTop: 10 },
  menuGroupLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 12, marginBottom: 4 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.sm },
  menuLabel: { fontSize: 14.5, fontWeight: "500" },
  menuLabelActive: { fontWeight: "700" },
  menuExit: { marginTop: 16, borderTopWidth: 1, borderRadius: 0, paddingTop: 14 },
  main: { flex: 1, minWidth: 0 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, zIndex: 10 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: "800" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: "auto" },
  iconButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#ffffff", fontSize: 10.5, fontWeight: "800" },
  profile: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 200 },
  profileName: { fontSize: 13.5, fontWeight: "700" },
  profileRole: { fontSize: 11.5, fontWeight: "700" },
  search: { flex: 1, maxWidth: 460, minWidth: 0 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: RADIUS.field, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14.5, height: "100%" },
  dropdown: { position: "absolute", top: 46, borderWidth: 1, borderRadius: RADIUS.field, paddingVertical: 6, ...SHADOW.raised },
  searchDropdown: { left: 0, right: 0 },
  alertsDropdown: { right: 0, width: 300 },
  dropdownTitle: { fontSize: 13, fontWeight: "800", paddingHorizontal: 14, paddingVertical: 6 },
  dropdownEmpty: { fontSize: 13.5, paddingHorizontal: 14, paddingBottom: 8 },
  dropdownRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dropdownText: { flex: 1, fontSize: 14 },
  content: { paddingTop: 22, paddingBottom: 48, width: "100%", maxWidth: 1320, alignSelf: "center" },
  phoneSearch: { marginBottom: 16, zIndex: 5 },
  menuOverlay: { flex: 1, flexDirection: "row" },
  menuSheet: { width: 290, maxWidth: "86%", height: "100%" },
  menuSheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
});
