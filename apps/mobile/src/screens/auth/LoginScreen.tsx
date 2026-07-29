import React, { useState } from "react";
import { Dimensions, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { EmailNotConfirmedError, useAuth } from "../../app/providers/AuthProvider";
import { env } from "../../config/env";
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

export function LoginScreen({ onCreateAccount }: { onCreateAccount?: () => void }) {
  const content = useMobileContent();
  const auth = useAuth();
  const [email, setEmail] = useState(env.devMode ? env.devEmail : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleLogin() {
    setError("");
    setShowResend(false);
    setResendStatus("idle");

    try {
      await auth.signIn(email, password);
    } catch (e) {
      if (e instanceof EmailNotConfirmedError) {
        setError(e.message);
        setShowResend(true);
        return;
      }

      setError(e instanceof Error ? e.message : content.login.genericError);
    }
  }

  async function handleResendConfirmation() {
    setResendStatus("sending");

    try {
      await auth.resendConfirmationEmail(email);
      setResendStatus("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : content.authErrors.resendConfirmationFailed);
      setResendStatus("error");
    }
  }

  return (
    <SafeAreaView style={local.safeArea}>
      <KeyboardAvoidingView style={local.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={local.screen}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={local.topAccent}>
            <View style={local.accentLine} />
            <Text style={local.accentStar}>{"\u2605"}</Text>
            <View style={local.accentLine} />
          </View>

          <View style={local.hero}>
            <Text style={local.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
              {content.login.title}
            </Text>
            <Text style={local.subtitle}>{content.login.subtitle}</Text>
          </View>

          <View style={local.card}>
            <View style={local.cardHeadingRow}>
              <Text style={local.cardTitle}>{content.login.cardTitle}</Text>
            </View>

            <View style={local.cardDivider}>
              <View style={local.cardDividerLine} />
              <View style={local.cardDividerDot} />
              <View style={local.cardDividerLine} />
            </View>

            <Text style={local.label}>{content.login.emailLabel}</Text>
            <View style={local.inputShell}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={local.input}
                value={email}
                onChangeText={setEmail}
                placeholder={content.login.emailPlaceholder}
                placeholderTextColor={premiumPalette.placeholder}
              />
              <Feather color={premiumPalette.gold} name="mail" size={s(25)} />
            </View>

            <Text style={local.label}>{content.login.passwordLabel}</Text>
            <View style={local.inputShellLast}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={local.input}
                value={password}
                onChangeText={setPassword}
                placeholder={content.login.passwordPlaceholder}
                placeholderTextColor={premiumPalette.placeholder}
              />
              <Feather color={premiumPalette.gold} name="eye" size={s(25)} />
            </View>

            {error ? (
              <View style={local.errorCard}>
                <Text style={local.errorText}>{error}</Text>
              </View>
            ) : null}

            {showResend ? (
              resendStatus === "sent" ? (
                <Text style={local.resendStatusText}>{content.authErrors.resendConfirmationSuccess}</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={resendStatus === "sending"}
                  onPress={handleResendConfirmation}
                  style={({ pressed }) => [local.linkButton, pressed && local.linkButtonPressed]}
                >
                  <Text style={local.linkButtonText}>
                    {resendStatus === "sending"
                      ? content.authErrors.resendConfirmationSending
                      : content.authErrors.resendConfirmationButton}
                  </Text>
                </Pressable>
              )
            ) : null}

            <Pressable accessibilityRole="button" onPress={handleLogin} style={({ pressed }) => [local.button, pressed && local.buttonPressed]}>
              <Text style={local.buttonStar}>{"\u2605"}</Text>
              <Text style={local.buttonText}>{content.login.continueButton}</Text>
            </Pressable>

            {onCreateAccount ? (
              <Pressable accessibilityRole="button" onPress={onCreateAccount} style={({ pressed }) => [local.linkButton, pressed && local.linkButtonPressed]}>
                <Text style={local.linkButtonText}>{content.auth.login.createAccount}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={local.brandMark}>
            <View style={local.brandLine} />
            <Text style={local.brandLetter}>G</Text>
            <View style={local.brandLine} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const premiumPalette = {
  background: "#FBF8F1",
  surface: "#FFFDF8",
  surfacePressed: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  text: "#182C1B",
  body: "#6F6A61",
  gold: "#C6A04A",
  goldMuted: "#D7BE83",
  goldBorder: "#E4D4B6",
  goldSoft: "#E9DCC2",
  placeholder: "#8B8478",
  white: "#FFFDF8",
  errorBg: "#FFF4EC",
  errorText: "#8A341E"
};

const premiumFont = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

const local = StyleSheet.create({
  safeArea: {
    backgroundColor: premiumPalette.background,
    flex: 1
  },
  keyboard: {
    flex: 1
  },
  screen: {
    backgroundColor: premiumPalette.background,
    flexGrow: 1,
    paddingBottom: s(24),
    paddingHorizontal: s(28),
    paddingTop: s(16)
  },
  topAccent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: s(16)
  },
  accentLine: {
    backgroundColor: premiumPalette.goldMuted,
    height: 1,
    width: s(62)
  },
  accentStar: {
    color: premiumPalette.gold,
    fontSize: fs(20),
    lineHeight: fs(22),
    marginHorizontal: s(12),
    textAlign: "center"
  },
  hero: {
    marginBottom: s(24)
  },
  title: {
    color: premiumPalette.text,
    fontFamily: premiumFont,
    fontSize: fs(42),
    fontWeight: "400",
    letterSpacing: 0,
    lineHeight: fs(50)
  },
  subtitle: {
    color: premiumPalette.body,
    fontFamily: premiumFont,
    fontSize: fs(17),
    fontWeight: "400",
    letterSpacing: 0,
    lineHeight: fs(24),
    marginTop: s(12)
  },
  card: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(30),
    borderWidth: 1,
    paddingBottom: s(22),
    paddingHorizontal: s(22),
    paddingTop: s(20),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(16) },
    shadowOpacity: 0.09,
    shadowRadius: s(28)
  },
  cardHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: s(13)
  },
  cardTitle: {
    color: premiumPalette.text,
    fontFamily: premiumFont,
    fontSize: fs(18),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(24)
  },
  cardDivider: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: s(19)
  },
  cardDividerLine: {
    backgroundColor: premiumPalette.goldSoft,
    flex: 1,
    height: 1
  },
  cardDividerDot: {
    backgroundColor: premiumPalette.gold,
    borderRadius: s(3),
    height: s(6),
    marginHorizontal: s(10),
    transform: [{ rotate: "45deg" }],
    width: s(6)
  },
  label: {
    color: premiumPalette.text,
    fontFamily: premiumFont,
    fontSize: fs(17),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(23),
    marginBottom: s(8)
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: premiumPalette.white,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(17),
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: s(18),
    minHeight: s(58),
    paddingLeft: s(17),
    paddingRight: s(15),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(5) },
    shadowOpacity: 0.035,
    shadowRadius: s(10)
  },
  inputShellLast: {
    alignItems: "center",
    backgroundColor: premiumPalette.white,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(17),
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: s(20),
    minHeight: s(58),
    paddingLeft: s(17),
    paddingRight: s(15),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(5) },
    shadowOpacity: 0.035,
    shadowRadius: s(10)
  },
  input: {
    color: premiumPalette.text,
    flex: 1,
    fontSize: fs(17),
    letterSpacing: 0,
    minHeight: s(54),
    padding: 0
  },
  errorCard: {
    backgroundColor: premiumPalette.errorBg,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(16),
    borderWidth: 1,
    marginBottom: s(14),
    padding: s(10)
  },
  errorText: {
    color: premiumPalette.errorText,
    fontSize: fs(13),
    lineHeight: fs(18)
  },
  resendStatusText: {
    color: premiumPalette.body,
    fontFamily: premiumFont,
    fontSize: fs(14),
    lineHeight: fs(20),
    marginBottom: s(14),
    textAlign: "center"
  },
  button: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderColor: premiumPalette.goldBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: s(60),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(10) },
    shadowOpacity: 0.09,
    shadowRadius: s(18)
  },
  buttonPressed: {
    backgroundColor: premiumPalette.surfacePressed,
    transform: [{ scale: 0.99 }]
  },
  buttonStar: {
    color: premiumPalette.gold,
    fontSize: fs(22),
    lineHeight: fs(23),
    marginRight: s(12)
  },
  buttonText: {
    color: premiumPalette.oliveDeep,
    fontFamily: premiumFont,
    fontSize: fs(18),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(23)
  },
  linkButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: s(46),
    marginTop: s(10)
  },
  linkButtonPressed: {
    opacity: 0.68
  },
  linkButtonText: {
    color: premiumPalette.oliveDeep,
    fontFamily: premiumFont,
    fontSize: fs(16),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(22),
    textDecorationLine: "underline"
  },
  brandMark: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: "auto",
    paddingTop: s(18)
  },
  brandLine: {
    backgroundColor: premiumPalette.goldSoft,
    height: 1,
    width: s(48)
  },
  brandLetter: {
    color: premiumPalette.goldSoft,
    fontFamily: premiumFont,
    fontSize: fs(31),
    lineHeight: fs(33),
    marginHorizontal: s(16)
  },
});
