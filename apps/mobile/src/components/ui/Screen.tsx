import React, { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { styles } from "../../theme/styles";

export function Screen({
  children,
  scrollToTopKey
}: {
  children: React.ReactNode;
  scrollToTopKey?: string | number;
}) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollToTopKey]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.screenContent}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
