export const palette = {
  ink: "#111827",
  snow: "#F4F7FA",
  white: "#FFFFFF",
  slate: "#6B7280",
  line: "#D7DEE8",
  mist: "#E8EDF4",
  aqua: "#8FB9B4",
  aquaStrong: "#7EA9B8",
  aquaSoft: "#E8F3F1",
  aquaSoftStrong: "#D7ECE8",
  orangeSoft: "#FFF7ED",
  orangeLine: "#FDBA74",
  orangeText: "#9A3412",
  orangeBody: "#7C2D12",
  green: "#047857",
  red: "#B91C1C",
  black: "#000000"
};

export const semanticColors = {
  background: palette.snow,
  surface: palette.white,
  surfaceSoft: palette.mist,
  text: palette.ink,
  textMuted: palette.slate,
  border: palette.line,
  primary: palette.ink,
  primarySoft: palette.mist,
  accent: palette.aqua,
  accentActive: palette.aquaStrong,
  accentSoft: palette.aquaSoft,
  accentSoftActive: palette.aquaSoftStrong,
  danger: palette.red,
  success: palette.green,
  warningSurface: palette.orangeSoft,
  warningBorder: palette.orangeLine,
  warningText: palette.orangeText,
  warningBody: palette.orangeBody
};

export const spacing = {
  none: 0,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 18,
  screen: 20,
  section: 24,
  stack: 32
};

export const radius = {
  sm: 16,
  md: 18,
  lg: 20,
  xl: 22,
  xxl: 26,
  hero: 28,
  pill: 999
};

export const typography = {
  screenTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900" as const
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900" as const
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700" as const
  },
  label: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800" as const
  },
  button: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900" as const
  }
};
