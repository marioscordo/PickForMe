import { StyleSheet } from "react-native";

export const colors = {
  bg: "#F4F7FA",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#D7DEE8",
  primary: "#111827",
  primarySoft: "#E8EDF4",
  danger: "#B91C1C",
  success: "#047857"
};

export const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.bg
  },

  flex: {
    flex: 1
  },

  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 18
  },

  title: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: colors.text,
    marginBottom: 6
  },

  subtitle: {
    fontSize: 18,
    color: colors.muted,
    lineHeight: 25,
    marginBottom: 18
  },

  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    padding: 20,
    marginBottom: 16
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 6
  },

  heroText: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },

  h2: {
    fontSize: 25,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.5
  },

  h3: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 8
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 7
  },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
    color: colors.text
  },

  textArea: {
    minHeight: 230,
    maxHeight: 330,
    textAlignVertical: "top",
    lineHeight: 22
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 8
  },

  buttonDisabled: {
    opacity: 0.55
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 17
  },

  ghostButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 20
  },

  ghostButtonText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF"
  },

  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },

  chipText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },

  chipTextActive: {
    color: "#FFFFFF"
  },

  error: {
    color: colors.danger,
    fontWeight: "800",
    marginBottom: 12
  },

  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
    marginBottom: 10
  },

  resultItem: {
    marginTop: 18,
    paddingTop: 14,
    borderTopColor: colors.border,
    borderTopWidth: 1
  },

  resultName: {
    fontSize: 21,
    fontWeight: "900",
    color: colors.text,
    lineHeight: 27
  },

  resultMeta: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 21
  },

  reason: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 23,
    marginTop: 12
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 20
  },

  tabButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: "center"
  },

  tabButtonActive: {
    backgroundColor: colors.primary
  },

  tabButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text
  },

  tabButtonTextActive: {
    color: "#FFFFFF"
  }
});
