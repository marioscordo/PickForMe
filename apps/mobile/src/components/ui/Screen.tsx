import React, { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView } from "react-native";
import { styles } from "../../theme/styles";

type ScreenProps = {
  children: React.ReactNode;
  scrollToTopKey?: string;
};

export function Screen({ children, scrollToTopKey }: ScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollToTopKey) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [scrollToTopKey]);

  return (
    <SafeAreaView style={styles.appShell}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          ref={scrollViewRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.screenContent}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
