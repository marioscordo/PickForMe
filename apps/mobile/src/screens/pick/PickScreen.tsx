import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useProfile } from "../../app/providers/ProfileProvider";
import { logAllergyWarningConfirmation } from "../../api/pickformeApi";
import { Screen } from "../../components/ui/Screen";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { RestaurantDiscoveryDialog } from "../../components/pick/RestaurantDiscoveryDialog";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { ActionButton } from "../../components/ui/ActionButton";
import { Surface } from "../../components/ui/Surface";
import { useMobileContent } from "../../content/useMobileContent";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { appleMapsRestaurantDetectorRuntime } from "../../restaurant-detector/runtime";
import { premiumColors, radius, spacing, typography } from "../../theme/tokens";
import type { Situation, UserProfile } from "../../types/profile";

type PickScreenProps = {
  onGoHome?: () => void;
};

const ALLERGY_WARNING_CONFIRMATION_VERSION = "allergy-warning-v1";
const RESULT_BOTTOM_SCROLL_INSET = 420;

export function PickScreen({
  onGoHome
}: PickScreenProps) {
  const content = useMobileContent();
  const { profile } = useProfile();
  const loadingSteps = content.pick.loadingSteps;
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("richtig_hunger");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showRestaurantDiscovery, setShowRestaurantDiscovery] = useState(false);
  const analyze = useAnalyzeMenu();
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [lastAnalyzedMenuUrl, setLastAnalyzedMenuUrl] = useState("");

  useEffect(() => {
    if (!analyze.loading) {
      setLoadingStepIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setLoadingStepIndex((current) =>
        Math.min(current + 1, loadingSteps.length - 1)
      );
    }, 7000);

    return () => clearInterval(timer);
  }, [analyze.loading, loadingSteps.length]);

  function normalizeMenuUrl(value: string) {
    const trimmed = value.trim();

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }

    if (trimmed.startsWith("www.")) {
      return `https://${trimmed}`;
    }

    return "";
  }

  function handleAnalyze() {
    if (hasAllergiesOrIntolerances(profile)) {
      analyze.reset();
      showAllergyWarningBeforeAnalyze();
      return;
    }

    startAnalyze();
  }

  function startAnalyze() {
    setLastAnalyzedMenuUrl(normalizeMenuUrl(menuText));
    analyze.run(menuText, situation);
  }

  function resetAnalysisState() {
    analyze.reset();
    setLastAnalyzedMenuUrl("");
    setLoadingStepIndex(0);
  }

  function closeRestaurantDiscovery() {
    setShowRestaurantDiscovery(false);
  }

  function applyDiscoveredMenuUrl(value: string) {
    setMenuText(value);
    setShowQrScanner(false);
    setShowRestaurantDiscovery(false);
  }

  function showAllergyWarningBeforeAnalyze() {
    Alert.alert(
      content.allergyWarning.title,
      content.allergyWarning.message,
      [
        {
          text: content.allergyWarning.rejectButton,
          style: "destructive",
          onPress: analyze.reset
        },
        {
          text: content.allergyWarning.confirmButton,
          onPress: confirmAllergyWarningAndAnalyze
        }
      ],
      { cancelable: false }
    );
  }

  async function confirmAllergyWarningAndAnalyze() {
    try {
      await logAllergyWarningConfirmation({
        confirmationTimestamp: new Date().toISOString(),
        confirmationVersion: ALLERGY_WARNING_CONFIRMATION_VERSION
      });
      startAnalyze();
    } catch {
      analyze.reset();
      Alert.alert(
        content.allergyWarning.logFailedTitle,
        content.allergyWarning.logFailedMessage
      );
    }
  }

  async function openAnalyzedMenu() {
    if (!lastAnalyzedMenuUrl) return;
    await Linking.openURL(lastAnalyzedMenuUrl);
  }

  if (analyze.result) {
    return (
      <Screen
        bottomScrollInset={RESULT_BOTTOM_SCROLL_INSET}
        contentContainerStyle={local.resultScreenContent}
        scrollToTopKey="analysis-result"
      >
        <RecommendationCard
          result={analyze.result}
          menuText={menuText}
          situation={situation}
          onReset={analyze.reset}
        />

        {lastAnalyzedMenuUrl ? (
          <View style={local.openMenuSection}>
            <ActionButton label={content.pick.openMenu} variant="secondary" onPress={openAnalyzedMenu} />
          </View>
        ) : null}

        <View pointerEvents="none" style={local.resultBottomSpacer} />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={local.entryScreenContent}>
      <View style={local.conciergeIntro}>
        <View style={local.introAccent} />
        <Text style={local.introTitle}>{content.pick.heroTitle}</Text>
        <Text style={local.introSubtitle}>{content.pick.heroSubtitle}</Text>
      </View>

      <View style={local.quickRow}>
        <Pressable
          style={[local.quickButton, !showQrScanner && local.quickButtonActive]}
          onPress={() => setShowQrScanner(false)}
        >
          <Text style={[local.quickButtonText, !showQrScanner && local.quickButtonTextActive]}>
            {content.pick.pasteTab}
          </Text>
        </Pressable>

        <Pressable
          style={[local.quickButton, showQrScanner && local.quickButtonActive]}
          onPress={() => setShowQrScanner(true)}
        >
          <Text style={[local.quickButtonText, showQrScanner && local.quickButtonTextActive]}>
            {content.pick.qrTab}
          </Text>
        </Pressable>
      </View>

      <View style={local.discoveryButtonWrap}>
        <ActionButton
          label={content.pick.findMenuButton}
          variant="secondary"
          onPress={() => setShowRestaurantDiscovery(true)}
          style={local.discoveryButton}
        />
      </View>

      <RestaurantDiscoveryDialog
        visible={showRestaurantDiscovery}
        onClose={closeRestaurantDiscovery}
        onGoHome={onGoHome}
        onApply={applyDiscoveredMenuUrl}
        restaurantDetector={appleMapsRestaurantDetectorRuntime}
      />

      {showQrScanner ? (
        <QrMenuScanner
          onUrlScanned={(value: string) => {
            setMenuText(value);
            setShowQrScanner(false);
            setShowRestaurantDiscovery(false);
          }}
          onClose={() => setShowQrScanner(false)}
        />
      ) : null}

      <MenuInputCard menuText={menuText} setMenuText={setMenuText} compact />

      <Surface style={local.moodCard}>
        <Text style={local.moodTitle}>{content.pick.moodTitle}</Text>
        <SituationSelector situation={situation} setSituation={setSituation} />
      </Surface>

      {analyze.loading ? (
        <Surface tone="soft" style={local.feedbackCard}>
          <Text style={local.loadingTitle}>{content.pick.loadingTitle}</Text>
          <Text style={local.loadingText}>{loadingSteps[loadingStepIndex]}</Text>
          <View style={local.loadingDots}>
            {loadingSteps.map((_, index) => (
              <View
                key={index}
                style={[
                  local.loadingDot,
                  index === loadingStepIndex && local.loadingDotActive
                ]}
              />
            ))}
          </View>
        </Surface>
      ) : null}

      {analyze.error ? (
        <>
          <View style={local.feedbackErrorCard}>
            <Text style={local.errorTitle}>{content.pick.errorTitle}</Text>
            <Text style={local.errorText}>{analyze.error}</Text>
          </View>

          {lastAnalyzedMenuUrl ? (
            <View style={local.openMenuSection}>
              <ActionButton label={content.pick.openMenu} variant="secondary" onPress={openAnalyzedMenu} />
            </View>
          ) : null}
        </>
      ) : null}

      <ActionButton
        label={analyze.loading ? content.pick.mainButtonLoading : content.pick.mainButtonIdle}
        variant="primary"
        onPress={handleAnalyze}
        disabled={analyze.loading}
        style={local.mainButton}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  entryScreenContent: {
    backgroundColor: premiumColors.background,
    paddingBottom: 168,
    paddingTop: 26
  },

  resultScreenContent: {
    paddingBottom: 640
  },

  resultBottomSpacer: {
    height: 420
  },

  conciergeIntro: {
    marginBottom: spacing.section,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs
  },

  introAccent: {
    backgroundColor: premiumColors.gold,
    borderRadius: radius.pill,
    height: 2,
    marginBottom: spacing.md,
    opacity: 0.72,
    width: 44
  },

  introTitle: {
    color: premiumColors.text,
    fontSize: 29,
    fontWeight: "900",
    lineHeight: 35,
    marginBottom: spacing.sm
  },

  introSubtitle: {
    color: premiumColors.textMuted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23
  },

  quickRow: {
    backgroundColor: "rgba(255, 253, 248, 0.58)",
    borderColor: "rgba(231, 222, 210, 0.62)",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.xs
  },

  quickButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },

  quickButtonActive: {
    backgroundColor: premiumColors.olive,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2
  },

  quickButtonText: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },

  quickButtonTextActive: {
    color: premiumColors.surface
  },

  discoveryButtonWrap: {
    marginBottom: spacing.section
  },

  discoveryButton: {
    backgroundColor: "rgba(255, 253, 248, 0.60)",
    borderColor: "rgba(116, 109, 100, 0.16)",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md
  },

  moodCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
    marginBottom: spacing.section,
    padding: 0
  },

  moodTitle: {
    color: premiumColors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
    marginBottom: spacing.md
  },

  feedbackCard: {
    backgroundColor: "rgba(255, 253, 248, 0.84)",
    borderColor: "rgba(200, 168, 90, 0.24)",
    borderRadius: radius.hero,
    marginBottom: spacing.lg,
    padding: 20
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

  loadingDots: {
    flexDirection: "row",
    gap: spacing.xs
  },

  loadingDot: {
    backgroundColor: "rgba(116, 109, 100, 0.18)",
    height: 7,
    borderRadius: radius.pill,
    width: 7
  },

  loadingDotActive: {
    backgroundColor: premiumColors.gold,
    width: 18
  },

  feedbackErrorCard: {
    backgroundColor: "rgba(110, 36, 51, 0.08)",
    borderColor: "rgba(110, 36, 51, 0.22)",
    borderRadius: radius.hero,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: 20
  },

  errorTitle: {
    color: premiumColors.bordeaux,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  errorText: {
    color: premiumColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    lineHeight: typography.body.lineHeight
  },

  mainButton: {
    backgroundColor: premiumColors.olive,
    borderRadius: radius.pill,
    marginBottom: 24,
    marginTop: spacing.sm,
    paddingVertical: 17,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5
  },

  openMenuSection: {
    marginTop: 12,
    marginBottom: 16
  }
});

function hasAllergiesOrIntolerances(profile: UserProfile) {
  return [profile.intolerances, profile.customIntolerances].some((items) =>
    (items ?? []).some((item) => item.trim().length > 0)
  );
}
