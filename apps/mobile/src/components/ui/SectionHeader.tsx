import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { semanticColors, spacing, typography } from "../../theme/tokens";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
};

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <View style={headerStyles.container}>
      <Text style={headerStyles.title}>{title}</Text>
      {subtitle ? <Text style={headerStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md
  },
  title: {
    color: semanticColors.text,
    fontSize: typography.sectionTitle.fontSize,
    fontWeight: typography.sectionTitle.fontWeight,
    lineHeight: typography.sectionTitle.lineHeight
  },
  subtitle: {
    color: semanticColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.xs
  }
});
