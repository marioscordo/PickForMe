import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useProfile } from "../../app/providers/ProfileProvider";
import { PickForMeApiError } from "../../api/apiClient";
import { requestRestaurantIntro, requestStarterPairings } from "../../api/pickformeApi";
import { DEFAULT_OUTPUT_LOCALE } from "../../config/outputLocales";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, semanticColors, spacing, typography } from "../../theme/tokens";
import type { Dish } from "../../types/menu";
import type { Situation } from "../../types/profile";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";
import { Surface } from "../ui/Surface";

type RecommendationFeedback = {
  dishNameOriginal: string;
  translatedName?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  accepted: boolean;
  createdAt: string;
};

type ProfileWithFeedback = {
  recommendationFeedback?: RecommendationFeedback[];
};

type StarterRequestStatus = "loading" | "error" | "empty" | "retryable" | "dismissed";
type RestaurantIntroStatus = "idle" | "loading" | "loaded" | "error";
type PremiumActionTone = "primary" | "secondary";

function buildDisplayTranslation(originalName: string, translatedName?: string) {
  const cleaned = translatedName?.trim() ?? "";

  if (cleaned.length > 0 && cleaned.toLowerCase() !== originalName.toLowerCase()) {
    return cleaned;
  }

  return "";
}

function formatEuroPrice(price: number) {
  return `${price.toFixed(2).replace(".", ",")} €`;
}

function formatDisplayPrice(rawPrice?: string | null) {
  const cleaned = rawPrice?.trim() ?? "";

  if (!cleaned || isTechnicalPricePlaceholder(cleaned)) {
    return "";
  }

  if (/€|\bEUR\b/i.test(cleaned)) {
    return cleaned.replace(/\s*€\s*/g, " €").replace(/\s+/g, " ").trim();
  }

  if (/^\d{1,4}(?:[.,]\d{1,2})?$/.test(cleaned)) {
    return `${cleaned.replace(".", ",")} €`;
  }

  return cleaned;
}

function isTechnicalPricePlaceholder(value: string) {
  return /^(?:null|undefined|n\/a|nan)$/i.test(value.trim());
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
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        local.premiumAction,
        tone === "primary" ? local.premiumActionPrimary : local.premiumActionSecondary,
        hero && tone === "primary" ? local.premiumActionPrimaryHero : null,
        hero && tone === "secondary" ? local.premiumActionSecondaryHero : null,
        state.pressed && !disabled ? local.premiumActionPressed : null,
        disabled ? local.premiumActionDisabled : null
      ]}
    >
      <Text
        style={[
          local.premiumActionText,
          tone === "primary" ? local.premiumActionPrimaryText : local.premiumActionSecondaryText
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
  situation,
  onReset,
  openMenuLabel,
  onOpenMenu
}: {
  result: AnalyzeData;
  menuText: string;
  situation: Situation;
  onReset: () => void;
  openMenuLabel?: string;
  onOpenMenu?: () => void;
}) {
  const content = useMobileContent();
  const { profile, setProfile } = useProfile();
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);
  const [recommendationsWithStarters, setRecommendationsWithStarters] = useState<Recommendation[] | null>(null);
  const [starterRequestStatusByDishId, setStarterRequestStatusByDishId] = useState<Record<string, StarterRequestStatus>>({});
  const [restaurantIntroStatus, setRestaurantIntroStatus] = useState<RestaurantIntroStatus>("idle");
  const [restaurantIntroText, setRestaurantIntroText] = useState("");
  const [restaurantIntroVisible, setRestaurantIntroVisible] = useState(false);

  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);
  const visibleRecommendations = recommendationsWithStarters ?? result.recommendations;

  const safeRecommendations = visibleRecommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));
  const isStarterSearchRunning = Object.values(starterRequestStatusByDishId).some((status) => status === "loading");
  const restaurantIntroLocale = profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE;
  const cachedRestaurantIntro = restaurantIntroText.trim();
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
        <Text style={local.restaurantIntroText}>{cachedRestaurantIntro}</Text>
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
  const analysisWarning = result.analysisWarning?.trim() ?? "";
  const warningBox = analysisWarning ? (
    <Surface tone="soft" style={local.warningBox}>
      <Text style={local.warningTitle}>{content.recommendation.warningTitle}</Text>
      <Text style={local.warningText}>{analysisWarning}</Text>
    </Surface>
  ) : null;

  const feedbackByName = new Map(
    (((profile as ProfileWithFeedback).recommendationFeedback ?? []) as RecommendationFeedback[]).map((item) => [
      item.dishNameOriginal.toLowerCase(),
      item
    ])
  );

  useEffect(() => {
    setRecommendationsWithStarters(null);
    setStarterRequestStatusByDishId({});
    setRestaurantIntroStatus("idle");
    setRestaurantIntroText("");
    setRestaurantIntroVisible(false);
  }, [restaurantIntroLocale, result]);

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

    try {
      const data = await requestRestaurantIntro({
        menuText,
        profile
      });
      const nextText = data.introText.trim();

      if (!nextText) {
        setRestaurantIntroStatus("error");
        return;
      }

      setRestaurantIntroText(nextText);
      setRestaurantIntroVisible(true);
      setRestaurantIntroStatus("loaded");
    } catch {
      setRestaurantIntroStatus("error");
    }
  }

  function closeRestaurantIntro() {
    setRestaurantIntroVisible(false);
    setRestaurantIntroStatus("idle");
  }

  async function handleStarterSearch(recommendation: Recommendation) {
    if (isStarterSearchRunning) {
      return;
    }

    setStarterRequestStatusByDishId((current) => ({
      ...current,
      [recommendation.dishId]: "loading"
    }));

    try {
      const data = await requestStarterPairings({
        menuText,
        situation,
        profile,
        targetDishId: recommendation.dishId,
        result: {
          ...result,
          recommendations: visibleRecommendations
        }
      });

      if (data.starterRetryableError) {
        setStarterRequestStatusByDishId((current) => ({
          ...current,
          [recommendation.dishId]: "retryable"
        }));
        return;
      }

      const updatedRecommendation = data.recommendations.find((item) => item.dishId === recommendation.dishId);

      if (!updatedRecommendation?.starter) {
        setStarterRequestStatusByDishId((current) => ({
          ...current,
          [recommendation.dishId]: "empty"
        }));
        return;
      }

      setRecommendationsWithStarters((current) =>
        (current ?? result.recommendations).map((item) =>
          item.dishId === recommendation.dishId
            ? {
                ...item,
                starter: updatedRecommendation.starter
              }
            : item
        )
      );
      setStarterRequestStatusByDishId((current) => {
        const next = { ...current };
        delete next[recommendation.dishId];
        return next;
      });
    } catch (error) {
      setStarterRequestStatusByDishId((current) => ({
        ...current,
        [recommendation.dishId]: isRetryableStarterError(error) ? "retryable" : "error"
      }));
    }
  }

  function dismissStarterRetry(dishId: string) {
    setStarterRequestStatusByDishId((current) => ({
      ...current,
      [dishId]: "dismissed"
    }));
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

  function saveRating(originalName: string, translatedName: string | undefined, rating: 1 | 2 | 3 | 4 | 5) {
    const nextItem: RecommendationFeedback = {
      dishNameOriginal: originalName,
      translatedName,
      rating,
      accepted: true,
      createdAt: new Date().toISOString()
    };

    const existing = ((profile as ProfileWithFeedback).recommendationFeedback ?? []) as RecommendationFeedback[];
    const withoutSameDish = existing.filter(
      (item) => item.dishNameOriginal.toLowerCase() !== originalName.toLowerCase()
    );

    setProfile({
      ...profile,
      recommendationFeedback: [...withoutSameDish, nextItem].slice(-30)
    } as typeof profile);
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
            price?: number;
          };

          const originalName = dishData.nameOriginal ?? dishData.name ?? content.recommendation.fallbackDishName;
          const translatedName = buildDisplayTranslation(originalName, rec.translatedName);
          const showTranslation = translatedName.length > 0;
          const starter = rec.starter;
          const starterTranslation = starter
            ? buildDisplayTranslation(starter.nameOriginal, starter.translatedName)
            : "";
          const starterPriceText = starter ? formatDisplayPrice(starter.priceRaw) : "";
          const starterRequestStatus = starterRequestStatusByDishId[rec.dishId];
          const shouldShowStarterButton = situation !== "leicht" &&
            !starter &&
            starterRequestStatus !== "empty" &&
            starterRequestStatus !== "retryable" &&
            starterRequestStatus !== "dismissed";
          const shouldShowStarterAction = shouldShowStarterButton ||
            starterRequestStatus === "empty" ||
            starterRequestStatus === "retryable";
          const isPrimaryRecommendation = index === 0;

          const priceText = typeof dishData.price === "number" ? formatEuroPrice(dishData.price) : "";
          const existingFeedback = feedbackByName.get(originalName.toLowerCase());
          const isSelected = selectedDishId === dish.id || Boolean(existingFeedback);

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

                {priceText ? <Text style={[local.price, isPrimaryRecommendation && local.pricePrimary]}>{priceText}</Text> : null}

                {starter ? (
                  <View style={[local.starterBox, isPrimaryRecommendation ? local.starterBoxPrimary : local.starterBoxSecondary]}>
                    <Text style={local.starterLabel}>{content.recommendation.starterLabel}</Text>
                    <Text style={local.starterName}>{starter.nameOriginal}</Text>
                    {starterTranslation ? (
                      <Text style={local.starterTranslation}>{starterTranslation}</Text>
                    ) : null}
                    {starterPriceText ? (
                      <Text style={local.starterPrice}>{starterPriceText}</Text>
                    ) : null}
                  </View>
                ) : null}

                {shouldShowStarterAction ? (
                  <View style={local.starterActionBox}>
                    {starterRequestStatus === "error" ? (
                      <Text style={local.starterActionText}>{content.recommendation.starterSearchError}</Text>
                    ) : null}
                    {starterRequestStatus === "empty" ? (
                      <View style={local.starterEmptyHintBox}>
                        <Text style={local.starterActionText}>{content.recommendation.starterSearchEmpty}</Text>
                      </View>
                    ) : null}
                    {starterRequestStatus === "retryable" ? (
                      <View style={local.starterRetryBox}>
                        <Text style={local.starterActionText}>{content.recommendation.starterRetryText}</Text>
                        <PremiumCardAction
                          disabled={isStarterSearchRunning}
                          label={content.recommendation.starterRetryYes}
                          onPress={() => handleStarterSearch(rec)}
                          tone="secondary"
                          hero={isPrimaryRecommendation}
                        />
                        <PremiumCardAction
                          disabled={isStarterSearchRunning}
                          label={content.recommendation.starterRetryNo}
                          onPress={() => dismissStarterRetry(rec.dishId)}
                          tone="secondary"
                          hero={isPrimaryRecommendation}
                        />
                      </View>
                    ) : null}
                    {shouldShowStarterButton ? (
                      <PremiumCardAction
                        disabled={isStarterSearchRunning}
                        label={
                          starterRequestStatus === "loading"
                            ? content.recommendation.starterSearchLoading
                            : content.recommendation.starterSearchButton
                        }
                        onPress={() => handleStarterSearch(rec)}
                        tone="secondary"
                        hero={isPrimaryRecommendation}
                      />
                    ) : null}
                  </View>
                ) : null}

                <PremiumCardAction
                  label={content.recommendation.acceptButton}
                  onPress={() => setSelectedDishId(dish.id)}
                  tone="primary"
                  hero={isPrimaryRecommendation}
                />

                {isSelected ? (
                  <View style={[local.ratingBox, isPrimaryRecommendation && local.ratingBoxPrimary]}>
                    <Text style={local.ratingTitle}>{content.recommendation.ratingTitle}</Text>

                    <View style={local.starRow}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const active = existingFeedback ? star <= existingFeedback.rating : false;

                        return (
                          <Pressable
                            key={star}
                            onPress={() =>
                              saveRating(originalName, showTranslation ? translatedName : undefined, star as 1 | 2 | 3 | 4 | 5)
                            }
                          >
                            <Text style={[local.star, active && local.starActive]}>
                              {active ? "★" : "☆"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {existingFeedback ? (
                      <Text style={local.savedText}>
                        {formatContent(content.recommendation.savedText, { rating: existingFeedback.rating })}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Surface>
          );
        })}
      </View>

      {renderFooterActions()}
    </View>
  );
}

function isRetryableStarterError(error: unknown) {
  return error instanceof PickForMeApiError &&
    (error.code === "TEMPORARY_AI_ERROR" ||
      error.code === "AI_RATE_LIMIT" ||
      error.code === "STARTER_PAIRING_TIMEOUT" ||
      error.code === "STARTER_PAIRING_UNAVAILABLE");
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
    paddingRight: 54,
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
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 23
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

  starterBox: {
    backgroundColor: "transparent",
    borderRadius: 0,
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.lg
  },

  starterBoxPrimary: {
    borderColor: "rgba(200, 168, 90, 0.32)",
    marginTop: spacing.lg
  },

  starterBoxSecondary: {
    borderColor: "rgba(231, 222, 210, 0.68)",
    marginTop: spacing.md
  },

  starterLabel: {
    color: premiumColors.olive,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginBottom: spacing.sm
  },

  starterName: {
    color: premiumColors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21
  },

  starterTranslation: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: spacing.xxs
  },

  starterPrice: {
    color: premiumColors.gold,
    fontSize: 15,
    fontWeight: "900",
    marginTop: spacing.sm
  },

  starterActionBox: {
    marginTop: spacing.lg
  },

  starterEmptyHintBox: {
    paddingBottom: spacing.sm
  },

  starterRetryBox: {
    paddingBottom: spacing.sm
  },

  starterActionText: {
    color: premiumColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.sm
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

  premiumActionPrimary: {
    backgroundColor: premiumColors.olive,
    borderColor: premiumColors.olive,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14
  },

  premiumActionPrimaryHero: {
    marginTop: spacing.lg,
    paddingVertical: 17
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

  premiumActionPrimaryText: {
    color: premiumColors.surface
  },

  premiumActionSecondaryText: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "800"
  },

  ratingBox: {
    backgroundColor: "rgba(250, 247, 241, 0.86)",
    borderColor: premiumColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md
  },

  ratingBoxPrimary: {
    borderColor: "rgba(200, 168, 90, 0.32)"
  },

  ratingTitle: {
    color: premiumColors.text,
    fontSize: typography.label.fontSize,
    fontWeight: "800",
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  starRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs
  },

  star: {
    color: premiumColors.textMuted,
    fontSize: 28,
    fontWeight: "800"
  },

  starActive: {
    color: premiumColors.gold
  },

  savedText: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
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
