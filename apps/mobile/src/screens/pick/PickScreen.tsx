import { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useProfile } from "../../app/providers/ProfileProvider";
import { extractMenuTextFromPhoto, logAllergyWarningConfirmation } from "../../api/pickformeApi";
import { PickForMeApiError } from "../../api/apiClient";
import { Screen } from "../../components/ui/Screen";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { PhotoMenuCamera } from "../../components/pick/PhotoMenuCamera";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { RestaurantDiscoveryDialog } from "../../components/pick/RestaurantDiscoveryDialog";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { ActionButton } from "../../components/ui/ActionButton";
import { GustaroHelp } from "../../components/ui/GustaroHelp";
import { Surface } from "../../components/ui/Surface";
import { profileFeatures } from "../../config/profileFeatures";
import { useMobileContent } from "../../content/useMobileContent";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { premiumColors, radius, spacing, typography } from "../../theme/tokens";
import type { Situation, UserProfile } from "../../types/profile";

type PickScreenProps = {
  onGoHome?: () => void;
  onOpenProfile?: () => void;
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
  onGoHome,
  onOpenProfile
}: PickScreenProps) {
  const content = useMobileContent();
  const { profile } = useProfile();
  const loadingSteps = content.pick.loadingSteps;
  const [menuText, setMenuText] = useState("");
  const [menuUrls, setMenuUrls] = useState<string[]>([]);
  const [selectedRestaurantName, setSelectedRestaurantName] = useState("");
  const [selectedMenuSourceDomain, setSelectedMenuSourceDomain] = useState("");
  const [situation, setSituation] = useState<Situation>("leicht");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showPhotoCamera, setShowPhotoCamera] = useState(false);
  const [photoMenuLoading, setPhotoMenuLoading] = useState(false);
  const [photoMenuError, setPhotoMenuError] = useState("");
  const [showRestaurantDiscovery, setShowRestaurantDiscovery] = useState(false);
  const [entryScrollToActionKey, setEntryScrollToActionKey] = useState(0);
  const analyze = useAnalyzeMenu();
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [lastAnalyzedMenuUrl, setLastAnalyzedMenuUrl] = useState("");
  const [showAllergyWarning, setShowAllergyWarning] = useState(false);
  const [allergyWarningSaving, setAllergyWarningSaving] = useState(false);
  const pendingConfirmedMenuTextRef = useRef<string | null>(null);
  const pendingConfirmedMenuUrlsRef = useRef<string[]>([]);
  const allergyWarningParagraphs = content.allergyWarning.message.split("\n\n");

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

  function updateMenuText(value: string) {
    setMenuText(value);
    setMenuUrls([]);
    setSelectedRestaurantName("");
    setSelectedMenuSourceDomain("");
  }

  function handleAnalyze() {
    pendingConfirmedMenuTextRef.current = null;
    pendingConfirmedMenuUrlsRef.current = [];

    if (hasAllergiesOrIntolerances(profile)) {
      analyze.reset();
      showAllergyWarningBeforeAnalyze();
      return;
    }

    startAnalyze();
  }

  function startAnalyze() {
    setLastAnalyzedMenuUrl(normalizeMenuUrl(menuText));
    analyze.run(menuText, situation, menuUrls);
  }

  function startAnalyzeWithExtractedMenuText(value: string) {
    setMenuText(value);
    setMenuUrls([]);
    setSelectedRestaurantName("");
    setSelectedMenuSourceDomain("");
    setLastAnalyzedMenuUrl("");

    if (hasAllergiesOrIntolerances(profile)) {
      pendingConfirmedMenuTextRef.current = value;
      pendingConfirmedMenuUrlsRef.current = [];
      analyze.reset();
      showAllergyWarningBeforeAnalyze();
      return;
    }

    analyze.run(value, situation, []);
  }

  function resetAnalysisState() {
    analyze.reset();
    setMenuText("");
    setMenuUrls([]);
    setSelectedRestaurantName("");
    setSelectedMenuSourceDomain("");
    setLastAnalyzedMenuUrl("");
    setLoadingStepIndex(0);
    setEntryScrollToActionKey(0);
  }

  function closeRestaurantDiscovery() {
    setShowRestaurantDiscovery(false);
  }

  function applyDiscoveredMenuUrl(value: string, restaurantName?: string, menuSourceDomain?: string, discoveredMenuUrls?: string[]) {
    setMenuText(value);
    setMenuUrls(discoveredMenuUrls?.length ? discoveredMenuUrls : [value]);
    setSelectedRestaurantName(restaurantName?.trim() ?? "");
    setSelectedMenuSourceDomain(menuSourceDomain?.trim() ?? "");
    setShowQrScanner(false);
    setShowPhotoCamera(false);
    setPhotoMenuError("");
    setShowRestaurantDiscovery(false);
    setEntryScrollToActionKey((current) => current + 1);
  }

  function openPhotoCamera() {
    setShowQrScanner(false);
    setShowRestaurantDiscovery(false);
    setPhotoMenuError("");
    setShowPhotoCamera(true);
  }

  async function handlePhotoCaptured(photo: { imageBase64: string; mimeType: "image/jpeg" }) {
    setPhotoMenuError("");
    setPhotoMenuLoading(true);

    try {
      const result = await extractMenuTextFromPhoto(photo);
      const extractedMenuText = result.menuText.trim();

      setShowPhotoCamera(false);
      startAnalyzeWithExtractedMenuText(extractedMenuText);
    } catch (error) {
      const isNoTextError =
        error instanceof PickForMeApiError &&
        error.code === "NO_MENU_TEXT_RECOGNIZED";
      setPhotoMenuError(isNoTextError ? content.photoMenu.noTextError : content.photoMenu.genericError);
    } finally {
      setPhotoMenuLoading(false);
    }
  }

  function showAllergyWarningBeforeAnalyze() {
    setShowAllergyWarning(true);
  }

  function rejectAllergyWarning() {
    pendingConfirmedMenuTextRef.current = null;
    pendingConfirmedMenuUrlsRef.current = [];
    analyze.reset();
    setShowAllergyWarning(false);
  }

  async function confirmAllergyWarningAndAnalyze() {
    setAllergyWarningSaving(true);
    try {
      await logAllergyWarningConfirmation({
        confirmationTimestamp: new Date().toISOString(),
        confirmationVersion: ALLERGY_WARNING_CONFIRMATION_VERSION
      });
      setShowAllergyWarning(false);
      const pendingMenuText = pendingConfirmedMenuTextRef.current;
      const pendingMenuUrls = pendingConfirmedMenuUrlsRef.current;
      pendingConfirmedMenuTextRef.current = null;
      pendingConfirmedMenuUrlsRef.current = [];
      if (pendingMenuText) {
        analyze.run(pendingMenuText, situation, pendingMenuUrls);
        return;
      }
      startAnalyze();
    } catch {
      pendingConfirmedMenuTextRef.current = null;
      analyze.reset();
      setShowAllergyWarning(false);
      Alert.alert(
        content.allergyWarning.logFailedTitle,
        content.allergyWarning.logFailedMessage
      );
    } finally {
      setAllergyWarningSaving(false);
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
          onReset={resetAnalysisState}
          openMenuLabel={lastAnalyzedMenuUrl ? content.pick.openMenu : undefined}
          onOpenMenu={lastAnalyzedMenuUrl ? openAnalyzedMenu : undefined}
        />
      </Screen>
    );
  }

  if (showPhotoCamera) {
    return (
      <Screen
        bottomScrollInset={s(48)}
        contentContainerStyle={local.photoScreenContent}
        scrollToTopKey="pick-entry-photo-camera"
      >
        <PhotoMenuCamera
          loading={photoMenuLoading}
          onCancel={() => {
            if (photoMenuLoading) return;
            setShowPhotoCamera(false);
            setPhotoMenuError("");
          }}
          onPhotoCaptured={handlePhotoCaptured}
        />

        {photoMenuError ? (
          <Text style={local.photoMenuError}>{photoMenuError}</Text>
        ) : null}
      </Screen>
    );
  }

  const restaurantContextName = selectedRestaurantName.trim();
  const showRestaurantContext = Boolean(menuText.trim() && restaurantContextName);
  const showEmptyProfileHint = !hasActiveProfileChips(profile);

  return (
    <Screen
      bottomScrollInset={ENTRY_BOTTOM_SCROLL_INSET}
      contentContainerStyle={local.entryScreenContent}
      scrollToEndKey={entryScrollToActionKey || undefined}
      scrollToTopKey="pick-entry"
    >
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
              setSelectedRestaurantName("");
              setSelectedMenuSourceDomain("");
              setShowQrScanner(false);
              setShowPhotoCamera(false);
              setPhotoMenuError("");
              setShowRestaurantDiscovery(false);
            }}
            onClose={() => setShowQrScanner(false)}
          />
        ) : (
          <MenuInputCard menuText={menuText} setMenuText={updateMenuText} compact />
        )}

        {photoMenuError ? (
          <Text style={local.photoMenuError}>{photoMenuError}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={photoMenuLoading}
          style={[local.findMenuRow, photoMenuLoading && local.findMenuRowDisabled]}
          onPress={openPhotoCamera}
        >
          <View style={local.findMenuLeft}>
            <Feather color={premiumPalette.gold} name="camera" size={s(19)} />
            <Text style={local.findMenuText}>
              {photoMenuLoading ? content.photoMenu.extracting : content.pick.photoMenuButton}
            </Text>
          </View>
          <Feather color={premiumPalette.textSoft} name="chevron-right" size={s(24)} />
        </Pressable>

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
      />

      {showRestaurantContext ? (
        <View style={local.restaurantContextCard}>
          <Text style={local.restaurantContextLabel}>{content.pick.restaurantContextLabel}</Text>
          <Text style={local.restaurantContextName}>{restaurantContextName}</Text>
          {selectedMenuSourceDomain ? (
            <Text style={local.restaurantContextSource}>
              {content.pick.restaurantMenuSourceLabel.replace("{provider}", selectedMenuSourceDomain)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showEmptyProfileHint ? (
        <View style={local.profileHintCard}>
          <View style={local.profileHintIcon}>
            <Feather color={premiumPalette.gold} name="user" size={s(19)} />
          </View>
          <View style={local.profileHintCopy}>
            <Text style={local.profileHintTitle}>{content.pick.profileHintTitle}</Text>
            <Text style={local.profileHintText}>{content.pick.profileHintText}</Text>
          </View>
          {onOpenProfile ? (
            <Pressable
              accessibilityRole="link"
              onPress={onOpenProfile}
              style={({ pressed }) => [
                local.profileHintButton,
                pressed ? local.profileHintButtonPressed : null
              ]}
            >
              <Text style={local.profileHintButtonText}>{content.pick.profileHintAction}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
            <Text style={local.errorTitle}>
              {analyze.error === content.analysisErrors.emptyMenuInput
                ? content.pick.inputMissingTitle
                : content.pick.errorTitle}
            </Text>
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
      <Modal
        animationType="fade"
        onRequestClose={() => undefined}
        transparent
        visible={showAllergyWarning}
      >
        <View style={local.allergyWarningOverlay}>
          <View style={local.allergyWarningDialog}>
            <Text style={local.allergyWarningTitle}>{content.allergyWarning.title}</Text>
            {allergyWarningParagraphs[0] ? (
              <Text style={local.allergyWarningText}>{allergyWarningParagraphs[0]}</Text>
            ) : null}
            {allergyWarningParagraphs[1] ? (
              <Text style={local.allergyWarningText}>
                {renderAllergyWarningParagraph(allergyWarningParagraphs[1])}
              </Text>
            ) : null}
            {allergyWarningParagraphs[2] ? (
              <Text style={local.allergyWarningText}>{allergyWarningParagraphs[2]}</Text>
            ) : null}
            <View style={local.allergyWarningActions}>
              <Pressable
                accessibilityRole="button"
                disabled={allergyWarningSaving}
                onPress={rejectAllergyWarning}
                style={({ pressed }) => [
                  local.allergyWarningButton,
                  local.allergyWarningButtonSecondary,
                  (pressed || allergyWarningSaving) ? local.allergyWarningButtonPressed : null
                ]}
              >
                <Text style={local.allergyWarningButtonSecondaryText}>
                  {content.allergyWarning.rejectButton}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={allergyWarningSaving}
                onPress={confirmAllergyWarningAndAnalyze}
                style={({ pressed }) => [
                  local.allergyWarningButton,
                  local.allergyWarningButtonPrimary,
                  (pressed || allergyWarningSaving) ? local.allergyWarningButtonPressed : null
                ]}
              >
                <Text style={local.allergyWarningButtonPrimaryText}>
                  {content.allergyWarning.confirmButton}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function renderAllergyWarningParagraph(paragraph: string) {
  const strongPhrases = [
    "Please check every dish yourself",
    "Bitte prüfe jedes Gericht eigenverantwortlich"
  ];
  const phrase = strongPhrases.find((value) => paragraph.includes(value));

  if (!phrase) {
    return paragraph;
  }

  const [before, after = ""] = paragraph.split(phrase);

  return (
    <>
      {before}
      <Text style={local.allergyWarningStrong}>{phrase}</Text>
      {after}
    </>
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

  photoScreenContent: {
    backgroundColor: premiumPalette.background,
    paddingBottom: s(18),
    paddingTop: s(8)
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

  restaurantContextCard: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(24),
    borderWidth: 1,
    marginBottom: s(18),
    paddingHorizontal: s(20),
    paddingVertical: s(18),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.06,
    shadowRadius: s(16)
  },

  restaurantContextLabel: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "700",
    lineHeight: fs(20),
    marginBottom: s(4)
  },

  restaurantContextName: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(22),
    fontWeight: "800",
    lineHeight: fs(28)
  },

  restaurantContextSource: {
    color: premiumPalette.textSoft,
    fontSize: fs(13),
    fontWeight: "700",
    lineHeight: fs(18),
    marginTop: s(6)
  },

  profileHintCard: {
    alignItems: "flex-start",
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(24),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(12),
    marginBottom: s(18),
    padding: s(18),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.06,
    shadowRadius: s(16)
  },

  profileHintIcon: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(17),
    borderWidth: 1,
    height: s(38),
    justifyContent: "center",
    width: s(38)
  },

  profileHintCopy: {
    flex: 1,
    minWidth: 0
  },

  profileHintTitle: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21),
    marginBottom: s(4)
  },

  profileHintText: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "600",
    lineHeight: fs(20)
  },

  profileHintButton: {
    borderColor: premiumPalette.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: s(12),
    paddingVertical: s(8)
  },

  profileHintButtonPressed: {
    opacity: 0.72
  },

  profileHintButtonText: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(13),
    fontWeight: "800",
    lineHeight: fs(17)
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
  findMenuRowDisabled: {
    opacity: 0.62
  },
  photoMenuError: {
    color: "#8A341E",
    fontSize: fs(14),
    fontWeight: "700",
    lineHeight: fs(20),
    marginTop: s(10)
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
  },

  allergyWarningOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(24, 44, 27, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: s(22)
  },

  allergyWarningDialog: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(26),
    borderWidth: 1,
    maxWidth: s(360),
    padding: s(22),
    shadowColor: "#182C1B",
    shadowOffset: { width: 0, height: s(14) },
    shadowOpacity: 0.18,
    shadowRadius: s(24),
    width: "100%"
  },

  allergyWarningTitle: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(21),
    fontWeight: "800",
    lineHeight: fs(27),
    marginBottom: s(14)
  },

  allergyWarningText: {
    color: premiumPalette.textSoft,
    fontSize: fs(15),
    fontWeight: "600",
    lineHeight: fs(22),
    marginBottom: s(12)
  },

  allergyWarningStrong: {
    color: premiumPalette.oliveDeep,
    fontWeight: "900"
  },

  allergyWarningActions: {
    gap: s(10),
    marginTop: s(6)
  },

  allergyWarningButton: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: s(48),
    paddingHorizontal: s(16)
  },

  allergyWarningButtonPrimary: {
    backgroundColor: premiumPalette.olive
  },

  allergyWarningButtonSecondary: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border,
    borderWidth: 1
  },

  allergyWarningButtonPressed: {
    opacity: 0.72
  },

  allergyWarningButtonPrimaryText: {
    color: premiumPalette.surface,
    fontSize: fs(15),
    fontWeight: "800",
    lineHeight: fs(20)
  },

  allergyWarningButtonSecondaryText: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(15),
    fontWeight: "800",
    lineHeight: fs(20)
  }
});

function hasAllergiesOrIntolerances(profile: UserProfile) {
  const allergenValues = profileFeatures.allergenModuleEnabled ? profile.allergens : [];

  return [allergenValues, profile.intolerances, profile.customIntolerances].some((items) =>
    (items ?? []).some((item) => item.trim().length > 0)
  );
}

function hasActiveProfileChips(profile: UserProfile) {
  const allergenValues = profileFeatures.allergenModuleEnabled ? profile.allergens : [];

  return profile.dietStyle !== "normal" || [profile.primaryLikes, profile.dislikes, profile.intolerances, allergenValues].some((items) =>
    (items ?? []).some((item) => item.trim().length > 0)
  );
}
