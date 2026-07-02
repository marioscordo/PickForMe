import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { env } from "../../config/env";
import { useMobileContent } from "../../content/useMobileContent";
import { ActionButton } from "../../components/ui/ActionButton";
import { Screen } from "../../components/ui/Screen";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { Surface } from "../../components/ui/Surface";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";

export function LoginScreen() {
  const content = useMobileContent();
  const auth = useAuth();
  const [email, setEmail] = useState(env.devMode ? env.devEmail : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");

    try {
      await auth.signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : content.login.genericError);
    }
  }

  return (
    <Screen>
      <ScreenHeader title={content.login.title} subtitle={content.login.subtitle} />

      <Surface style={local.card}>
        <Text style={local.cardTitle}>{content.login.cardTitle}</Text>

        <Text style={local.label}>{content.login.emailLabel}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={local.input}
          value={email}
          onChangeText={setEmail}
          placeholder={content.login.emailPlaceholder}
          placeholderTextColor={semanticColors.textMuted}
        />

        {!env.devMode ? (
          <>
            <Text style={local.label}>{content.login.passwordLabel}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={local.input}
              value={password}
              onChangeText={setPassword}
              placeholder={content.login.passwordPlaceholder}
              placeholderTextColor={semanticColors.textMuted}
            />
          </>
        ) : null}

        {error ? (
          <View style={local.errorCard}>
            <Text style={local.errorText}>{error}</Text>
          </View>
        ) : null}

        <ActionButton label={content.login.continueButton} variant="accent" onPress={handleLogin} style={local.button} />
      </Surface>
    </Screen>
  );
}

const local = StyleSheet.create({
  card: {
    padding: spacing.lg
  },
  cardTitle: {
    color: semanticColors.text,
    fontSize: typography.sectionTitle.fontSize,
    fontWeight: typography.sectionTitle.fontWeight,
    lineHeight: typography.sectionTitle.lineHeight,
    marginBottom: spacing.md
  },
  label: {
    color: semanticColors.text,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: semanticColors.text,
    fontSize: 16,
    marginBottom: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  errorCard: {
    backgroundColor: semanticColors.warningSurface,
    borderColor: semanticColors.warningBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md
  },
  errorText: {
    color: semanticColors.warningBody,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight
  },
  button: {
    borderRadius: radius.pill,
    marginTop: spacing.xs
  }
});
