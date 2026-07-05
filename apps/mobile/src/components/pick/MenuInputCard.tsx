import { StyleSheet, Text, TextInput } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, spacing } from "../../theme/tokens";
import { Surface } from "../ui/Surface";

export function MenuInputCard({
  menuText,
  setMenuText,
  compact = false
}: {
  menuText: string;
  setMenuText: (value: string) => void;
  compact?: boolean;
}) {
  const content = useMobileContent();

  return (
    <Surface style={local.card}>
      <Text style={local.kicker}>{content.menuInput.kicker}</Text>

      <Text style={local.hint}>{content.menuInput.hint}</Text>

      <TextInput
        testID="menu-input-textarea"
        multiline
        scrollEnabled
        style={[local.textArea, compact && local.textAreaCompact]}
        value={menuText}
        onChangeText={setMenuText}
        placeholder={content.menuInput.placeholder}
        placeholderTextColor={premiumColors.textMuted}
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect={false}
      />
    </Surface>
  );
}

const local = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    borderWidth: 0,
    marginBottom: spacing.section,
    padding: 0
  },
  kicker: {
    color: premiumColors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
    marginBottom: spacing.xs
  },
  hint: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    marginBottom: spacing.sm
  },
  textArea: {
    backgroundColor: "rgba(255, 253, 248, 0.76)",
    borderColor: "rgba(231, 222, 210, 0.82)",
    borderRadius: radius.xl,
    borderWidth: 1,
    color: premiumColors.text,
    fontSize: 16,
    height: 124,
    lineHeight: 21,
    maxHeight: 124,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  textAreaCompact: {
    height: 88,
    maxHeight: 88
  }
});
