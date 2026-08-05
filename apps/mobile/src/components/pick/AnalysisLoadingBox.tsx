import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Surface } from "../ui/Surface";
import { premiumColors, radius, spacing, typography } from "../../theme/tokens";

const ANALYSIS_LOADING_STEP_INTERVAL_MS = 10000;
const LOADING_SWEEP_DURATION_MS = 2600;
const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screenWidth = Dimensions.get("window").width;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

export function AnalysisLoadingBox({
  steps,
  style,
  title
}: {
  steps: string[];
  style?: StyleProp<ViewStyle>;
  title: string;
}) {
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [loadingTrackWidth, setLoadingTrackWidth] = useState(0);
  const loadingSweepProgress = useRef(new Animated.Value(0)).current;
  const activeStep = steps[loadingStepIndex] ?? steps[0] ?? "";

  useEffect(() => {
    setLoadingStepIndex(0);

    // Fallanalyse Juli 2026: bei laengeren Analysen (Bild-Fallbacks bis zu
    // 90s, siehe MULTI_IMAGE_FALLBACK_AI_TIMEOUT_MS) lief der Schritt-Text
    // per Modulo mehrfach im Kreis - fuer die Nutzerin sah das aus, als
    // wuerde die Analyse von vorne beginnen bzw. haengen ("Aktionen, die
    // sich wiederholen"). Der letzte Eintrag in loadingSteps ist bewusst
    // eine ruhige "dauert bei umfangreichen Karten laenger"-Nachricht ohne
    // Fortschrittsanspruch - dort bleibt die Anzeige stehen, statt erneut
    // bei Schritt 1 zu beginnen.
    const timer = setInterval(() => {
      setLoadingStepIndex((current) =>
        steps.length > 0 ? Math.min(current + 1, steps.length - 1) : 0
      );
    }, ANALYSIS_LOADING_STEP_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [steps.length]);

  useEffect(() => {
    if (loadingTrackWidth <= 0) {
      loadingSweepProgress.stopAnimation();
      loadingSweepProgress.setValue(0);
      return;
    }

    loadingSweepProgress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(loadingSweepProgress, {
        toValue: 1,
        duration: LOADING_SWEEP_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true
      })
    );

    animation.start();

    return () => {
      animation.stop();
      loadingSweepProgress.stopAnimation();
    };
  }, [loadingSweepProgress, loadingTrackWidth]);

  return (
    <Surface tone="soft" style={[local.feedbackCard, style]}>
      <Text style={local.loadingTitle}>{title}</Text>
      <Text style={local.loadingText}>{activeStep}</Text>
      <View
        onLayout={(event) => setLoadingTrackWidth(event.nativeEvent.layout.width)}
        style={local.loadingTrack}
      >
        <Animated.View
          style={[
            local.loadingSweep,
            {
              transform: [{
                translateX: loadingSweepProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, Math.max(loadingTrackWidth - s(56), 0)]
                })
              }]
            }
          ]}
        />
      </View>
    </Surface>
  );
}

const local = StyleSheet.create({
  feedbackCard: {
    backgroundColor: "rgba(255, 253, 248, 0.86)",
    borderColor: "rgba(200, 168, 90, 0.24)",
    borderRadius: radius.hero,
    marginBottom: spacing.lg,
    padding: s(20)
  },

  loadingTitle: {
    color: premiumColors.olive,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  loadingText: {
    color: premiumColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.md
  },

  loadingTrack: {
    backgroundColor: "rgba(116, 109, 100, 0.14)",
    borderRadius: radius.pill,
    height: s(8),
    overflow: "hidden",
    width: "100%"
  },

  loadingSweep: {
    backgroundColor: premiumColors.gold,
    borderRadius: radius.pill,
    height: "100%",
    width: s(56)
  }
});
