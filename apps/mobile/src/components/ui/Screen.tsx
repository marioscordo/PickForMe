import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { styles } from "../../theme/styles";

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.screenContent}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
