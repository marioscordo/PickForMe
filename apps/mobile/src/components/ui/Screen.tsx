import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { styles } from "../../theme/styles";

type ScreenProps = {
  bottomScrollInset?: number;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollHintBottomOffset?: number;
  scrollHintHideThreshold?: number;
  showScrollHint?: boolean;
  scrollToTopKey?: string;
};

export function Screen({
  bottomScrollInset = 0,
  children,
  contentContainerStyle,
  scrollHintBottomOffset = 18,
  scrollHintHideThreshold = 36,
  showScrollHint = true,
  scrollToTopKey
}: ScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const scrollInsets = bottomScrollInset > 0
    ? { bottom: bottomScrollInset, left: 0, right: 0, top: 0 }
    : undefined;

  useEffect(() => {
    if (scrollToTopKey) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [scrollToTopKey]);

  const distanceFromBottom = contentHeight - (scrollY + viewportHeight);
  const canScrollFurther = contentHeight > viewportHeight + 18 && distanceFromBottom > scrollHintHideThreshold;

  function handleLayout(event: LayoutChangeEvent) {
    setViewportHeight(event.nativeEvent.layout.height);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setScrollY(event.nativeEvent.contentOffset.y);
  }

  return (
    <SafeAreaView style={styles.appShell}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          ref={scrollViewRef}
          contentInset={scrollInsets}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_, height) => setContentHeight(height)}
          onLayout={handleLayout}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          scrollIndicatorInsets={scrollInsets}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        >
          {children}
          {bottomScrollInset > 0 ? <View pointerEvents="none" style={{ height: bottomScrollInset }} /> : null}
        </ScrollView>
        {showScrollHint && canScrollFurther ? (
          <View pointerEvents="none" style={[local.scrollHint, { bottom: scrollHintBottomOffset }]}>
            <Feather color="#C6A04A" name="chevron-down" size={18} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


const local = StyleSheet.create({
  scrollHint: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderColor: "rgba(228, 212, 182, 0.86)",
    borderRadius: 999,
    borderWidth: 1,
    bottom: 18,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: 32
  }
});
