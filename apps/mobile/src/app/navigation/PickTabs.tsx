import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, spacing } from "../../theme/tokens";

export function BottomTabs({
  onGoHome
}: {
  onGoHome: () => void;
}) {
  const content = useMobileContent();

  return (
    <View style={local.homeBar}>
      <Pressable
        accessibilityRole="button"
        onPress={onGoHome}
        style={({ pressed }) => [
          local.homeButton,
          pressed ? local.homeButtonPressed : null
        ]}
      >
        <Text style={local.homeButtonText}>{content.navigation.home}</Text>
      </Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  homeBar: {
    alignItems: "center",
    backgroundColor: premiumColors.background,
    borderTopColor: "rgba(231, 222, 210, 0.72)",
    borderTopWidth: 1,
    paddingBottom: 20,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md
  },

  homeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.86)",
    borderColor: "rgba(116, 109, 100, 0.18)",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    width: "100%"
  },

  homeButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  },

  homeButtonText: {
    color: premiumColors.olive,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  }
});
