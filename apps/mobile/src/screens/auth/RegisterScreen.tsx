import React, { useMemo, useRef, useState } from "react";
import { Alert, Dimensions, KeyboardAvoidingView, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../app/providers/AuthProvider";
import { env } from "../../config/env";
import { resolveGuiLanguageFromDevice } from "../../content/guiLanguage";
import type { GuiLanguage } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { radius } from "../../theme/tokens";

const BASE_WIDTH = 393;
const MIN_PASSWORD_LENGTH = 8;

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

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function withLegalLanguage(url: string, guiLanguage: GuiLanguage) {
  const lang = guiLanguage === "de-DE" ? "de" : "en";

  if (/[?&]lang=/.test(url)) {
    return url.replace(/([?&])lang=[^&]*/, `$1lang=${lang}`);
  }

  return `${url}${url.includes("?") ? "&" : "?"}lang=${lang}`;
}

export function RegisterScreen({
  onBackToLogin,
  onConfirmEmail
}: {
  onBackToLogin: () => void;
  onConfirmEmail: (email: string) => void;
}) {
  const content = useMobileContent();
  const guiLanguage = useMemo(() => resolveGuiLanguageFromDevice(), []);
  const auth = useAuth();
  const register = content.auth.register;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function openPrivacyPolicy() {
    try {
      await Linking.openURL(withLegalLanguage(env.privacyUrl, guiLanguage));
    } catch {
      Alert.alert(content.profileScreen.legalLinkFailed);
    }
  }

  async function handleSubmit() {
    if (submittingRef.current) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    setError("");

    if (!normalizedEmail || !isPlausibleEmail(normalizedEmail)) {
      setError(register.invalidEmail);
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(register.passwordTooShort);
      return;
    }

    if (passwordConfirmation !== password) {
      setError(register.passwordMismatch);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const result = await auth.signUp(email, password);

      if (result.status === "confirmation-required") {
        onConfirmEmail(result.email);
        return;
      }

      if (result.status === "error") {
        setError(result.message || register.genericError);
      }
    } catch {
      setError(register.genericError);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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
              {register.title}
            </Text>
          </View>

          <View style={local.card}>
            <Text style={local.label}>{register.emailLabel}</Text>
            <View style={local.inputShell}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder={content.login.emailPlaceholder}
                placeholderTextColor={premiumPalette.placeholder}
                style={local.input}
                value={email}
              />
              <Feather color={premiumPalette.gold} name="mail" size={s(25)} />
            </View>

            <Text style={local.label}>{register.passwordLabel}</Text>
            <View style={local.inputShell}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPassword}
                placeholder={content.login.passwordPlaceholder}
                placeholderTextColor={premiumPalette.placeholder}
                secureTextEntry
                style={local.input}
                value={password}
              />
              <Feather color={premiumPalette.gold} name="lock" size={s(25)} />
            </View>

            <Text style={local.label}>{register.confirmPasswordLabel}</Text>
            <View style={local.inputShellLast}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPasswordConfirmation}
                placeholder={register.confirmPasswordLabel}
                placeholderTextColor={premiumPalette.placeholder}
                secureTextEntry
                style={local.input}
                value={passwordConfirmation}
              />
              <Feather color={premiumPalette.gold} name="check" size={s(25)} />
            </View>

            <Text style={local.privacyNotice}>
              {register.privacyNoticePrefix}
              <Text> </Text>
              <Text onPress={openPrivacyPolicy} style={local.privacyLink}>
                {register.privacyLink}
              </Text>
              {register.privacyNoticeSuffix}
            </Text>

            {error ? (
              <View style={local.errorCard}>
                <Text style={local.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={handleSubmit}
              style={({ pressed }) => [local.button, pressed && !submitting ? local.buttonPressed : null, submitting ? local.buttonDisabled : null]}
            >
              <Text style={local.buttonStar}>{"\u2605"}</Text>
              <Text style={local.buttonText}>{submitting ? register.loading : register.submit}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={onBackToLogin}
              style={({ pressed }) => [local.linkButton, pressed && !submitting ? local.linkButtonPressed : null, submitting ? local.linkButtonDisabled : null]}
            >
              <Text style={local.linkButtonText}>{register.backToLogin}</Text>
            </Pressable>
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
    fontSize: fs(40),
    fontWeight: "400",
    letterSpacing: 0,
    lineHeight: fs(48)
  },
  card: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.goldBorder,
    borderRadius: s(30),
    borderWidth: 1,
    paddingBottom: s(22),
    paddingHorizontal: s(22),
    paddingTop: s(22),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(16) },
    shadowOpacity: 0.09,
    shadowRadius: s(28)
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
    marginBottom: s(16),
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
  privacyNotice: {
    color: premiumPalette.body,
    fontSize: fs(13),
    lineHeight: fs(19),
    marginBottom: s(16)
  },
  privacyLink: {
    color: premiumPalette.oliveDeep,
    fontWeight: "700",
    textDecorationLine: "underline"
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
  button: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderColor: premiumPalette.goldBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
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
  buttonDisabled: {
    opacity: 0.62
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
  linkButtonDisabled: {
    opacity: 0.52
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
  }
});
