import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, spacing } from "../../theme/tokens";

const conciergeImage = require("../../../assets/concierge/gustaroai-concierge.png");

type ConciergeStartScreenProps = {
  onOpenProfile: () => void;
  onStartRecommendation: () => void;
};

export function ConciergeStartScreen({
  onOpenProfile,
  onStartRecommendation
}: ConciergeStartScreenProps) {
  const content = useMobileContent();

  return (
    <SafeAreaView style={local.shell}>
      <ScrollView
        contentContainerStyle={local.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={local.hero}>
          <View style={local.imageStage}>
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={conciergeImage}
              style={local.conciergeImage}
            />
          </View>

          <View style={local.textBlock}>
            <Text style={local.title}>{content.conciergeStart.title}</Text>
            <Text style={local.subtitle}>{content.conciergeStart.subtitle}</Text>
          </View>

          <View style={local.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onStartRecommendation}
              style={({ pressed }) => [
                local.primaryButton,
                pressed ? local.pressed : null
              ]}
            >
              <Text style={local.primaryButtonText}>{content.conciergeStart.primaryAction}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onOpenProfile}
              style={({ pressed }) => [
                local.secondaryButton,
                pressed ? local.pressed : null
              ]}
            >
              <Text style={local.secondaryButtonText}>{content.conciergeStart.secondaryAction}</Text>
            </Pressable>
          </View>

          <Text style={local.note}>{content.conciergeStart.note}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  shell: {
    backgroundColor: premiumColors.background,
    flex: 1
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 28
  },

  hero: {
    alignItems: "center",
    backgroundColor: "#FFFEFB",
    borderColor: "rgba(200, 168, 90, 0.22)",
    borderRadius: radius.hero,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 2
  },

  imageStage: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#FFFEFB",
    height: 318,
    justifyContent: "flex-start",
    marginBottom: spacing.xxl,
    overflow: "hidden"
  },

  conciergeImage: {
    aspectRatio: 1086 / 1536,
    height: 388,
    marginTop: -30
  },

  textBlock: {
    alignItems: "center",
    marginBottom: spacing.xxl
  },

  title: {
    color: premiumColors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginBottom: spacing.sm,
    textAlign: "center"
  },

  subtitle: {
    color: premiumColors.textMuted,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    maxWidth: 310,
    textAlign: "center"
  },

  actions: {
    alignSelf: "stretch",
    gap: spacing.md,
    marginBottom: spacing.lg
  },

  primaryButton: {
    alignItems: "center",
    backgroundColor: premiumColors.olive,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.xxl,
    paddingVertical: 17,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5
  },

  primaryButtonText: {
    color: premiumColors.surface,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
    textAlign: "center"
  },

  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(231, 222, 210, 0.42)",
    borderColor: "rgba(116, 109, 100, 0.16)",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.xxl,
    paddingVertical: 15
  },

  secondaryButtonText: {
    color: premiumColors.textMuted,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center"
  },

  note: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    opacity: 0.82,
    textAlign: "center"
  },

  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  }
});
