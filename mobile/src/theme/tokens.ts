export const GRADIENT_PRIMARY = {
  colors: ["#1d4ed8", "#0f766e", "#0c2b28"] as const,
  locations: [0, 0.55, 1] as const,
};

export const COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  mutedLight: "#94a3b8",
  border: "#e2e8f0",
  fieldBg: "#f8fafc",
  cardBg: "rgba(255,255,255,0.96)",
  cardBorder: "rgba(255,255,255,0.5)",
  primary: "#0f766e",
  danger: "#dc2626",
  white: "#ffffff",
  dangerBg: "#fef2f2",
  dangerBorderLight: "#fecaca",
  successBg: "#ecfdf5",
  successBorderLight: "#a7f3d0",
  warningBg: "#fef9c3",
  warningText: "#854d0e",
};

// Triply design system. Screens and components take spacing, radii, shadows and
// type sizes from here (colors come from the active palette via useTheme) so
// every screen shares one look.

// Blue for primary calls to action (Create Trip, active nav); teal (palette.primary) for selection.
export const ACTION_BLUE = "#2563eb";

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Gap between page sections, and the horizontal page gutter.
export const SECTION_SPACING = 28;
export function pageGutter(isDesktop: boolean) {
  return isDesktop ? 24 : 16;
}

export const RADIUS = { pill: 999, card: 16, field: 12, chip: 999, badge: 14, sm: 10 };

export const SHADOW = {
  // Resting cards and tiles.
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  // Things floating above the page: menus, sheets, modals.
  raised: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  button: {
    shadowColor: "#0f766e",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
};

// Type scale. Colors are left out on purpose: apply palette colors so dark mode works.
export const FONT = {
  pageTitle: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.5 },
  screenTitle: { fontSize: 20, fontWeight: "800" as const, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 19, fontWeight: "800" as const, letterSpacing: -0.3 },
  cardTitle: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15 },
  bodySmall: { fontSize: 13.5 },
  caption: { fontSize: 12.5 },
  label: { fontSize: 13, fontWeight: "600" as const },
  button: { fontSize: 15, fontWeight: "700" as const },
};

// Standard control heights.
export const CONTROL = { button: 48, buttonSmall: 40, field: 48, chip: 36, iconButton: 40 };

// Readable widths for page content on large screens.
export const PAGE_WIDTH = { form: 760, content: 1100 };

export const TYPE = {
  heading: { fontSize: 24, fontWeight: "800" as const, color: COLORS.ink },
  subheading: { fontSize: 13.5, color: COLORS.muted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600" as const, color: COLORS.ink },
  body: { fontSize: 15, color: COLORS.ink },
};
