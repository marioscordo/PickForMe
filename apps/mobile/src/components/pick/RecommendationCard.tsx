import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useProfile } from "../../app/providers/ProfileProvider";
import { useWinePreference } from "../../app/providers/WinePreferenceProvider";
import {
  analyzeMenu,
  requestRestaurantIntro,
  requestWineMenuRecommendation,
  requestWineRecommendation,
  type MenuImageSource
} from "../../api/pickformeApi";
import { DEFAULT_OUTPUT_LOCALE, resolveOutputLocale } from "../../config/outputLocales";
import { profileFeatures } from "../../config/profileFeatures";
import { useMobileContent } from "../../content/useMobileContent";
import { getAnalyzeMenuErrorMessage } from "../../hooks/useAnalyzeMenu";
import { premiumColors, radius, semanticColors, spacing, typography } from "../../theme/tokens";
import type { Dish } from "../../types/menu";
import type { AnalyzeData, ConcreteWineRecommendation, OrderLabels, Recommendation, WineRecommendation } from "../../types/recommendations";
import { AnalysisLoadingBox } from "./AnalysisLoadingBox";
import { Surface } from "../ui/Surface";

type RestaurantIntroStatus = "idle" | "loading" | "loaded" | "error";
type NestedRecommendationStatus = "idle" | "loading" | "loaded" | "error";
type PremiumActionTone = "secondary";
type NestedRecommendationState = {
  error?: string;
  result?: AnalyzeData;
  status: NestedRecommendationStatus;
};
type WineRecommendationState = {
  error?: string;
  result?: WineRecommendation | ConcreteWineRecommendation | null;
  status: NestedRecommendationStatus;
};
type WineMenuSearchState = {
  error?: string;
  status: "idle" | "loading" | "no_match" | "error";
};
type SelectedOrderItem = {
  nameOriginal: string;
  priceText?: string;
};
function buildDisplayTranslation(originalName: string, translatedName?: string) {
  const cleaned = translatedName?.trim() ?? "";

  if (cleaned.length > 0 && cleaned.toLowerCase() !== originalName.toLowerCase()) {
    return cleaned;
  }

  return "";
}

function firstNonEmptyText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleaned = value?.trim();

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function isGermanOutputLocale(outputLocale: string) {
  return outputLocale.toLowerCase().replace("_", "-").startsWith("de");
}

function visibleDescriptionForOutputLocale(
  translatedDescription: string | null | undefined,
  outputLocale: string,
  ...fallbacks: Array<string | null | undefined>
) {
  if (isGermanOutputLocale(outputLocale)) {
    return firstNonEmptyText(translatedDescription);
  }

  return firstNonEmptyText(translatedDescription, ...fallbacks);
}

function formatEuroPrice(price: number) {
  return `${price.toFixed(2).replace(".", ",")} €`;
}

function formatDisplayPrice({
  missingPriceText,
  price,
  priceApproxDisplay,
  priceDisplay
}: {
  missingPriceText: string;
  price?: number;
  priceApproxDisplay?: string;
  priceDisplay?: string;
}) {
  const original = priceDisplay?.trim();
  const approximate = priceApproxDisplay?.trim();

  if (original && approximate) {
    return `${original} · ${approximate}`;
  }

  if (original) {
    return original;
  }

  if (typeof price === "number") {
    return formatEuroPrice(price);
  }

  return missingPriceText;
}

function fallbackOrderLabels(): OrderLabels {
  return { title: "Bestellung", starter: "Vorspeise", main: "Hauptspeise", wine: "Wein" };
}

function normalizeRestaurantIntroText(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitRestaurantIntroParagraphs(value: string) {
  const paragraphs = normalizeRestaurantIntroText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length !== 1) {
    return paragraphs;
  }

  const introParagraph = paragraphs[0];
  if (!introParagraph) {
    return paragraphs;
  }

  const sentences = introParagraph.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

  if (sentences.length <= 3) {
    return paragraphs;
  }

  const groupedParagraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    groupedParagraphs.push(sentences.slice(index, index + 2).join(" "));
  }

  return groupedParagraphs;
}

function PremiumCardAction({
  disabled,
  hero,
  label,
  onPress,
  tone
}: {
  disabled?: boolean;
  hero?: boolean;
  label: string;
  onPress: () => void;
  tone: PremiumActionTone;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        local.premiumAction,
        local.premiumActionSecondary,
        hero && tone === "secondary" ? local.premiumActionSecondaryHero : null,
        state.pressed && !disabled ? local.premiumActionPressed : null,
        disabled ? local.premiumActionDisabled : null
      ]}
    >
      <Text
        style={[
          local.premiumActionText,
          local.premiumActionSecondaryText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PremiumFooterAction({
  icon,
  label,
  onPress
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [local.footerPremiumButton, pressed ? local.footerPremiumButtonPressed : null]}
    >
      <View style={local.footerPremiumIcon}>{icon}</View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={local.footerPremiumText}>
        {label}
      </Text>
      <Feather color={premiumColors.textMuted} name="chevron-right" size={22} />
    </Pressable>
  );
}

export function RecommendationCard({
  result,
  menuText,
  menuUrls,
  menuImageSource,
  showStartersAndSaladsAction = false,
  showWineRecommendationAction = false,
  onReset,
  openMenuLabel,
  onOpenMenu,
  onRevealWineRecommendation
}: {
  result: AnalyzeData;
  menuText: string;
  menuUrls?: string[];
  menuImageSource?: MenuImageSource | null;
  showStartersAndSaladsAction?: boolean;
  showWineRecommendationAction?: boolean;
  onReset: () => void;
  openMenuLabel?: string;
  onOpenMenu?: () => void;
  onRevealWineRecommendation?: (y: number) => void;
}) {
  const content = useMobileContent();
  const { profile } = useProfile();
  const { winePreference } = useWinePreference();
  const wineFeatureEnabled = profileFeatures.wineFeatureEnabled;
  const activeWinePreference = wineFeatureEnabled ? winePreference : null;
  const nestedLoadingDishIdsRef = useRef(new Set<string>());
  const activeNestedDishIdRef = useRef<string | null>(null);
  const nestedRequestIdRef = useRef(0);
  const nestedAbortControllerRef = useRef<AbortController | null>(null);
  const wineLoadingDishIdsRef = useRef(new Set<string>());
  const activeWineDishIdRef = useRef<string | null>(null);
  const wineRequestIdRef = useRef(0);
  const wineAbortControllerRef = useRef<AbortController | null>(null);
  const pendingWineRevealDishIdRef = useRef<string | null>(null);
  const wineResultYByDishIdRef = useRef<Record<string, number>>({});
  const wineMenuRequestIdRef = useRef(0);
  const wineMenuAbortControllerRef = useRef<AbortController | null>(null);
  const restaurantIntroRequestIdRef = useRef(0);
  const restaurantIntroAbortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [activeNestedDishId, setActiveNestedDishId] = useState<string | null>(null);
  const [nestedRecommendationsByDishId, setNestedRecommendationsByDishId] = useState<Record<string, NestedRecommendationState>>({});
  const [activeWineDishId, setActiveWineDishId] = useState<string | null>(null);
  const [wineRecommendationsByDishId, setWineRecommendationsByDishId] = useState<Record<string, WineRecommendationState>>({});
  const [wineMenuSearchByDishId, setWineMenuSearchByDishId] = useState<Record<string, WineMenuSearchState>>({});
  const [selectedStarterByDishId, setSelectedStarterByDishId] = useState<Record<string, SelectedOrderItem | undefined>>({});
  const [selectedWineByDishId, setSelectedWineByDishId] = useState<Record<string, SelectedOrderItem | undefined>>({});
  const [activeOrderDishId, setActiveOrderDishId] = useState<string | null>(null);
  const [restaurantIntroStatus, setRestaurantIntroStatus] = useState<RestaurantIntroStatus>("idle");
  const [restaurantIntroText, setRestaurantIntroText] = useState("");
  const [restaurantIntroVisible, setRestaurantIntroVisible] = useState(false);
  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);
  const visibleRecommendations = result.recommendations;
  const isUncertainReview = result.recommendationResultType === "uncertain_review";
  const outputLocale = resolveOutputLocale(profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE);
  const profileFingerprint = useMemo(
    () =>
      JSON.stringify({
        outputLocale: profile.outputLocale,
        primaryLikes: profile.primaryLikes,
        customExclusions: profile.customExclusions,
        allergens: profile.allergens,
        ...(activeWinePreference ? { winePreference: activeWinePreference } : {})
      }),
    [profile, activeWinePreference]
  );

  const safeRecommendations = visibleRecommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const renderedDescriptionCount = safeRecommendations.filter(({ rec, dish }) =>
      visibleDescriptionForOutputLocale(
        rec.translatedDescription,
        outputLocale,
        dish.description,
        rec.descriptionOriginal,
        dish.descriptionOriginal
      )
    ).length;

    console.info("[GUSTARO_MOBILE_RECOMMENDATION_DIAG]", [
      `phase=render`,
      `recommendationCount=${safeRecommendations.length}`,
      `renderedDescriptionCount=${renderedDescriptionCount}`
    ].join(" "));
  }, [result, outputLocale]);

  const restaurantIntroLocale = outputLocale;
  const cachedRestaurantIntro = normalizeRestaurantIntroText(restaurantIntroText);
  const restaurantIntroParagraphs = useMemo(
    () => splitRestaurantIntroParagraphs(cachedRestaurantIntro),
    [cachedRestaurantIntro]
  );
  const hasRestaurantIntro = restaurantIntroVisible && cachedRestaurantIntro.length > 0;
  const isRestaurantIntroLoading = restaurantIntroStatus === "loading";
  const topBox = (
    <Surface style={local.topBox}>
      <View style={local.topBoxAccent} />
      {hasRestaurantIntro ? (
        <Pressable
          accessibilityLabel={content.common.cancel}
          accessibilityRole="button"
          onPress={closeRestaurantIntro}
          style={({ pressed }) => [local.restaurantIntroCloseButton, pressed ? local.restaurantIntroCloseButtonPressed : null]}
        >
          <Feather color={premiumColors.textMuted} name="x" size={20} />
        </Pressable>
      ) : null}
      <Text style={local.title}>{content.recommendation.restaurantTitle}</Text>
      {hasRestaurantIntro ? (
        <ScrollView
          contentContainerStyle={local.restaurantIntroTextBlock}
          nestedScrollEnabled
          showsVerticalScrollIndicator={restaurantIntroParagraphs.length > 2}
          style={local.restaurantIntroScroll}
        >
          {restaurantIntroParagraphs.map((paragraph, index) => (
            <Text
              android_hyphenationFrequency="full"
              key={`${index}-${paragraph.slice(0, 16)}`}
              lineBreakStrategyIOS="standard"
              style={[
                local.restaurantIntroText,
                index === restaurantIntroParagraphs.length - 1 ? local.restaurantIntroTextLast : null
              ]}
              textBreakStrategy="highQuality"
            >
              {paragraph}
            </Text>
          ))}
        </ScrollView>
      ) : (
        <Text style={local.subtitle}>{content.recommendation.restaurantIntroTeaser}</Text>
      )}
      {isRestaurantIntroLoading ? (
        <Text style={local.restaurantIntroStatusText}>{content.recommendation.restaurantIntroLoading}</Text>
      ) : null}
      {restaurantIntroStatus === "error" ? (
        <Text style={local.restaurantIntroStatusText}>{content.recommendation.restaurantIntroError}</Text>
      ) : null}
      {!hasRestaurantIntro ? (
        <PremiumCardAction
          disabled={isRestaurantIntroLoading}
          label={
            restaurantIntroStatus === "error"
              ? content.recommendation.restaurantIntroRetry
              : content.recommendation.restaurantIntroButton
          }
          onPress={handleRestaurantIntro}
          tone="secondary"
        />
      ) : null}
    </Surface>
  );
  const analysisWarning = isUncertainReview
    ? content.recommendation.uncertainReviewWarning
    : result.analysisWarning?.trim() ?? "";
  const warningBox = analysisWarning ? (
    <Surface tone="soft" style={local.warningBox}>
      <Text style={local.warningTitle}>{content.recommendation.warningTitle}</Text>
      <Text style={local.warningText}>{analysisWarning}</Text>
    </Surface>
  ) : null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      resetTransientRecommendationState({ updateState: false });
    };
  }, []);

  useEffect(() => {
    resetTransientRecommendationState({ updateState: true });
  }, [profileFingerprint, restaurantIntroLocale, result]);

  function resetTransientRecommendationState({ updateState }: { updateState: boolean }) {
    nestedRequestIdRef.current += 1;
    nestedAbortControllerRef.current?.abort();
    nestedAbortControllerRef.current = null;
    nestedLoadingDishIdsRef.current.clear();
    activeNestedDishIdRef.current = null;

    wineRequestIdRef.current += 1;
    wineAbortControllerRef.current?.abort();
    wineAbortControllerRef.current = null;
    wineLoadingDishIdsRef.current.clear();
    activeWineDishIdRef.current = null;

    wineMenuRequestIdRef.current += 1;
    wineMenuAbortControllerRef.current?.abort();
    wineMenuAbortControllerRef.current = null;

    restaurantIntroRequestIdRef.current += 1;
    restaurantIntroAbortControllerRef.current?.abort();
    restaurantIntroAbortControllerRef.current = null;

    if (!updateState) {
      return;
    }

    setActiveNestedDishId(null);
    setNestedRecommendationsByDishId({});
    setActiveWineDishId(null);
    setWineRecommendationsByDishId({});
    setWineMenuSearchByDishId({});
    setSelectedStarterByDishId({});
    setSelectedWineByDishId({});
    setActiveOrderDishId(null);
    setRestaurantIntroStatus("idle");
    setRestaurantIntroText("");
    setRestaurantIntroVisible(false);
  }

  async function handleRestaurantIntro() {
    if (isRestaurantIntroLoading) {
      return;
    }

    if (cachedRestaurantIntro) {
      setRestaurantIntroVisible(true);
      setRestaurantIntroStatus("loaded");
      return;
    }

    setRestaurantIntroStatus("loading");
    const restaurantIntroRequestId = restaurantIntroRequestIdRef.current + 1;
    restaurantIntroRequestIdRef.current = restaurantIntroRequestId;
    restaurantIntroAbortControllerRef.current?.abort();
    const restaurantIntroAbortController = new AbortController();
    restaurantIntroAbortControllerRef.current = restaurantIntroAbortController;

    try {
      const data = await requestRestaurantIntro({
        menuText,
        profile,
        signal: restaurantIntroAbortController.signal
      });
      const nextText = normalizeRestaurantIntroText(data.introText);

      if (!mountedRef.current || restaurantIntroRequestIdRef.current !== restaurantIntroRequestId) {
        return;
      }

      if (!nextText) {
        setRestaurantIntroStatus("error");
        return;
      }

      setRestaurantIntroText(nextText);
      setRestaurantIntroVisible(true);
      setRestaurantIntroStatus("loaded");
    } catch {
      if (!mountedRef.current || restaurantIntroRequestIdRef.current !== restaurantIntroRequestId) {
        return;
      }

      setRestaurantIntroStatus("error");
    } finally {
      if (restaurantIntroRequestIdRef.current === restaurantIntroRequestId) {
        restaurantIntroAbortControllerRef.current = null;
      }
    }
  }

  function closeRestaurantIntro() {
    setRestaurantIntroVisible(false);
    setRestaurantIntroStatus("idle");
  }

  async function handleWineRecommendationSearch(dishId: string) {
    if (!wineFeatureEnabled) {
      return;
    }

    const activeDishId = activeWineDishIdRef.current;
    const currentStatus = wineRecommendationsByDishId[dishId]?.status;
    const dish = dishesById.get(dishId);
    const recommendation = visibleRecommendations.find((item) => item.dishId === dishId);

    if (activeDishId && activeDishId !== dishId) {
      return;
    }

    if (!dish || !recommendation) {
      return;
    }

    if (currentStatus === "loading" || currentStatus === "loaded" || wineLoadingDishIdsRef.current.has(dishId)) {
      return;
    }

    if (!activeDishId) {
      activeWineDishIdRef.current = dishId;
      setActiveWineDishId(dishId);
    }
    pendingWineRevealDishIdRef.current = dishId;

    wineLoadingDishIdsRef.current.add(dishId);
    setWineRecommendationsByDishId((current) => ({
      ...current,
      [dishId]: {
        status: "loading"
      }
    }));

    const wineRequestId = wineRequestIdRef.current + 1;
    wineRequestIdRef.current = wineRequestId;
    wineAbortControllerRef.current?.abort();
    const wineAbortController = new AbortController();
    wineAbortControllerRef.current = wineAbortController;

    try {
      const data = await requestWineRecommendation({
        mainDish: {
          rank: recommendation.rank,
          nameOriginal: dish.nameOriginal,
          translatedName: recommendation.translatedName,
          descriptionOriginal: dish.descriptionOriginal ?? recommendation.descriptionOriginal ?? null,
          translatedDescription: recommendation.translatedDescription ?? null,
          sourceEvidence: recommendation.facts ?? dish.sourceLine ?? null,
          reason: recommendation.reason
        },
        outputLocale: profile.outputLocale,
        winePreference,
        signal: wineAbortController.signal
      });

      if (!mountedRef.current || wineRequestIdRef.current !== wineRequestId || activeWineDishIdRef.current !== dishId) {
        return;
      }

      setWineRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          result: data.recommendation,
          status: "loaded"
        }
      }));
    } catch (error) {
      if (!mountedRef.current || wineRequestIdRef.current !== wineRequestId || activeWineDishIdRef.current !== dishId) {
        return;
      }

      setWineRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          error: error instanceof Error ? error.message : content.recommendation.wineRecommendationError,
          status: "error"
        }
      }));
    } finally {
      if (wineRequestIdRef.current === wineRequestId) {
        wineAbortControllerRef.current = null;
        wineLoadingDishIdsRef.current.delete(dishId);
      }
    }
  }

  function handleWineRecommendationLayout(dishId: string, y: number) {
    wineResultYByDishIdRef.current[dishId] = y;

    if (pendingWineRevealDishIdRef.current === dishId) {
      pendingWineRevealDishIdRef.current = null;
      onRevealWineRecommendation?.(y);
    }
  }

  async function handleWineMenuSearch(dishId: string) {
    if (!wineFeatureEnabled) {
      return;
    }

    const dish = dishesById.get(dishId);
    const recommendation = visibleRecommendations.find((item) => item.dishId === dishId);
    const currentStatus = wineMenuSearchByDishId[dishId]?.status;

    if (!dish || !recommendation || currentStatus === "loading") {
      return;
    }

    setWineMenuSearchByDishId((current) => ({
      ...current,
      [dishId]: {
        status: "loading"
      }
    }));

    const wineMenuRequestId = wineMenuRequestIdRef.current + 1;
    wineMenuRequestIdRef.current = wineMenuRequestId;
    wineMenuAbortControllerRef.current?.abort();
    const wineMenuAbortController = new AbortController();
    wineMenuAbortControllerRef.current = wineMenuAbortController;

    try {
      const data = await requestWineMenuRecommendation({
        mainDish: {
          rank: recommendation.rank,
          nameOriginal: dish.nameOriginal,
          translatedName: recommendation.translatedName,
          descriptionOriginal: dish.descriptionOriginal ?? recommendation.descriptionOriginal ?? null,
          translatedDescription: recommendation.translatedDescription ?? null,
          sourceEvidence: recommendation.facts ?? dish.sourceLine ?? null,
          reason: recommendation.reason
        },
        menuText,
        menuUrls,
        outputLocale: profile.outputLocale,
        winePreference,
        signal: wineMenuAbortController.signal
      });

      if (!mountedRef.current || wineMenuRequestIdRef.current !== wineMenuRequestId || activeWineDishIdRef.current !== dishId) {
        return;
      }

      if (!data.recommendation || data.recommendation.recommendationType !== "concrete_wine") {
        setWineMenuSearchByDishId((current) => ({
          ...current,
          [dishId]: {
            status: "no_match"
          }
        }));
        return;
      }

      setWineRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          result: data.recommendation,
          status: "loaded"
        }
      }));
      setWineMenuSearchByDishId((current) => ({
        ...current,
        [dishId]: {
          status: "idle"
        }
      }));
    } catch (error) {
      if (!mountedRef.current || wineMenuRequestIdRef.current !== wineMenuRequestId || activeWineDishIdRef.current !== dishId) {
        return;
      }

      setWineMenuSearchByDishId((current) => ({
        ...current,
        [dishId]: {
          error: error instanceof Error ? error.message : content.recommendation.wineRecommendationError,
          status: "error"
        }
      }));
    } finally {
      if (wineMenuRequestIdRef.current === wineMenuRequestId) {
        wineMenuAbortControllerRef.current = null;
      }
    }
  }

  function dismissWineMenuNoMatch(dishId: string) {
    setWineMenuSearchByDishId((current) => ({
      ...current,
      [dishId]: {
        status: "idle"
      }
    }));
  }

  async function handleStartersAndSaladsSearch(dishId: string) {
    const activeDishId = activeNestedDishIdRef.current;
    const currentStatus = nestedRecommendationsByDishId[dishId]?.status;

    if (activeDishId && activeDishId !== dishId) {
      return;
    }

    if (currentStatus === "loading" || currentStatus === "loaded" || nestedLoadingDishIdsRef.current.has(dishId)) {
      return;
    }

    if (!activeDishId) {
      activeNestedDishIdRef.current = dishId;
      setActiveNestedDishId(dishId);
    }
    nestedLoadingDishIdsRef.current.add(dishId);
    setNestedRecommendationsByDishId((current) => ({
      ...current,
      [dishId]: {
        status: "loading"
      }
    }));

    const nestedRequestId = nestedRequestIdRef.current + 1;
    nestedRequestIdRef.current = nestedRequestId;
    nestedAbortControllerRef.current?.abort();
    const nestedAbortController = new AbortController();
    nestedAbortControllerRef.current = nestedAbortController;
    const nestedStartedAt = Date.now();
    let responseStatus: number | undefined;

    logNestedAnalyzeDiag({
      activeDishId: activeNestedDishIdRef.current,
      appState: AppState.currentState,
      dishId,
      menuTextLength: menuText.length,
      nestedRequestId,
      phase: "request_start",
      requestedDishRoles: "starter,salad"
    });

    // Token-Optimierung Juli 2026: result.reusableMenuText ist nur gesetzt,
    // wenn die erste Analyse eine Text-/HTML-Speisekarte war (nie bei
    // PDF/Bild - siehe analyze-menu/route.ts). Ist es vorhanden, senden wir
    // den bereits extrahierten Text erneut statt der urspruenglichen URL und
    // sparen so den kompletten Re-Fetch/Re-Parse derselben Speisekarte.
    // Ohne menuImageSource-Check wuerde ein vorhandenes Bild-Feld sonst
    // stillschweigend ignoriert - deshalb bleibt der Originalpfad (menuText)
    // aktiv, sobald ein Bild im Spiel ist.
    const nestedMenuText = !menuImageSource && result.reusableMenuText
      ? result.reusableMenuText
      : menuText;

    try {
      const data = await analyzeMenu({
        menuText: nestedMenuText,
        menuImageSource,
        onResponseStatus: (status) => {
          responseStatus = status;
          logNestedAnalyzeDiag({
            appState: AppState.currentState,
            durationMs: Date.now() - nestedStartedAt,
            nestedRequestId,
            phase: "response_status",
            responseStatus: status
          });
        },
        requestedDishRoles: ["starter", "salad"],
        preferredDishRole: "starter",
        profile,
        signal: nestedAbortController.signal
      });

      logNestedAnalyzeDiag({
        activeDishId: activeNestedDishIdRef.current,
        appState: AppState.currentState,
        durationMs: Date.now() - nestedStartedAt,
        mounted: mountedRef.current,
        nestedRequestId,
        phase: "response_success",
        recommendationCount: data.recommendations.length,
        responseStatus
      });

      if (!mountedRef.current || nestedRequestIdRef.current !== nestedRequestId || activeNestedDishIdRef.current !== dishId) {
        logNestedAnalyzeDiag({
          activeDishId: activeNestedDishIdRef.current,
          appState: AppState.currentState,
          durationMs: Date.now() - nestedStartedAt,
          dishId,
          mounted: mountedRef.current,
          nestedRequestId,
          phase: "response_stale",
          responseStatus
        });
        return;
      }

      setNestedRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          result: data,
          status: "loaded"
        }
      }));
    } catch (error) {
      logNestedAnalyzeDiag({
        activeDishId: activeNestedDishIdRef.current,
        appState: AppState.currentState,
        durationMs: Date.now() - nestedStartedAt,
        errorCause: getErrorCauseMessage(error),
        errorClass: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : "",
        mounted: mountedRef.current,
        nestedRequestId,
        phase: "response_error",
        responseStatus
      });

      if (!mountedRef.current || nestedRequestIdRef.current !== nestedRequestId || activeNestedDishIdRef.current !== dishId) {
        return;
      }

      setNestedRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          error: getAnalyzeMenuErrorMessage(error, content),
          status: "error"
        }
      }));
    } finally {
      logNestedAnalyzeDiag({
        activeDishId: activeNestedDishIdRef.current,
        appState: AppState.currentState,
        durationMs: Date.now() - nestedStartedAt,
        nestedRequestId,
        phase: "request_finally",
        responseStatus
      });
      if (nestedRequestIdRef.current === nestedRequestId) {
        nestedAbortControllerRef.current = null;
        nestedLoadingDishIdsRef.current.delete(dishId);
      }
    }
  }

  if (safeRecommendations.length === 0) {
    return (
      <>
        {topBox}
        {warningBox}

        <Surface tone="soft" style={local.unsafeBox}>
          <Text style={local.kicker}>{content.recommendation.unsafeKicker}</Text>
          <Text style={local.title}>{content.recommendation.unsafeTitle}</Text>
          <Text style={local.subtitle}>
            {content.recommendation.unsafeText}
          </Text>
        </Surface>

        {renderFooterActions()}
      </>
    );
  }

  function renderFooterActions() {
    return (
      <View style={local.footerActions}>
        <PremiumFooterAction
          icon={<Feather color={premiumColors.gold} name="refresh-cw" size={21} />}
          label={content.recommendation.resetButton}
          onPress={onReset}
        />
        {openMenuLabel && onOpenMenu ? (
          <PremiumFooterAction
            icon={<Feather color={premiumColors.gold} name="external-link" size={21} />}
            label={openMenuLabel}
            onPress={onOpenMenu}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={local.resultRoot}>
      {topBox}
      {warningBox}

      <View style={local.list}>
        {safeRecommendations.map(({ rec, dish }, index) => {
          const dishData = dish as Dish & {
            name?: string;
            nameOriginal?: string;
            description?: string;
            price?: number;
          };

          const originalName = dishData.nameOriginal ?? dishData.name ?? content.recommendation.fallbackDishName;
          const translatedName = buildDisplayTranslation(originalName, rec.translatedName);
          const showTranslation = translatedName.length > 0;
          const translatedDescription = visibleDescriptionForOutputLocale(
            rec.translatedDescription,
            outputLocale,
            dishData.description,
            rec.descriptionOriginal,
            dishData.descriptionOriginal
          );
          const showDescription = translatedDescription.length > 0 && translatedDescription !== translatedName;
          const isPrimaryRecommendation = index === 0;
          const nestedState = nestedRecommendationsByDishId[rec.dishId] ?? { status: "idle" };
          const wineState = wineRecommendationsByDishId[rec.dishId] ?? { status: "idle" };
          const wineMenuState = wineMenuSearchByDishId[rec.dishId] ?? { status: "idle" };
          const isNestedActiveDish = activeNestedDishId === rec.dishId;
          const isWineActiveDish = activeWineDishId === rec.dishId;
          const isOtherNestedDishActive = Boolean(activeNestedDishId && !isNestedActiveDish);
          const isOtherWineDishActive = Boolean(activeWineDishId && !isWineActiveDish);
          const showNestedLoadingBox = isNestedActiveDish && nestedState.status === "loading";
          const nestedActionDisabled = nestedState.status === "loading" ||
            nestedState.status === "loaded" ||
            isOtherNestedDishActive;
          const wineActionDisabled = wineState.status === "loading" ||
            wineState.status === "loaded" ||
            isOtherWineDishActive;

          const priceText = formatDisplayPrice({
            missingPriceText: content.recommendation.missingPriceText,
            price: dishData.price,
            priceApproxDisplay: dishData.priceApproxDisplay ?? rec.priceApproxDisplay,
            priceDisplay: dishData.priceDisplay ?? rec.priceDisplay
          });
          return (
            <Surface key={dish.id} style={[local.card, isPrimaryRecommendation ? local.primaryCard : local.secondaryCard]}>
              <View style={[local.rankBubble, isPrimaryRecommendation ? local.rankBubblePrimary : local.rankBubbleSecondary]}>
                <Text style={[local.rankText, isPrimaryRecommendation && local.rankTextPrimary]}>{index + 1}</Text>
              </View>

              <View style={[local.cardText, isPrimaryRecommendation && local.cardTextPrimary]}>
                <Text style={[local.dishName, isPrimaryRecommendation ? local.dishNamePrimary : local.dishNameSecondary]}>
                  {originalName}
                </Text>

                {showTranslation ? (
                  <Text style={[local.translation, isPrimaryRecommendation && local.translationPrimary]}>{translatedName}</Text>
                ) : null}

                {showDescription ? (
                  <Text style={[local.description, isPrimaryRecommendation && local.descriptionPrimary]}>{translatedDescription}</Text>
                ) : null}

                {priceText ? <Text style={[local.price, isPrimaryRecommendation && local.pricePrimary]}>{priceText}</Text> : null}

                {showStartersAndSaladsAction && !isUncertainReview ? (
                  <View style={local.nestedActionBox}>
                    <PremiumCardAction
                      disabled={nestedActionDisabled}
                      hero={isPrimaryRecommendation}
                      label={
                        nestedState.status === "error"
                            ? content.recommendation.startersAndSaladsRetry
                            : content.recommendation.startersAndSaladsButton
                      }
                      onPress={() => handleStartersAndSaladsSearch(rec.dishId)}
                      tone="secondary"
                    />
                  </View>
                ) : null}

                {showWineRecommendationAction && wineFeatureEnabled && !isUncertainReview ? (
                  <View style={local.nestedActionBox}>
                    <PremiumCardAction
                      disabled={wineActionDisabled}
                      hero={isPrimaryRecommendation}
                      label={
                        wineState.status === "loading"
                          ? content.recommendation.wineRecommendationLoading
                          : wineState.status === "error"
                            ? content.recommendation.wineRecommendationRetry
                            : content.recommendation.wineRecommendationButton
                      }
                      onPress={() => handleWineRecommendationSearch(rec.dishId)}
                      tone="secondary"
                    />
                  </View>
                ) : null}

                {showNestedLoadingBox ? (
                  <AnalysisLoadingBox
                    steps={content.pick.loadingSteps}
                    style={local.nestedLoadingBox}
                    title={content.pick.loadingTitle}
                  />
                ) : null}

                {renderNestedRecommendations(rec.dishId, nestedState, isPrimaryRecommendation)}

                {isWineActiveDish ? renderWineRecommendation(rec.dishId, wineState, wineMenuState, isPrimaryRecommendation) : null}

                {!isUncertainReview ? (
                  <View style={local.nestedActionBox}>
                    <PremiumCardAction
                      hero={isPrimaryRecommendation}
                      label={content.recommendation.orderButton}
                      onPress={() => showOrderList(rec.dishId)}
                      tone="secondary"
                    />
                  </View>
                ) : null}

              </View>
            </Surface>
          );
        })}
      </View>

      {renderOrderList()}

      {renderFooterActions()}
    </View>
  );

  function renderWineRecommendation(
    dishId: string,
    state: WineRecommendationState,
    menuState: WineMenuSearchState,
    isPrimaryRecommendation: boolean
  ) {
    if (state.status === "loading") {
      return (
        <View
          onLayout={(event) => handleWineRecommendationLayout(dishId, event.nativeEvent.layout.y)}
          style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}
        >
          <Text style={local.nestedResultTitle}>{content.recommendation.wineRecommendationTitle}</Text>
          <Text style={local.nestedResultText}>{content.recommendation.wineRecommendationLoading}</Text>
        </View>
      );
    }

    if (state.status === "error") {
      return (
        <View
          onLayout={(event) => handleWineRecommendationLayout(dishId, event.nativeEvent.layout.y)}
          style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}
        >
          <Text style={local.nestedResultTitle}>{content.recommendation.wineRecommendationTitle}</Text>
          <Text style={local.nestedResultText}>{state.error || content.recommendation.wineRecommendationError}</Text>
        </View>
      );
    }

    if (state.status !== "loaded") {
      return null;
    }

    if (!state.result) {
      return (
        <View
          onLayout={(event) => handleWineRecommendationLayout(dishId, event.nativeEvent.layout.y)}
          style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}
        >
          <Text style={local.nestedResultTitle}>{content.recommendation.wineRecommendationTitle}</Text>
          <Text style={local.nestedResultText}>{content.recommendation.wineRecommendationEmpty}</Text>
        </View>
      );
    }

    const result = state.result;

    if (result.recommendationType === "concrete_wine") {
      const wine = result.primaryWine;
      const priceText = formatWinePriceText(wine.glassPriceRaw, content);
      const selectedWine = selectedWineByDishId[dishId];
      const isSelectedWine = selectedWine?.nameOriginal === wine.nameOriginal;
      const wineMeta = [
        priceText ? `${content.recommendation.wineRecommendationPriceLabel}: ${priceText}` : ""
      ].filter(Boolean).join(" · ");

      return (
        <View
          onLayout={(event) => handleWineRecommendationLayout(dishId, event.nativeEvent.layout.y)}
          style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}
        >
          <Text style={local.nestedResultTitle}>{result.title || content.recommendation.wineRecommendationTitle}</Text>
          <Text style={local.nestedResultName}>{wine.displayName || wine.nameOriginal}</Text>
          {wineMeta ? <Text style={local.nestedResultMeta}>{wineMeta}</Text> : null}
          <Text style={local.nestedResultText}>{result.reason}</Text>
          {result.servingHint ? (
            <Text style={local.nestedResultText}>{result.servingHint}</Text>
          ) : null}
          <Text style={local.nestedResultEvidence}>
            {content.recommendation.wineRecommendationEvidenceLabel}: {wine.sourceEvidence}
          </Text>
          <PremiumCardAction
            disabled={isSelectedWine}
            label={isSelectedWine ? content.recommendation.orderSelectedLabel : content.recommendation.orderSelectWine}
            onPress={() => selectWineForOrder(dishId, {
              nameOriginal: wine.nameOriginal,
              priceText
            })}
            tone="secondary"
          />
        </View>
      );
    }

    return (
      <View
        onLayout={(event) => handleWineRecommendationLayout(dishId, event.nativeEvent.layout.y)}
        style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}
      >
        <Text style={local.nestedResultTitle}>{result.title || content.recommendation.wineRecommendationTitle}</Text>
        <Text style={local.nestedResultName}>{result.wineStyle}</Text>
        <Text style={local.nestedResultText}>{result.reason}</Text>
        {result.servingHint ? (
          <Text style={local.nestedResultText}>{result.servingHint}</Text>
        ) : null}
        <View style={local.wineMenuSearchBox}>
          <Text style={local.nestedResultText}>{content.recommendation.wineMenuSearchPrompt}</Text>
          <PremiumCardAction
            disabled={menuState.status === "loading"}
            label={
              menuState.status === "loading"
                ? content.recommendation.wineMenuSearchLoading
                : content.recommendation.wineMenuSearchButton
            }
            onPress={() => handleWineMenuSearch(dishId)}
            tone="secondary"
          />
          {menuState.status === "no_match" ? (
            <View style={local.wineMenuNoMatchBox}>
              <Text style={local.nestedResultText}>{content.recommendation.wineMenuSearchNoMatch}</Text>
              <PremiumCardAction
                label={content.recommendation.wineMenuSearchOk}
                onPress={() => dismissWineMenuNoMatch(dishId)}
                tone="secondary"
              />
            </View>
          ) : null}
          {menuState.status === "error" ? (
            <Text style={local.nestedResultText}>{menuState.error || content.recommendation.wineRecommendationError}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  function formatWinePriceText(
    glassPriceRaw: string | null | undefined,
    mobileContent: ReturnType<typeof useMobileContent>
  ) {
    const cleanedGlassPrice = glassPriceRaw?.trim() ?? "";

    return cleanedGlassPrice
      ? `${mobileContent.recommendation.wineRecommendationServingUnit_glass} ${cleanedGlassPrice}`
      : "";
  }

  function selectStarterForOrder(dishId: string, item: SelectedOrderItem) {
    setSelectedStarterByDishId((current) => ({
      ...current,
      [dishId]: item
    }));
  }

  function selectWineForOrder(dishId: string, item: SelectedOrderItem) {
    setSelectedWineByDishId((current) => ({
      ...current,
      [dishId]: item
    }));
  }

  function showOrderList(dishId: string) {
    setActiveOrderDishId(dishId);
  }

  function closeOrderList() {
    setActiveOrderDishId(null);
  }

  function renderOrderList() {
    if (!activeOrderDishId) {
      return null;
    }

    const selectedMain = safeRecommendations.find(({ rec }) => rec.dishId === activeOrderDishId);

    if (!selectedMain) {
      return null;
    }

    const { rec, dish } = selectedMain;
    const dishData = dish as Dish & {
      name?: string;
      nameOriginal?: string;
      price?: number;
    };
    const mainNameOriginal = dishData.nameOriginal ?? dishData.name ?? content.recommendation.fallbackDishName;
    const mainPriceText = formatDisplayPrice({
      missingPriceText: content.recommendation.missingPriceText,
      price: dishData.price,
      priceApproxDisplay: dishData.priceApproxDisplay ?? rec.priceApproxDisplay,
      priceDisplay: dishData.priceDisplay ?? rec.priceDisplay
    });
    const mainDish: SelectedOrderItem = {
      nameOriginal: mainNameOriginal,
      priceText: mainPriceText
    };
    const dishId = activeOrderDishId;
    const starter = selectedStarterByDishId[dishId];
    const wine = selectedWineByDishId[dishId];
    const orderLabels = result.orderLabels ?? fallbackOrderLabels();
    const rows = [
      starter ? { label: orderLabels.starter, item: starter } : null,
      { label: orderLabels.main, item: mainDish },
      wine ? { label: orderLabels.wine, item: wine } : null
    ].filter((row): row is { label: string; item: SelectedOrderItem } => Boolean(row));

    return (
      <Modal animationType="slide" onRequestClose={closeOrderList} presentationStyle="fullScreen" visible>
        <View style={local.orderScreen}>
          <View style={local.orderScreenHeader}>
            <Text style={local.orderScreenTitle}>{orderLabels.title}</Text>
            <Pressable
              accessibilityLabel={content.common.cancel}
              accessibilityRole="button"
              onPress={closeOrderList}
              style={({ pressed }) => [local.orderCloseButton, pressed ? local.orderCloseButtonPressed : null]}
            >
              <Feather color={premiumColors.gold} name="x" size={22} />
            </Pressable>
          </View>

          <View style={local.orderScreenList}>
            {rows.map(({ label, item }) => (
              <View key={`${label}-${item.nameOriginal}`} style={local.orderScreenRow}>
                <Text style={local.orderLabel}>{label}:</Text>
                <Text style={local.orderName}>{item.nameOriginal}</Text>
                {item.priceText ? <Text style={local.orderMeta}>{item.priceText}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      </Modal>
    );
  }

  function renderNestedRecommendations(dishId: string, state: NestedRecommendationState, isPrimaryRecommendation: boolean) {
    if (state.status === "idle" || state.status === "loading") {
      return null;
    }

    if (state.status === "error") {
      return (
        <View style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}>
          <Text style={local.nestedResultTitle}>{content.recommendation.startersAndSaladsTitle}</Text>
          <Text style={local.nestedResultText}>{state.error ?? content.analysisErrors.generic}</Text>
        </View>
      );
    }

    const nestedResult = state.result;
    const nestedDishesById = new Map(nestedResult?.dishes.map((item) => [item.id, item]) ?? []);
    const nestedRecommendations = (nestedResult?.recommendations ?? [])
      .map((recommendation) => ({ recommendation, dish: nestedDishesById.get(recommendation.dishId) }))
      .filter((item): item is { recommendation: Recommendation; dish: Dish } => Boolean(item.dish));

    if (nestedRecommendations.length === 0) {
      return (
        <View style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}>
          <Text style={local.nestedResultTitle}>{content.recommendation.startersAndSaladsTitle}</Text>
          <Text style={local.nestedResultText}>{content.recommendation.startersAndSaladsEmpty}</Text>
        </View>
      );
    }

    return (
      <View style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}>
        <Text style={local.nestedResultTitle}>{content.recommendation.startersAndSaladsTitle}</Text>
        <View style={local.nestedResultList}>
          {nestedRecommendations.map(({ recommendation, dish }, nestedIndex) => {
            const nestedDish = dish as Dish & {
              name?: string;
              nameOriginal?: string;
              description?: string;
              price?: number;
            };
            const originalName = nestedDish.nameOriginal ?? nestedDish.name ?? content.recommendation.fallbackDishName;
            const translatedName = buildDisplayTranslation(originalName, recommendation.translatedName);
            const translatedDescription = visibleDescriptionForOutputLocale(
              recommendation.translatedDescription,
              outputLocale,
              nestedDish.description,
              recommendation.descriptionOriginal,
              nestedDish.descriptionOriginal
            );
            const priceText = formatDisplayPrice({
              missingPriceText: content.recommendation.missingPriceText,
              price: nestedDish.price,
              priceApproxDisplay: nestedDish.priceApproxDisplay ?? recommendation.priceApproxDisplay,
              priceDisplay: nestedDish.priceDisplay ?? recommendation.priceDisplay
            });
            const selectedStarter = selectedStarterByDishId[dishId];
            const isSelectedStarter = selectedStarter?.nameOriginal === originalName;

            return (
              <Pressable
                accessibilityRole="button"
                key={dish.id}
                onPress={() => selectStarterForOrder(dishId, {
                  nameOriginal: originalName,
                  priceText
                })}
                style={({ pressed }) => [
                  local.nestedResultItem,
                  local.selectableNestedResultItem,
                  isSelectedStarter ? local.selectedNestedResultItem : null,
                  pressed ? local.selectableNestedResultItemPressed : null
                ]}
              >
                <Text style={local.nestedResultRank}>{nestedIndex + 1}</Text>
                <View style={local.nestedResultCopy}>
                  <Text style={local.nestedDishName}>{originalName}</Text>
                  {translatedName ? <Text style={local.nestedDishMeta}>{translatedName}</Text> : null}
                  {translatedDescription && translatedDescription !== translatedName ? (
                    <Text style={local.nestedDishDescription}>{translatedDescription}</Text>
                  ) : null}
                  <Text style={local.nestedDishPrice}>{priceText}</Text>
                  {isSelectedStarter ? (
                    <Text style={local.selectedNestedResultText}>{content.recommendation.orderSelectedLabel}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
}

function logNestedAnalyzeDiag(fields: Record<string, string | number | boolean | undefined | null>) {
  if (!__DEV__) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_NESTED_ANALYZE_DIAG] ${payload}`);
}

function getErrorCauseMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("cause" in error)) {
    return "";
  }

  const cause = (error as { cause?: unknown }).cause;

  if (cause instanceof Error) {
    return `${cause.name}:${cause.message}`;
  }

  return typeof cause === "string" ? cause : "";
}

const local = StyleSheet.create({
  resultRoot: {
    position: "relative",
    paddingBottom: spacing.md
  },

  topBox: {
    backgroundColor: "rgba(255, 253, 248, 0.74)",
    borderColor: "rgba(200, 168, 90, 0.22)",
    borderWidth: 1,
    marginBottom: spacing.xxl,
    paddingHorizontal: 22,
    paddingRight: 22,
    paddingVertical: 20,
    position: "relative",
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.045,
    shadowRadius: 20,
    elevation: 1
  },

  topBoxAccent: {
    backgroundColor: premiumColors.gold,
    borderRadius: radius.pill,
    height: 2,
    marginBottom: spacing.md,
    opacity: 0.72,
    width: 40
  },

  restaurantIntroCloseButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    top: 14,
    width: 34
  },

  restaurantIntroCloseButtonPressed: {
    backgroundColor: "rgba(116, 109, 100, 0.10)",
    opacity: 0.82
  },

  unsafeBox: {
    marginBottom: spacing.md,
    padding: spacing.xxl
  },

  warningBox: {
    backgroundColor: semanticColors.warningSurface,
    borderColor: semanticColors.warningBorder,
    marginBottom: spacing.md,
    padding: spacing.lg
  },

  warningTitle: {
    color: semanticColors.warningText,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  warningText: {
    color: semanticColors.warningBody,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight
  },

  kicker: {
    color: premiumColors.bordeaux,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },

  title: {
    color: premiumColors.text,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 29,
    marginBottom: spacing.sm
  },

  subtitle: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 22
  },

  restaurantIntroText: {
    color: premiumColors.textMuted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 21,
    marginBottom: spacing.sm
  },

  restaurantIntroScroll: {
    maxHeight: 360
  },

  restaurantIntroTextBlock: {
    paddingBottom: 2
  },

  restaurantIntroTextLast: {
    marginBottom: 0
  },

  restaurantIntroStatusText: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: spacing.sm
  },

  list: {
    gap: spacing.xxl,
    marginBottom: spacing.section
  },

  card: {
    backgroundColor: premiumColors.surface,
    borderColor: "rgba(231, 222, 210, 0.72)",
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: 0,
    overflow: "hidden",
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.055,
    shadowRadius: 18
  },

  primaryCard: {
    backgroundColor: "#FFFDF8",
    borderColor: "rgba(200, 168, 90, 0.46)",
    borderRadius: radius.hero,
    flexDirection: "column",
    gap: spacing.lg,
    padding: 24,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 5
  },

  secondaryCard: {
    backgroundColor: "rgba(255, 253, 248, 0.88)",
    borderColor: "rgba(231, 222, 210, 0.72)",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.025,
    shadowRadius: 10,
    elevation: 1
  },

  rankBubble: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    height: 32,
    width: 32
  },

  rankBubblePrimary: {
    backgroundColor: premiumColors.olive,
    borderColor: premiumColors.olive,
    height: 48,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    width: 48
  },

  rankBubbleSecondary: {
    backgroundColor: "rgba(200, 168, 90, 0.10)",
    borderColor: "rgba(200, 168, 90, 0.26)"
  },

  rankText: {
    color: premiumColors.textMuted,
    fontSize: 15,
    fontWeight: "800"
  },

  rankTextPrimary: {
    color: premiumColors.surface,
    fontSize: 20,
    fontWeight: "900"
  },

  cardText: {
    flex: 1
  },

  cardTextPrimary: {
    paddingTop: spacing.xxs
  },

  dishName: {
    color: premiumColors.text,
    fontWeight: "900"
  },

  dishNamePrimary: {
    fontSize: 18,
    lineHeight: 23
  },

  dishNameSecondary: {
    fontSize: 18,
    lineHeight: 23
  },

  translation: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: spacing.xs,
    marginTop: spacing.xs
  },

  translationPrimary: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs
  },

  description: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
    marginBottom: spacing.xs
  },

  descriptionPrimary: {
    fontSize: 13,
    lineHeight: 19
  },

  price: {
    color: premiumColors.bordeaux,
    fontSize: 15,
    fontWeight: "900",
    marginTop: spacing.sm
  },

  pricePrimary: {
    color: premiumColors.gold,
    fontSize: 15,
    marginTop: spacing.sm
  },

  nestedActionBox: {
    marginTop: spacing.md
  },

  nestedLoadingBox: {
    borderRadius: radius.lg,
    marginBottom: 0,
    marginTop: spacing.md,
    padding: spacing.lg
  },

  nestedResultBox: {
    backgroundColor: "rgba(247, 241, 231, 0.52)",
    borderColor: "rgba(200, 168, 90, 0.24)",
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg
  },

  nestedResultBoxPrimary: {
    backgroundColor: "rgba(247, 241, 231, 0.68)",
    borderColor: "rgba(200, 168, 90, 0.34)"
  },

  nestedResultTitle: {
    color: premiumColors.olive,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
    marginBottom: spacing.sm
  },

  nestedResultText: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },

  nestedResultMeta: {
    color: premiumColors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginBottom: spacing.sm
  },

  nestedResultName: {
    color: premiumColors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
    marginBottom: spacing.xs
  },

  nestedResultEvidence: {
    color: premiumColors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: spacing.sm
  },

  wineMenuSearchBox: {
    gap: spacing.sm,
    marginTop: spacing.md
  },

  wineMenuNoMatchBox: {
    gap: spacing.sm,
    marginTop: spacing.xs
  },

  nestedResultList: {
    gap: spacing.md
  },

  nestedResultItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },

  selectableNestedResultItem: {
    borderColor: "rgba(200, 168, 90, 0.18)",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm
  },

  selectableNestedResultItemPressed: {
    opacity: 0.84
  },

  selectedNestedResultItem: {
    backgroundColor: "rgba(200, 168, 90, 0.1)",
    borderColor: "rgba(200, 168, 90, 0.48)"
  },

  nestedResultRank: {
    color: premiumColors.gold,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    minWidth: 18
  },

  nestedResultCopy: {
    flex: 1,
    minWidth: 0
  },

  nestedDishName: {
    color: premiumColors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19
  },

  nestedDishMeta: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: spacing.xxs
  },

  nestedDishDescription: {
    color: premiumColors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: spacing.xxs
  },

  nestedDishPrice: {
    color: premiumColors.bordeaux,
    fontSize: 13,
    fontWeight: "900",
    marginTop: spacing.xs
  },

  selectedNestedResultText: {
    color: premiumColors.olive,
    fontSize: 12,
    fontWeight: "900",
    marginTop: spacing.xs
  },

  orderScreen: {
    backgroundColor: "#FFFDF8",
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 58
  },

  orderScreenHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.xl
  },

  orderScreenTitle: {
    color: premiumColors.olive,
    flex: 1,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34
  },

  orderCloseButton: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "rgba(228, 212, 182, 0.78)",
    borderRadius: 18,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },

  orderCloseButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }]
  },

  orderScreenList: {
    gap: spacing.md
  },

  orderScreenRow: {
    backgroundColor: "rgba(250, 247, 241, 0.72)",
    borderColor: "rgba(200, 168, 90, 0.24)",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "column",
    gap: spacing.xs,
    padding: spacing.md
  },

  orderLabel: {
    color: premiumColors.textMuted,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23
  },

  orderName: {
    color: premiumColors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 27,
    flexShrink: 1,
    width: "100%"
  },

  orderMeta: {
    color: premiumColors.bordeaux,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: spacing.xs
  },

  premiumAction: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 15
  },

  premiumActionSecondary: {
    backgroundColor: "rgba(250, 247, 241, 0.62)",
    borderColor: "rgba(116, 109, 100, 0.18)"
  },

  premiumActionSecondaryHero: {
    backgroundColor: "rgba(231, 222, 210, 0.42)",
    marginTop: spacing.sm
  },

  premiumActionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  },

  premiumActionDisabled: {
    opacity: 0.48
  },

  premiumActionText: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  },

  premiumActionSecondaryText: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "800"
  },

  footerActions: {
    gap: 12,
    marginBottom: 16
  },

  footerPremiumButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.88)",
    borderColor: "#E4D4B6",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16
  },

  footerPremiumButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }]
  },

  footerPremiumIcon: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "rgba(228, 212, 182, 0.78)",
    borderRadius: 17,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },

  footerPremiumText: {
    color: premiumColors.olive,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
    textAlign: "center"
  }
});
