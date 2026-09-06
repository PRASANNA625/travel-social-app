export interface Palette {
  ink: string;
  muted: string;
  mutedLight: string;
  border: string;
  divider: string;
  fieldBg: string;
  surface: string;
  surfaceElevated: string;
  cardBg: string;
  cardBorder: string;
  primary: string;
  primaryMuted: string;
  danger: string;
  dangerBg: string;
  dangerBorderLight: string;
  successBg: string;
  successBorderLight: string;
  successText: string;
  warningBg: string;
  warningText: string;
  white: string;
  overlay: string;
  iconMuted: string;
  statusBarStyle: "light" | "dark";
  navBarBg: string;
}

export const lightPalette: Palette = {
  ink: "#0f172a",
  muted: "#64748b",
  mutedLight: "#94a3b8",
  border: "#e2e8f0",
  divider: "#f1f5f9",
  fieldBg: "#f8fafc",
  surface: "#f8fafc",
  surfaceElevated: "#ffffff",
  cardBg: "rgba(255,255,255,0.96)",
  cardBorder: "rgba(255,255,255,0.5)",
  primary: "#0f766e",
  primaryMuted: "rgba(15,118,110,0.08)",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  dangerBorderLight: "#fecaca",
  successBg: "#ecfdf5",
  successBorderLight: "#a7f3d0",
  successText: "#166534",
  warningBg: "#fef9c3",
  warningText: "#854d0e",
  white: "#ffffff",
  overlay: "rgba(15,23,42,0.5)",
  iconMuted: "#94a3b8",
  statusBarStyle: "dark",
  navBarBg: "#ffffff",
};

export const darkPalette: Palette = {
  ink: "#e6ebf5",
  muted: "#94a3b8",
  mutedLight: "#64748b",
  border: "rgba(255,255,255,0.10)",
  divider: "rgba(255,255,255,0.08)",
  fieldBg: "#0f1626",
  surface: "#0b1120",
  surfaceElevated: "#141c2e",
  cardBg: "#141c2e",
  cardBorder: "rgba(255,255,255,0.08)",
  primary: "#14b8a6",
  primaryMuted: "rgba(20,184,166,0.16)",
  danger: "#f87171",
  dangerBg: "rgba(248,113,113,0.12)",
  dangerBorderLight: "rgba(248,113,113,0.3)",
  successBg: "rgba(16,185,129,0.14)",
  successBorderLight: "rgba(16,185,129,0.35)",
  successText: "#4ade80",
  warningBg: "rgba(250,204,21,0.14)",
  warningText: "#facc15",
  white: "#ffffff",
  overlay: "rgba(0,0,0,0.6)",
  iconMuted: "#7c8aa5",
  statusBarStyle: "light",
  navBarBg: "#0f1626",
};
