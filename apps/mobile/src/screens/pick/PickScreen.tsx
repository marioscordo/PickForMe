import { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useProfile } from "../../app/providers/ProfileProvider";
import { extractMenuTextFromPhoto, logAllergyWarningConfirmation } from "../../api/pickformeApi";
import { PickForMeApiError } from "../../api/apiClient";
import { Screen } from "../../components/ui/Screen";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { PhotoMenuCamera } from "../../components/pick/PhotoMenuCamera";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { RecommendationModeSelector } from "../../components/pick/SituationSelector";
import { AnalysisLoadingBox } from "../../components/pick/AnalysisLoadingBox";
import { ActionButton } from "../../components/ui/ActionButton";
import { GustaroHelp } from "../../components/ui/GustaroHelp";
import { profileFeatures } from "../../config/profileFeatures";
import { useMobileContent } from "../../content/useMobileContent";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { premiumColors, radius, spacing, typography } from "../../theme/tokens";
import { DEFAULT_RECOMMENDATION_MODE, requestedDishRolesForMode, type RecommendationModeId } from "../../types/recommendationMode";
import type { UserProfile } from "../../types/profile";

type PickScreenProps = {
  onGoHome?: () => void;
  onOpenProfile?: () => void;
  onOpenProfilePreferences?: () => void;
  returnToMoodKey?: number;
};

type MenuInputOrigin = "empty" | "manual" | "qr" | "photo";

const ALLERGY_WARNING_CONFIRMATION_VERSION = "allergy-warning-v1";
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
  onOpenProfile,
  onOpenProfilePreferences,
  returnToMoodKey = 0
}: PickScreenProps) {
  const content = useMobileContent();
  const { profile } = useProfile();
  const loadingSteps = content.pick.loadingSteps;
  const [menuText, setMenuText] = useState("");
  const [menuInputOrigin, setMenuInputOrigin] = useState<MenuInputOrigin>("empty");
  const [recommendationMode, setRecommendationMode] = useState<RecommendationModeId>(DEFAULT_RECOMMENDATION_MODE);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showPhotoCamera, setShowPhotoCamera] = useState(false);
  const [photoMenuLoading, setPhotoMenuLoading] = useState(false);
  const [photoMenuError, setPhotoMenuError] = useState("");
  const [entryScrollToActionKey, setEntryScrollToActionKey] = useState(0);
  const [entryScrollToMoodKey, setEntryScrollToMoodKey] = useState(0);
  const [entryScrollToTopKey, setEntryScrollToTopKey] = useState(0);
  const [moodSectionY, setMoodSectionY] = useState(0);
  const analyze = useAnalyzeMenu();
  const [openableMenuUrl, setOpenableMenuUrl] = useState<string | null>(null);
  const [showAllergyWarning, setShowAllergyWarning] = useState(false);
  const [allergyWarningSaving, setAllergyWarningSaving] = useState(false);
  const pendingConfirmedMenuTextRef = useRef<string | null>(null);
  const linkConfirmedAtRef = useRef<number | null>(null);
  const menuBrowserOpeningRef = useRef(false);
  const allergyWarningParagraphs = content.allergyWarning.message.split("\n\n");

  useEffect(() => {
    if (returnToMoodKey > 0) {
      setEntryScrollToMoodKey((current) => current + 1);
    }
  }, [returnToMoodKey]);

  useEffect(() => {
    if (!analyze.result || !analyze.lastResponseReceivedAt || !__DEV__) {
      return;
    }

    const responseReceivedAt = analyze.lastResponseReceivedAt;
    const runId = analyze.lastDiagnosticRunId;
    const frame = requestAnimationFrame(() => {
      console.info("[GUSTARO_DEV_ANALYZE_TIMING]", [
        runId ? `runId=${runId}` : "",
        `phase=mobile.response_to_render_complete`,
        `durationMs=${Date.now() - responseReceivedAt}`,
        "success=true"
      ].filter(Boolean).join(" "));
    });

    return () => cancelAnimationFrame(frame);
  }, [analyze.lastDiagnosticRunId, analyze.lastResponseReceivedAt, analyze.result]);

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

  function logAnalyzeSource(value: string, urls: string[] | undefined, phase: string) {
    if (!__DEV__) {
      return;
    }

    const normalizedMenuTextUrl = normalizeMenuUrl(value);
    const firstMenuUrl = urls?.[0]?.trim() ?? "";

    console.info("[GUSTARO_MOBILE_ANALYZE_SOURCE]", JSON.stringify({
      phase,
      menuTextUrl: normalizedMenuTextUrl,
      firstMenuUrl,
      effectiveSourceCandidate: normalizedMenuTextUrl ? "menuTextUrl" : firstMenuUrl ? "firstMenuUrl" : "menuText",
      menuTextIsUrl: Boolean(normalizedMenuTextUrl),
      menuUrlsCount: urls?.length ?? 0,
      menuInputOrigin,
      fromManualLinkOrText: menuInputOrigin === "manual"
    }));
  }

  function logAnalyzeLifecycle(fields: Record<string, string | number | boolean | null | undefined>) {
    if (!__DEV__) {
      return;
    }

    const payload = Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
      .join(" ");

    console.info(`[GUSTARO_MOBILE_ANALYZE_LIFECYCLE] ${payload}`);
  }

  function updateMenuText(value: string) {
    const normalizedMenuUrl = normalizeMenuUrl(value);

    setMenuText(value);
    setMenuInputOrigin(value.trim() ? "manual" : "empty");
    setOpenableMenuUrl(normalizedMenuUrl || null);

    if (normalizedMenuUrl) {
      linkConfirmedAtRef.current = Date.now();
      Keyboard.dismiss();
      setEntryScrollToMoodKey((current) => current + 1);
    } else {
      linkConfirmedAtRef.current = null;
    }
  }

  function handleAnalyze() {
    Keyboard.dismiss();
    pendingConfirmedMenuTextRef.current = null;
    analyze.reset();

    if (hasAllergiesOrIntolerances(profile)) {
      showAllergyWarningBeforeAnalyze();
      return;
    }

    startAnalyze();
  }

  function startAnalyze() {
    const normalizedMenuUrl = normalizeMenuUrl(menuText);

    logAnalyzeSource(menuText, undefined, "startAnalyze");
    if (normalizedMenuUrl) {
      setOpenableMenuUrl(normalizedMenuUrl);
    }
    analyze.run(menuText, requestedDishRolesForMode(recommendationMode), undefined, {
      linkConfirmedAt: linkConfirmedAtRef.current ?? undefined
    });
  }

  function startAnalyzeWithExtractedMenuText(value: string) {
    analyze.reset();
    setMenuText(value);
    setMenuInputOrigin("photo");
    setOpenableMenuUrl(null);

    if (hasAllergiesOrIntolerances(profile)) {
      pendingConfirmedMenuTextRef.current = value;
      showAllergyWarningBeforeAnalyze();
      return;
    }

    logAnalyzeSource(value, [], "photo");
    analyze.run(value, requestedDishRolesForMode(recommendationMode), []);
  }

  function resetAnalysisState() {
    analyze.reset();
    setMenuText("");
    setMenuInputOrigin("empty");
    setOpenableMenuUrl(null);
    setRecommendationMode(DEFAULT_RECOMMENDATION_MODE);
    setEntryScrollToActionKey(0);
    setEntryScrollToMoodKey(0);
    setEntryScrollToTopKey((current) => current + 1);
  }

  function openPhotoCamera() {
    setShowQrScanner(false);
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
      pendingConfirmedMenuTextRef.current = null;
      if (pendingMenuText) {
        logAnalyzeSource(pendingMenuText, undefined, "allergyConfirmed");
        analyze.run(pendingMenuText, requestedDishRolesForMode(recommendationMode), undefined, {
          linkConfirmedAt: linkConfirmedAtRef.current ?? undefined
        });
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
    const menuUrl = openableMenuUrl?.trim() ?? "";
    if (!menuUrl || menuBrowserOpeningRef.current) {
      return;
    }

    menuBrowserOpeningRef.current = true;
    logAnalyzeLifecycle({
      phase: "open_menu_start",
      requestId: analyze.currentRequestId,
      analyzeLoading: analyze.loading,
      openMethod: "expo_web_browser"
    });

    try {
      const result = await WebBrowser.openBrowserAsync(menuUrl);
      logAnalyzeLifecycle({
        phase: "open_menu_closed",
        requestId: analyze.currentRequestId,
        analyzeLoading: analyze.loading,
        browserResultType: result.type
      });
    } catch (error) {
      logAnalyzeLifecycle({
        phase: "open_menu_error",
        requestId: analyze.currentRequestId,
        analyzeLoading: analyze.loading,
        errorClass: error instanceof Error ? error.name : typeof error
      });
    } finally {
      menuBrowserOpeningRef.current = false;
    }
  }

  const canOpenMenu = typeof openableMenuUrl === "string" && openableMenuUrl.trim().length > 0;

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
          showStartersAndSaladsAction={recommendationMode === "main_course"}
          onReset={resetAnalysisState}
          openMenuLabel={canOpenMenu ? content.pick.openMenu : undefined}
          onOpenMenu={canOpenMenu ? openAnalyzedMenu : undefined}
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

  const showEmptyProfileHint = !hasActiveProfileChips(profile);

  return (
    <Screen
      bottomScrollInset={ENTRY_BOTTOM_SCROLL_INSET}
      contentContainerStyle={local.entryScreenContent}
      scrollToEndKey={entryScrollToActionKey || undefined}
      scrollToOffsetKey={entryScrollToMoodKey || undefined}
      scrollToOffsetY={Math.max(moodSectionY - s(12), 0)}
      scrollToTopKey={`pick-entry-${entryScrollToTopKey}`}
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
              const normalizedMenuUrl = normalizeMenuUrl(value);

              setMenuText(value);
              setMenuInputOrigin("qr");
              setOpenableMenuUrl(normalizedMenuUrl || null);
              linkConfirmedAtRef.current = normalizedMenuUrl ? Date.now() : null;
              setShowQrScanner(false);
              setShowPhotoCamera(false);
              setPhotoMenuError("");
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
      </View>

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

      <View
        onLayout={(event) => setMoodSectionY(event.nativeEvent.layout.y)}
        style={local.premiumCard}
      >
        <View style={local.cardHeader}>
          <View style={local.cardIcon}>
            <Feather color={premiumPalette.gold} name="heart" size={s(20)} />
          </View>
          <View style={local.cardHeaderText}>
            <Text style={local.cardTitle}>{content.pick.moodTitle}</Text>
            <Text style={local.cardHint}>{content.pick.moodHint}</Text>
          </View>
        </View>
        <RecommendationModeSelector mode={recommendationMode} setMode={setRecommendationMode} />
      </View>

      {onOpenProfilePreferences ? (
        <Pressable
          accessibilityRole="button"
          disabled={analyze.loading}
          onPress={onOpenProfilePreferences}
          style={({ pressed }) => [
            local.reviewPreferencesButton,
            analyze.loading ? local.reviewPreferencesButtonDisabled : null,
            pressed ? local.reviewPreferencesButtonPressed : null
          ]}
        >
          <Feather color={premiumPalette.gold} name="user-check" size={s(18)} />
          <Text style={local.reviewPreferencesButtonText}>{content.pick.reviewPreferences}</Text>
        </Pressable>
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

      {canOpenMenu ? (
        <View style={local.openMenuSection}>
          <ActionButton label={content.pick.openMenu} variant="secondary" onPress={openAnalyzedMenu} />
        </View>
      ) : null}

      {analyze.loading ? (
        <AnalysisLoadingBox
          steps={loadingSteps}
          title={content.pick.loadingTitle}
        />
      ) : null}

      {analyze.error ? (
        <>
          <View style={local.feedbackErrorCard}>
            <Text style={local.errorTitle}>
              {analyze.errorTitle ||
              (analyze.error === content.analysisErrors.emptyMenuInput
                ? content.pick.inputMissingTitle
                : content.pick.errorTitle)}
            </Text>
            <Text style={local.errorText}>{analyze.error}</Text>
          </View>

        </>
      ) : null}

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

  reviewPreferencesButton: {
    alignItems: "center",
    alignSelf: "center",
    borderColor: premiumPalette.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: s(8),
    justifyContent: "center",
    marginBottom: s(10),
    minHeight: s(46),
    paddingHorizontal: s(18),
    paddingVertical: s(10)
  },

  reviewPreferencesButtonDisabled: {
    opacity: 0.55
  },

  reviewPreferencesButtonPressed: {
    opacity: 0.72
  },

  reviewPreferencesButtonText: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(15),
    fontWeight: "800",
    lineHeight: fs(20),
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

  return [allergenValues].some((items) =>
    (items ?? []).some((item) => item.trim().length > 0)
  );
}

function hasActiveProfileChips(profile: UserProfile) {
  const allergenValues = profileFeatures.allergenModuleEnabled ? profile.allergens : [];

  return [profile.primaryLikes, profile.customExclusions, allergenValues].some((items) =>
    (items ?? []).some((item) => item.trim().length > 0)
  );
}
