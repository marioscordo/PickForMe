import { useEffect, useState } from "react";
import { Alert, Dimensions, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useProfile } from "../../app/providers/ProfileProvider";
import { logAllergyWarningConfirmation } from "../../api/pickformeApi";
import { Screen } from "../../components/ui/Screen";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { RestaurantDiscoveryDialog } from "../../components/pick/RestaurantDiscoveryDialog";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { ActionButton } from "../../components/ui/ActionButton";
import { GustaroHelp } from "../../components/ui/GustaroHelp";
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
const ANALYSIS_LOADING_STEP_INTERVAL_MS = 1500;
const RESULT_BOTTOM_SCROLL_INSET = 0;
const ENTRY_BOTTOM_SCROLL_INSET = 190;
const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screenWidth = Dimensions.get("window").width;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

export function PickScreen({
  onGoHome
}: PickScreenProps) {
  const content = useMobileContent();
  const { profile } = useProfile();
  const loadingSteps = content.pick.loadingSteps;
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("leicht");
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
    }, ANALYSIS_LOADING_STEP_INTERVAL_MS);

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
        scrollHintBottomOffset={s(18)}
        scrollHintHideThreshold={s(96)}
        scrollToTopKey="analysis-result"
      >
        <View style={local.resultHelpRow}>
          <GustaroHelp common={content.help.common} topic={content.help.result} />
        </View>
        <RecommendationCard
          result={analyze.result}
          menuText={menuText}
          situation={situation}
          onReset={analyze.reset}
          openMenuLabel={lastAnalyzedMenuUrl ? content.pick.openMenu : undefined}
          onOpenMenu={lastAnalyzedMenuUrl ? openAnalyzedMenu : undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen bottomScrollInset={ENTRY_BOTTOM_SCROLL_INSET} contentContainerStyle={local.entryScreenContent} scrollToTopKey="pick-entry">
      <View style={local.conciergeIntro}>
        <GustaroHelp common={content.help.common} topic={content.help.pickInput} style={local.entryHelpButton} />
        <View style={local.introAccentRow}>
          <View style={local.introAccentLine} />
          <MaterialCommunityIcons color={premiumPalette.gold} name="room-service-outline" size={s(24)} />
          <View style={local.introAccentLine} />
        </View>
        <Text style={local.introTitle}>{content.pick.heroTitle}</Text>
        <Text style={local.introSubtitle}>{content.pick.heroSubtitle}</Text>
      </View>

      <View style={local.premiumCard}>
        <View style={local.cardHeader}>
          <View style={local.cardIcon}>
            <MaterialCommunityIcons color={premiumPalette.gold} name="book-open-variant" size={s(21)} />
          </View>
          <View style={local.cardHeaderText}>
            <Text style={local.cardTitle}>{content.menuInput.kicker}</Text>
            <Text style={local.cardHint}>{content.menuInput.hint}</Text>
          </View>
        </View>

        <View style={local.modeSwitch}>
          <Pressable
            accessibilityRole="button"
            style={[local.modeButton, !showQrScanner && local.modeButtonActive]}
            onPress={() => setShowQrScanner(false)}
          >
            <Feather color={!showQrScanner ? premiumPalette.surface : premiumPalette.gold} name="link" size={s(16)} />
            <Text style={[local.modeButtonText, !showQrScanner && local.modeButtonTextActive]}>{content.pick.pasteTab}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={[local.modeButton, showQrScanner && local.modeButtonActive]}
            onPress={() => setShowQrScanner(true)}
          >
            <MaterialCommunityIcons color={showQrScanner ? premiumPalette.surface : premiumPalette.gold} name="qrcode-scan" size={s(17)} />
            <Text style={[local.modeButtonText, showQrScanner && local.modeButtonTextActive]}>{content.pick.qrTab}</Text>
          </Pressable>
        </View>

        {showQrScanner ? (
          <QrMenuScanner
            onUrlScanned={(value: string) => {
              setMenuText(value);
              setShowQrScanner(false);
              setShowRestaurantDiscovery(false);
            }}
            onClose={() => setShowQrScanner(false)}
          />
        ) : (
          <MenuInputCard menuText={menuText} setMenuText={setMenuText} compact />
        )}

        <Pressable accessibilityRole="button" style={local.findMenuRow} onPress={() => setShowRestaurantDiscovery(true)}>
          <View style={local.findMenuLeft}>
            <Feather color={premiumPalette.gold} name="search" size={s(19)} />
            <Text style={local.findMenuText}>{content.pick.findMenuButton}</Text>
          </View>
          <Feather color={premiumPalette.textSoft} name="chevron-right" size={s(24)} />
        </Pressable>
      </View>

      <RestaurantDiscoveryDialog
        visible={showRestaurantDiscovery}
        onClose={closeRestaurantDiscovery}
        onGoHome={onGoHome}
        onApply={applyDiscoveredMenuUrl}
        restaurantDetector={appleMapsRestaurantDetectorRuntime}
      />

      <View style={local.premiumCard}>
        <View style={local.cardHeader}>
          <View style={local.cardIcon}>
            <Feather color={premiumPalette.gold} name="heart" size={s(20)} />
          </View>
          <View style={local.cardHeaderText}>
            <Text style={local.cardTitle}>{content.pick.moodTitle}</Text>
            <Text style={local.cardHint}>{content.pick.moodHint}</Text>
          </View>
        </View>
        <SituationSelector situation={situation} setSituation={setSituation} />
      </View>

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

      <Pressable
        accessibilityRole="button"
        disabled={analyze.loading}
        onPress={handleAnalyze}
        style={[local.mainButton, analyze.loading && local.mainButtonDisabled]}
      >
        <MaterialCommunityIcons color={premiumPalette.surface} name="room-service-outline" size={s(25)} />
        <Text style={local.mainButtonText}>{analyze.loading ? content.pick.mainButtonLoading : content.pick.mainButtonIdle}</Text>
      </Pressable>
    </Screen>
  );
}

const premiumPalette = {
  background: "#FBF8F1",
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  gold: "#C6A04A",
  goldMuted: "#D7BE83",
  textSoft: "#6F6A61",
  border: "#E4D4B6",
  borderSoft: "#EFE4D1"
};

const premiumFont = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

const local = StyleSheet.create({
  entryScreenContent: {
    backgroundColor: premiumPalette.background,
    paddingBottom: s(42),
    paddingTop: s(26)
  },

  resultScreenContent: {
    paddingBottom: s(18)
  },

  resultHelpRow: {
    alignItems: "flex-end",
    marginBottom: s(10)
  },

  conciergeIntro: {
    marginBottom: s(22),
    paddingHorizontal: s(2),
    position: "relative"
  },

  entryHelpButton: {
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 5
  },

  introAccentRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: s(16)
  },

  introAccentLine: {
    backgroundColor: premiumPalette.goldMuted,
    height: 1,
    marginHorizontal: s(12),
    width: s(58)
  },

  introTitle: {
    color: premiumPalette.oliveDeep,
    fontFamily: premiumFont,
    fontSize: fs(27),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(34),
    marginBottom: s(12),
    textAlign: "center"
  },

  introSubtitle: {
    color: premiumPalette.textSoft,
    fontSize: fs(18),
    fontWeight: "400",
    lineHeight: fs(27),
    textAlign: "center"
  },

  premiumCard: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(28),
    borderWidth: 1,
    marginBottom: s(18),
    padding: s(20),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(10) },
    shadowOpacity: 0.08,
    shadowRadius: s(20)
  },

  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: s(12),
    marginBottom: s(16)
  },

  cardIcon: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(18),
    borderWidth: 1,
    height: s(44),
    justifyContent: "center",
    width: s(44)
  },

  cardHeaderText: {
    flex: 1
  },

  cardTitle: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(20),
    fontWeight: "800",
    lineHeight: fs(25),
    marginBottom: s(3)
  },

  cardHint: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "400",
    lineHeight: fs(20)
  },

  modeSwitch: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: s(6),
    marginBottom: s(14),
    padding: s(5)
  },

  modeButton: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    flexDirection: "row",
    gap: s(7),
    justifyContent: "center",
    minHeight: s(40),
    paddingHorizontal: s(12)
  },

  modeButtonActive: {
    backgroundColor: premiumPalette.olive,
    shadowColor: premiumPalette.olive,
    shadowOffset: { width: 0, height: s(6) },
    shadowOpacity: 0.1,
    shadowRadius: s(12),
    elevation: 2
  },

  modeButtonText: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(14),
    fontWeight: "800",
    lineHeight: fs(18)
  },

  modeButtonTextActive: {
    color: premiumPalette.surface
  },

  findMenuRow: {
    alignItems: "center",
    borderColor: premiumPalette.borderSoft,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: s(14),
    minHeight: s(52),
    paddingTop: s(12)
  },

  findMenuLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: s(10)
  },

  findMenuText: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21)
  },

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
    padding: s(20)
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
    alignItems: "center",
    backgroundColor: premiumPalette.olive,
    borderRadius: 999,
    flexDirection: "row",
    gap: s(10),
    justifyContent: "center",
    marginBottom: s(10),
    marginTop: s(2),
    minHeight: s(66),
    paddingHorizontal: s(20),
    shadowColor: premiumPalette.olive,
    shadowOffset: { width: 0, height: s(10) },
    shadowOpacity: 0.18,
    shadowRadius: s(16),
    elevation: 5
  },

  mainButtonDisabled: {
    opacity: 0.58
  },

  mainButtonText: {
    color: premiumPalette.surface,
    fontSize: fs(18),
    fontWeight: "800",
    lineHeight: fs(23),
    textAlign: "center"
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
