import React from "react";
import { Dimensions, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMobileContent } from "../../content/useMobileContent";
import { radius } from "../../theme/tokens";

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

export function ConfirmEmailScreen({
  email,
  onBackToLogin
}: {
  email: string;
  onBackToLogin: () => void;
}) {
  const content = useMobileContent();
  const register = content.auth.register;

  return (
    <SafeAreaView style={local.safeArea}>
      <ScrollView contentContainerStyle={local.screen} showsVerticalScrollIndicator={false}>
        <View style={local.topAccent}>
          <View style={local.accentLine} />
          <Feather color={premiumPalette.gold} name="mail" size={s(22)} />
          <View style={local.accentLine} />
        </View>

        <View style={local.card}>
          <Text style={local.title}>{register.checkEmailTitle}</Text>
          <Text style={local.body}>{register.checkEmailBody}</Text>
          <Text style={local.body}>{register.checkSpam}</Text>

          <View style={local.emailBox}>
            <Text style={local.emailLabel}>{register.registeredEmailLabel}</Text>
            <Text style={local.emailValue} numberOfLines={2}>
              {email}
            </Text>
          </View>

          <Text style={local.neutralNotice}>{register.neutralExistingAccountNotice}</Text>

          <Pressable accessibilityRole="button" onPress={onBackToLogin} style={({ pressed }) => [local.button, pressed ? local.buttonPressed : null]}>
            <Text style={local.buttonText}>{register.backToLogin}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const premiumPalette = {
  background: "#FBF8F1",
  surface: "#FFFDF8",
  surfacePressed: "#F7F1E7",
  oliveDeep: "#182C1B",
  text: "#182C1B",
  body: "#6F6A61",
  gold: "#C6A04A",
  goldMuted: "#D7BE83",
  goldBorder: "#E4D4B6",
  goldSoft: "#E9DCC2",
  white: "#FFFDF8"
};

const premiumFont = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

const local = StyleSheet.create({
  safeArea: {
    backgroundColor: premiumPalette.background,
    flex: 1
  },
  screen: {
    backgroundColor: premiumPalette.background,
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: s(28),
    paddingHorizontal: s(28),
    paddingTop: s(28)
  },
  topAccent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: s(18)
  },
  accentLine: {
    backgroundColor: premiumPalette.goldMuted,
    height: 1,
    marginHorizontal: s(12),
    width: s(62)
  },
  card: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(30),
    borderWidth: 1,
    padding: s(24),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(16) },
    shadowOpacity: 0.09,
    shadowRadius: s(28)
  },
  title: {
    color: premiumPalette.text,
    fontFamily: premiumFont,
    fontSize: fs(30),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(37),
    marginBottom: s(14)
  },
  body: {
    color: premiumPalette.body,
    fontSize: fs(15),
    letterSpacing: 0,
    lineHeight: fs(22),
    marginBottom: s(10)
  },
  emailBox: {
    backgroundColor: premiumPalette.white,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(16),
    borderWidth: 1,
    marginTop: s(8),
    padding: s(13)
  },
  emailLabel: {
    color: premiumPalette.body,
    fontSize: fs(12),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(17),
    marginBottom: s(3)
  },
  emailValue: {
    color: premiumPalette.text,
    fontSize: fs(15),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(21)
  },
  neutralNotice: {
    color: premiumPalette.body,
    fontSize: fs(13),
    letterSpacing: 0,
    lineHeight: fs(19),
    marginTop: s(14)
  },
  button: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderColor: premiumPalette.goldBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: s(20),
    minHeight: s(58)
  },
  buttonPressed: {
    backgroundColor: premiumPalette.surfacePressed,
    transform: [{ scale: 0.99 }]
  },
  buttonText: {
    color: premiumPalette.oliveDeep,
    fontFamily: premiumFont,
    fontSize: fs(17),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(22)
  }
});
