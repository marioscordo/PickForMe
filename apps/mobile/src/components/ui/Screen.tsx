import React, { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { styles } from "../../theme/styles";

type ScreenProps = {
  bottomScrollInset?: number;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollToTopKey?: string;
};

export function Screen({ bottomScrollInset = 0, children, contentContainerStyle, scrollToTopKey }: ScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollInsets = bottomScrollInset > 0
    ? { bottom: bottomScrollInset, left: 0, right: 0, top: 0 }
    : undefined;

  useEffect(() => {
    if (scrollToTopKey) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [scrollToTopKey]);

  return (
    <SafeAreaView style={styles.appShell}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          ref={scrollViewRef}
          contentInset={scrollInsets}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={scrollInsets}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        >
          {children}
          {bottomScrollInset > 0 ? <View pointerEvents="none" style={{ height: bottomScrollInset }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
