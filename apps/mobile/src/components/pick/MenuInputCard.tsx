import { StyleSheet, Text, TextInput } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";
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
        placeholderTextColor={semanticColors.textMuted}
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect={false}
      />
    </Surface>
  );
}

const local = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    padding: spacing.lg
  },
  kicker: {
    color: semanticColors.text,
    fontSize: typography.sectionTitle.fontSize,
    fontWeight: typography.sectionTitle.fontWeight,
    lineHeight: typography.sectionTitle.lineHeight,
    marginBottom: spacing.xs
  },
  hint: {
    color: semanticColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.sm
  },
  textArea: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: semanticColors.text,
    fontSize: 16,
    height: 124,
    lineHeight: 21,
    maxHeight: 124,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  textAreaCompact: {
    height: 68,
    maxHeight: 68
  }
});
