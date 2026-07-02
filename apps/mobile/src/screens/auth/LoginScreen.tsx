import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { env } from "../../config/env";
import { Screen } from "../../components/ui/Screen";
import { styles } from "../../theme/styles";

export function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState(env.devMode ? env.devEmail : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");

    try {
      await auth.signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login fehlgeschlagen.");
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Einloggen</Text>

        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
        />

        {!env.devMode ? (
          <>
            <Text style={styles.label}>Passwort</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Passwort"
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Weiter</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
