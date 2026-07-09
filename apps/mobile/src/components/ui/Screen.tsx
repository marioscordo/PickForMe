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
  scrollToEndKey?: string | number;
  scrollToOffsetKey?: string | number;
  scrollToOffsetY?: number;
  showScrollHint?: boolean;
  scrollToTopKey?: string;
};

export function Screen({
  bottomScrollInset = 0,
  children,
  contentContainerStyle,
  scrollHintBottomOffset = 18,
  scrollHintHideThreshold = 36,
  scrollToEndKey,
  scrollToOffsetKey,
  scrollToOffsetY = 0,
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
      setScrollY(0);
      const frame = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        setScrollY(0);
      });

      return () => cancelAnimationFrame(frame);
    }
  }, [scrollToTopKey]);

  useEffect(() => {
    if (scrollToEndKey !== undefined) {
      const frame = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });

      return () => cancelAnimationFrame(frame);
    }
  }, [scrollToEndKey]);

  useEffect(() => {
    if (scrollToOffsetKey !== undefined) {
      const frame = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: Math.max(scrollToOffsetY, 0), animated: true });
      });

      return () => cancelAnimationFrame(frame);
    }
  }, [scrollToOffsetKey, scrollToOffsetY]);

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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView
          ref={scrollViewRef}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentInset={scrollInsets}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
