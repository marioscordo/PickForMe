import React from "react";
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius } from "../../theme/tokens";

const gustaroAvatar = require("../../../assets/concierge/gustaroai-avatar.png");

const BASE_WIDTH = 393;
const screenWidth = Dimensions.get("window").width;
const scale = Math.min(Math.max(screenWidth / BASE_WIDTH, 0.92), 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * Math.min(Math.max(scale, 0.94), 1.03));
}

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
        <View style={local.homeButtonContent}>
          <View style={local.avatarBubble}>
            <Image source={gustaroAvatar} style={local.avatarImage} resizeMode="cover" />
          </View>
          <Text style={local.homeButtonText}>{content.navigation.home}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  homeBar: {
    alignItems: "center",
    backgroundColor: premiumColors.background,
    borderTopColor: "rgba(231, 222, 210, 0.44)",
    borderTopWidth: 1,
    paddingBottom: s(16),
    paddingHorizontal: s(28),
    paddingTop: s(12)
  },

  homeButton: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: s(64),
    paddingHorizontal: s(26),
    paddingVertical: s(12),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(9) },
    shadowOpacity: 0.06,
    shadowRadius: s(16),
    width: "100%"
  },

  homeButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: s(14),
    justifyContent: "center"
  },

  avatarBubble: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: s(36),
    justifyContent: "center",
    overflow: "hidden",
    width: s(36)
  },

  avatarImage: {
    height: s(34),
    width: s(34)
  },

  homeButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  },

  homeButtonText: {
    color: premiumColors.olive,
    fontSize: fs(20),
    fontWeight: "800",
    lineHeight: fs(25),
    textAlign: "center"
  }
});
