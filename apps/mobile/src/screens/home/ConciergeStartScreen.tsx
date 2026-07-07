import { Dimensions, Image, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius } from "../../theme/tokens";

const conciergeImage = require("../../../assets/concierge/gustaroai-concierge-premium-fade.png");

const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screenWidth = Dimensions.get("window").width;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

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
      <View style={local.screen}>
        <View style={local.card}>
          <View style={local.topAccent}>
            <View style={local.accentLine} />
            <View style={local.headerIcon}>
              <MaterialCommunityIcons color={premiumPalette.gold} name="chef-hat" size={s(29)} />
            </View>
            <View style={local.accentLine} />
          </View>

          <View style={local.imageStage}>
            <Image accessibilityIgnoresInvertColors resizeMode="contain" source={conciergeImage} style={local.conciergeImage} />
          </View>

          <View style={local.textBlock}>
            <View style={local.titleWrap}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} style={local.titleLineTop}>Willkommen bei</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} style={local.titleLineBrand}>GustaroAI</Text>
            </View>
            <View style={local.titleAccent}>
              <View style={local.titleLine} />
              <Text style={local.titleStar}>{"\u2605"}</Text>
              <View style={local.titleLine} />
            </View>
            <Text style={local.subtitle}>{content.conciergeStart.subtitle}</Text>
          </View>

          <View style={local.actions}>
            <Pressable accessibilityRole="button" onPress={onStartRecommendation} style={({ pressed }) => [local.primaryButton, pressed ? local.pressed : null]}>
              <View style={local.primaryIcon}><MaterialCommunityIcons color={premiumPalette.gold} name="room-service-outline" size={s(28)} /></View>
              <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.86} style={local.primaryButtonText}>{content.conciergeStart.primaryAction}</Text>
              <Feather color={premiumPalette.body} name="chevron-right" size={s(28)} style={local.primaryChevron} />
            </Pressable>

            <Pressable accessibilityRole="button" onPress={onOpenProfile} style={({ pressed }) => [local.secondaryButton, pressed ? local.pressed : null]}>
              <View style={local.secondaryIcon}><Feather color="#AA7C1E" name="user" size={s(25)} /></View>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={local.secondaryButtonText}>{content.conciergeStart.secondaryAction}</Text>
              <Feather color={premiumPalette.body} name="chevron-right" size={s(30)} style={local.secondaryChevron} />
            </Pressable>
          </View>

          <Text style={local.note}>{content.conciergeStart.note}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const premiumPalette = {
  background: premiumColors.background,
  surface: premiumColors.surface,
  olive: premiumColors.olive,
  olivePressed: "#1f2d1f",
  body: premiumColors.textMuted,
  gold: premiumColors.gold,
  goldBorder: "#E4D4B6",
  goldSoft: premiumColors.border,
  white: "#FFFDF8"
};

const premiumFont = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

const local = StyleSheet.create({
  shell: {
    backgroundColor: premiumPalette.background,
    flex: 1
  },
  screen: {
    backgroundColor: premiumPalette.background,
    flex: 1,
    paddingBottom: s(8),
    paddingHorizontal: s(12),
    paddingTop: s(8)
  },
  card: {
    alignItems: "center",
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(30),
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
    paddingBottom: s(10),
    paddingHorizontal: s(16),
    paddingTop: s(18),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(16) },
    shadowOpacity: 0.1,
    shadowRadius: s(26)
  },
  topAccent: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: s(0)
  },
  accentLine: {
    backgroundColor: premiumPalette.gold,
    flex: 1,
    height: 1,
    opacity: 0.62
  },
  headerIcon: {
    alignItems: "center",
    height: s(30),
    justifyContent: "center",
    marginHorizontal: s(15),
    width: s(30)
  },
  chefBubbleLeft: {
    borderColor: premiumPalette.gold,
    borderRadius: s(8),
    borderWidth: 2,
    height: s(15),
    left: s(2),
    position: "absolute",
    top: s(5),
    width: s(15)
  },
  chefBubbleCenter: {
    borderColor: premiumPalette.gold,
    borderRadius: s(10),
    borderWidth: 2,
    height: s(19),
    left: s(8),
    position: "absolute",
    top: 0,
    width: s(19)
  },
  chefBubbleRight: {
    borderColor: premiumPalette.gold,
    borderRadius: s(8),
    borderWidth: 2,
    height: s(15),
    position: "absolute",
    right: s(2),
    top: s(5),
    width: s(15)
  },
  chefBase: {
    borderColor: premiumPalette.gold,
    borderTopWidth: 2,
    height: s(10),
    left: s(8),
    position: "absolute",
    top: s(17),
    width: s(18)
  },
  chefStar: {
    color: premiumPalette.gold,
    fontSize: fs(16),
    left: s(9),
    lineHeight: fs(16),
    position: "absolute",
    top: s(18)
  },
  imageStage: {
    alignItems: "center",
    alignSelf: "stretch",
    height: s(258),
    justifyContent: "flex-start",
    marginBottom: s(0),
    overflow: "visible",
    zIndex: 0
  },
  conciergeImage: {
    aspectRatio: 1086 / 1448,
    height: s(350),
    marginTop: s(-2)
  },
  textBlock: {
    alignItems: "center",
    alignSelf: "stretch",
    marginBottom: s(8),
    marginTop: s(34),
    zIndex: 2
  },
  titleWrap: {
    alignItems: "center",
    alignSelf: "stretch"
  },
  titleLineTop: {
    color: premiumPalette.olive,
    fontFamily: premiumFont,
    fontSize: fs(34),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(40),
    textAlign: "center"
  },
  titleLineBrand: {
    color: premiumPalette.olive,
    fontFamily: premiumFont,
    fontSize: fs(38),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(44),
    textAlign: "center"
  },
  titleAccent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: s(6),
    marginTop: s(4)
  },
  titleLine: {
    backgroundColor: premiumPalette.gold,
    height: 1,
    width: s(42)
  },
  titleStar: {
    color: premiumPalette.gold,
    fontSize: fs(18),
    lineHeight: fs(18),
    marginHorizontal: s(12)
  },
  subtitle: {
    color: premiumPalette.body,
    fontSize: fs(16),
    fontWeight: "500",
    lineHeight: fs(23),
    maxWidth: s(302),
    textAlign: "center"
  },
  actions: {
    alignSelf: "stretch",
    gap: s(10),
    marginBottom: s(8)
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.82)",
    borderColor: premiumPalette.goldBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: s(62),
    paddingHorizontal: s(16),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.1,
    shadowRadius: s(14)
  },
  primaryButtonText: {
    color: premiumPalette.olive,
    flex: 1,
    fontFamily: premiumFont,
    fontSize: fs(18),
    fontWeight: "700",
    lineHeight: fs(21),
    marginLeft: s(9),
    textAlign: "center"
  },
  primaryChevron: {
    width: s(30)
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.74)",
    borderColor: premiumPalette.goldBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: s(58),
    paddingHorizontal: s(18)
  },
  secondaryButtonText: {
    color: premiumPalette.olive,
    flex: 1,
    fontFamily: premiumFont,
    fontSize: fs(18),
    fontWeight: "700",
    lineHeight: fs(21),
    marginLeft: s(9)
  },
  secondaryChevron: {
    width: s(30)
  },
  note: {
    color: premiumPalette.body,
    fontSize: fs(13),
    fontWeight: "500",
    lineHeight: fs(18),
    textAlign: "center"
  },
  primaryIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: s(30)
  },
  secondaryIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: s(30)
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }]
  }
});