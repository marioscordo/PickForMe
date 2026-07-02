import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";

type ActionButtonVariant = "primary" | "secondary" | "accent";

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({ label, onPress, disabled, variant = "primary", style }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[buttonStyles.base, buttonStyles[variant], disabled && buttonStyles.disabled, style]}
    >
      <Text style={[buttonStyles.text, variant !== "primary" && buttonStyles.darkText]}>{label}</Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl
  },
  primary: {
    backgroundColor: semanticColors.primary
  },
  secondary: {
    backgroundColor: semanticColors.primarySoft
  },
  accent: {
    backgroundColor: semanticColors.accent
  },
  disabled: {
    opacity: 0.55
  },
  text: {
    color: semanticColors.surface,
    fontSize: typography.button.fontSize,
    fontWeight: typography.button.fontWeight,
    lineHeight: typography.button.lineHeight,
    textAlign: "center"
  },
  darkText: {
    color: semanticColors.text
  }
});
