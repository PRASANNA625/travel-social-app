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
};

export const RADIUS = { pill: 999, card: 24, field: 14, chip: 16, badge: 14 };

export const SHADOW = {
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  button: {
    shadowColor: "#0f766e",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
};

export const TYPE = {
  heading: { fontSize: 24, fontWeight: "800" as const, color: COLORS.ink },
  subheading: { fontSize: 13.5, color: COLORS.muted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600" as const, color: COLORS.ink },
  body: { fontSize: 15, color: COLORS.ink },
};
