import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { env } from "../../config/env";
import { useMobileContent } from "../../content/useMobileContent";
import { Screen } from "../../components/ui/Screen";
import { styles } from "../../theme/styles";

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
      <Text style={styles.title}>{content.login.title}</Text>
      <Text style={styles.subtitle}>{content.login.subtitle}</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>{content.login.cardTitle}</Text>

        <Text style={styles.label}>{content.login.emailLabel}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={content.login.emailPlaceholder}
        />

        {!env.devMode ? (
          <>
            <Text style={styles.label}>{content.login.passwordLabel}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={content.login.passwordPlaceholder}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>{content.login.continueButton}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
