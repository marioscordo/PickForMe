import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { radius, semanticColors, spacing } from "../../theme/tokens";

type SurfaceTone = "default" | "soft" | "accent";

type SurfaceProps = {
  children: React.ReactNode;
  tone?: SurfaceTone;
  style?: StyleProp<ViewStyle>;
};

export function Surface({ children, tone = "default", style }: SurfaceProps) {
  return <View style={[surfaceStyles.base, surfaceStyles[tone], style]}>{children}</View>;
}

const surfaceStyles = StyleSheet.create({
  base: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.xl
  },
  default: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border
  },
  soft: {
    backgroundColor: semanticColors.primarySoft,
    borderColor: semanticColors.border
  },
  accent: {
    backgroundColor: semanticColors.accentSoft,
    borderColor: semanticColors.accent
  }
});
