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
    paddingTop: 20,
    paddingBottom: 130
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
    fontSize: 20,
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
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.5
  },

  h3: {
    fontSize: 14,
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
    minHeight: 150,
    maxHeight: 190,
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
    fontSize: 16,
    textAlign: "center"
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

  profileChip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8
  },

  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },

  profileChipActive: {
    backgroundColor: "#E8F3F1",
    borderColor: "#8FB9B4"
  },

  chipIcon: {
    alignItems: "center",
    backgroundColor: "#EEF7F3",
    borderRadius: 999,
    height: 26,
    justifyContent: "center",
    width: 26
  },

  chipIconActive: {
    backgroundColor: "#D7ECE8"
  },

  chipIconText: {
    fontSize: 13
  },

  chipText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },

  chipTextActive: {
    color: "#FFFFFF"
  },

  profileChipTextActive: {
    color: colors.text
  },

  profileEditorSurface: {
    marginBottom: 14
  },

  profileDetailSurface: {
    marginBottom: 14
  },

  profileSection: {
    marginTop: 18,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border
  },

  profileSectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 6
  },

  profileSectionHint: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: 14
  },

  profileSubBlock: {
    marginTop: 16
  },

  profileDetailBlock: {
    marginBottom: 18
  },

  profilePromptBlock: {
    marginBottom: 4,
    marginTop: 6
  },

  profileSettingsList: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 18,
    overflow: "hidden"
  },

  profileMenuRow: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12
  },

  profileMenuIcon: {
    alignItems: "center",
    backgroundColor: "#E8F3F1",
    borderRadius: 16,
    height: 42,
    justifyContent: "center",
    width: 42
  },

  profileMenuIconText: {
    fontSize: 18
  },

  profileMenuTextBlock: {
    flex: 1
  },

  profileMenuTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },

  profileMenuDetail: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3
  },

  profileMenuChevron: {
    color: colors.muted,
    fontSize: 28,
    fontWeight: "700"
  },

  profileNav: {
    gap: 8,
    marginTop: 8,
    marginBottom: 16
  },

  profileNavButton: {
    backgroundColor: "#8FB9B4",
    borderColor: "#8FB9B4",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15
  },

  profileNavButtonActive: {
    backgroundColor: "#7EA9B8",
    borderColor: "#7EA9B8"
  },

  profileNavButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },

  profileNavButtonTextActive: {
    color: "#FFFFFF"
  },

  error: {
    color: colors.danger,
    fontWeight: "800",
    marginBottom: 12
  },

  errorCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14
  },

  errorTitle: {
    color: "#9A3412",
    fontWeight: "900",
    fontSize: 14,
    marginBottom: 6
  },

  errorText: {
    color: "#7C2D12",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700"
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
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    lineHeight: 23
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

  qrCameraBox: {
    height: 280,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#000000",
    marginTop: 8,
    marginBottom: 12
  },

  qrCamera: {
    flex: 1
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



