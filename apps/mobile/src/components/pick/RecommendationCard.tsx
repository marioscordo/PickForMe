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

function buildDisplayTranslation(originalName: string, translatedName?: string) {
  const cleaned = translatedName?.trim() ?? "";

  if (cleaned.length > 0 && cleaned.toLowerCase() !== originalName.toLowerCase()) {
    return cleaned;
  }

  return "";
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
          const starterRequestStatus = starterRequestStatusByDishId[rec.dishId];
          const shouldShowStarterButton = situation !== "leicht" && !starter;
          const isPrimaryRecommendation = index === 0;

          const priceText = typeof dishData.price === "number" ? `${dishData.price.toFixed(2).replace(".", ",")} €` : "";
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

                {rec.facts?.trim() ? (
                  <View style={[local.factsBox, isPrimaryRecommendation ? local.factsBoxPrimary : local.factsBoxSecondary]}>
                    <Text style={[local.factsText, isPrimaryRecommendation && local.factsTextPrimary]}>{rec.facts.trim()}</Text>
                  </View>
                ) : null}

                {starter ? (
                  <View style={[local.starterBox, isPrimaryRecommendation ? local.starterBoxPrimary : local.starterBoxSecondary]}>
                    <Text style={local.starterLabel}>{content.recommendation.starterLabel}</Text>
                    <Text style={local.starterName}>{starter.nameOriginal}</Text>
                    {starterTranslation ? (
                      <Text style={local.starterTranslation}>{starterTranslation}</Text>
                    ) : null}
                    {starter.priceRaw ? (
                      <Text style={local.starterPrice}>{starter.priceRaw}</Text>
                    ) : null}
                  </View>
                ) : null}

                {shouldShowStarterButton ? (
                  <View style={local.starterActionBox}>
                    {starterRequestStatus === "error" ? (
                      <Text style={local.starterActionText}>{content.recommendation.starterSearchError}</Text>
                    ) : null}
                    <ActionButton
                      disabled={isStarterSearchRunning}
                      label={
                        starterRequestStatus === "loading"
                          ? content.recommendation.starterSearchLoading
                          : content.recommendation.starterSearchButton
                      }
                      variant="secondary"
                      onPress={() => handleStarterSearch(rec)}
                      style={[local.starterActionButton, isPrimaryRecommendation && local.primaryInlineAction]}
                    />
                  </View>
                ) : null}

                <ActionButton
                  label={content.recommendation.acceptButton}
                  variant="secondary"
                  onPress={() => setSelectedDishId(dish.id)}
                  style={[local.acceptButton, isPrimaryRecommendation && local.acceptButtonPrimary]}
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
    position: "relative"
  },

  topBox: {
    backgroundColor: premiumColors.surface,
    borderColor: "rgba(200, 168, 90, 0.34)",
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.xxl,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 2
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
    fontSize: typography.screenTitle.fontSize,
    fontWeight: "800",
    lineHeight: typography.screenTitle.lineHeight,
    marginBottom: spacing.xs
  },

  subtitle: {
    color: premiumColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    lineHeight: typography.body.lineHeight
  },

  list: {
    gap: spacing.lg,
    marginBottom: spacing.lg
  },

  card: {
    backgroundColor: premiumColors.surface,
    borderColor: "rgba(231, 222, 210, 0.78)",
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: 0,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18
  },

  primaryCard: {
    borderColor: "rgba(200, 168, 90, 0.38)",
    borderRadius: radius.hero,
    flexDirection: "column",
    padding: 24,
    shadowOpacity: 0.13,
    shadowRadius: 26,
    elevation: 4
  },

  secondaryCard: {
    borderColor: "rgba(231, 222, 210, 0.82)",
    borderRadius: radius.xl,
    flexDirection: "row",
    padding: spacing.lg,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1
  },

  rankBubble: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    height: 34,
    width: 34
  },

  rankBubblePrimary: {
    backgroundColor: premiumColors.olive,
    borderColor: premiumColors.olive,
    height: 40,
    width: 40
  },

  rankBubbleSecondary: {
    backgroundColor: "rgba(200, 168, 90, 0.13)",
    borderColor: "rgba(200, 168, 90, 0.35)"
  },

  rankText: {
    color: premiumColors.text,
    fontSize: 16,
    fontWeight: "800"
  },

  rankTextPrimary: {
    color: premiumColors.surface
  },

  cardText: {
    flex: 1
  },

  cardTextPrimary: {
    paddingTop: spacing.xs
  },

  dishName: {
    color: premiumColors.text,
    fontWeight: "800"
  },

  dishNamePrimary: {
    fontSize: 26,
    lineHeight: 31
  },

  dishNameSecondary: {
    fontSize: 17,
    lineHeight: 22
  },

  translation: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    marginBottom: spacing.xs,
    marginTop: spacing.xxs
  },

  translationPrimary: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: spacing.xs
  },

  price: {
    color: premiumColors.bordeaux,
    fontSize: 15,
    fontWeight: "800",
    marginTop: spacing.xxs
  },

  pricePrimary: {
    color: premiumColors.gold,
    fontSize: 17,
    marginTop: spacing.sm
  },

  factsBox: {
    marginTop: spacing.sm,
    padding: spacing.md
  },

  factsBoxPrimary: {
    backgroundColor: "transparent",
    borderColor: premiumColors.border,
    borderRadius: 0,
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: spacing.lg
  },

  factsBoxSecondary: {
    backgroundColor: "transparent",
    borderColor: premiumColors.border,
    borderRadius: 0,
    borderTopWidth: 1,
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: spacing.md
  },

  factsText: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20
  },

  factsTextPrimary: {
    color: premiumColors.text,
    fontSize: 15,
    lineHeight: 23
  },

  starterBox: {
    borderRadius: radius.md,
    marginTop: spacing.sm,
    padding: spacing.md
  },

  starterBoxPrimary: {
    backgroundColor: "rgba(38, 54, 37, 0.06)",
    borderColor: "rgba(38, 54, 37, 0.12)",
    borderWidth: 1,
    marginTop: spacing.lg
  },

  starterBoxSecondary: {
    backgroundColor: "rgba(250, 247, 241, 0.82)",
    borderWidth: 0
  },

  starterLabel: {
    color: premiumColors.bordeaux,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginBottom: spacing.xxs,
    textTransform: "uppercase"
  },

  starterName: {
    color: premiumColors.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },

  starterTranslation: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: spacing.xxs
  },

  starterPrice: {
    color: premiumColors.bordeaux,
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.xxs
  },

  starterActionBox: {
    marginTop: spacing.md
  },

  starterActionText: {
    color: premiumColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.sm
  },

  starterActionButton: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md
  },

  primaryInlineAction: {
    backgroundColor: "rgba(231, 222, 210, 0.68)"
  },

  acceptButton: {
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingVertical: spacing.md
  },

  acceptButtonPrimary: {
    backgroundColor: "rgba(200, 168, 90, 0.22)",
    marginTop: spacing.lg
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
