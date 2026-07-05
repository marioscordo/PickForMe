import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useProfile } from "../../app/providers/ProfileProvider";
import { requestStarterPairings } from "../../api/pickformeApi";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, semanticColors, spacing, typography } from "../../theme/tokens";
import type { Dish } from "../../types/menu";
import type { Situation } from "../../types/profile";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";
import { ActionButton } from "../ui/ActionButton";
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

type StarterRequestStatus = "loading" | "error";
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

function formatDisplayPrice(rawPrice?: string) {
  const cleaned = rawPrice?.trim() ?? "";

  if (!cleaned) {
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

export function RecommendationCard({
  result,
  menuText,
  situation,
  onReset
}: {
  result: AnalyzeData;
  menuText: string;
  situation: Situation;
  onReset: () => void;
}) {
  const content = useMobileContent();
  const { profile, setProfile } = useProfile();
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);
  const [recommendationsWithStarters, setRecommendationsWithStarters] = useState<Recommendation[] | null>(null);
  const [starterRequestStatusByDishId, setStarterRequestStatusByDishId] = useState<Record<string, StarterRequestStatus>>({});

  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);
  const visibleRecommendations = recommendationsWithStarters ?? result.recommendations;

  const safeRecommendations = visibleRecommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));
  const isStarterSearchRunning = Object.values(starterRequestStatusByDishId).some((status) => status === "loading");
  const restaurantDescription = result.restaurantDescription?.trim() ?? "";
  const topBoxTitle = restaurantDescription ? content.recommendation.restaurantTitle : content.recommendation.fallbackTitle;
  const topBoxText = restaurantDescription || content.recommendation.fallbackText;
  const topBox = (
    <Surface style={local.topBox}>
      <View style={local.topBoxAccent} />
      <Text style={local.title}>{topBoxTitle}</Text>
      <Text style={local.subtitle}>{topBoxText}</Text>
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
  }, [result]);

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
      const updatedRecommendation = data.recommendations.find((item) => item.dishId === recommendation.dishId);

      if (!updatedRecommendation?.starter) {
        throw new Error("STARTER_NOT_FOUND");
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
    } catch {
      setStarterRequestStatusByDishId((current) => ({
        ...current,
        [recommendation.dishId]: "error"
      }));
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

        <ActionButton label={content.recommendation.resetButton} variant="accent" onPress={onReset} style={local.resetButton} />
      </>
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
          const shouldShowStarterButton = situation !== "leicht" && !starter;
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

                {shouldShowStarterButton ? (
                  <View style={local.starterActionBox}>
                    {starterRequestStatus === "error" ? (
                      <Text style={local.starterActionText}>{content.recommendation.starterSearchError}</Text>
                    ) : null}
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

      <ActionButton label={content.recommendation.resetButton} variant="accent" onPress={onReset} style={local.resetButton} />
    </View>
  );
}

const local = StyleSheet.create({
  resultRoot: {
    position: "relative",
    paddingBottom: 112
  },

  topBox: {
    backgroundColor: "rgba(255, 253, 248, 0.74)",
    borderColor: "rgba(200, 168, 90, 0.22)",
    borderWidth: 1,
    marginBottom: spacing.xxl,
    paddingHorizontal: 22,
    paddingVertical: 20,
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
    fontSize: 30,
    lineHeight: 36
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
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm
  },

  price: {
    color: premiumColors.bordeaux,
    fontSize: 15,
    fontWeight: "900",
    marginTop: spacing.sm
  },

  pricePrimary: {
    color: premiumColors.gold,
    fontSize: 21,
    marginTop: spacing.md
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

  resetButton: {
    borderRadius: radius.pill,
    marginBottom: 20
  }
});
