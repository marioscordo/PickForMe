import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useProfile } from "../../app/providers/ProfileProvider";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";
import type { Dish } from "../../types/menu";
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

function buildDisplayTranslation(originalName: string, translatedName?: string) {
  const cleaned = translatedName?.trim() ?? "";

  if (cleaned.length > 0 && cleaned.toLowerCase() !== originalName.toLowerCase()) {
    return cleaned;
  }

  return "";
}

export function RecommendationCard({
  result,
  onReset
}: {
  result: AnalyzeData;
  onReset: () => void;
}) {
  const content = useMobileContent();
  const { profile, setProfile } = useProfile();
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);

  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);

  const safeRecommendations = result.recommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));
  const restaurantDescription = result.restaurantDescription?.trim() ?? "";
  const topBoxTitle = restaurantDescription ? content.recommendation.restaurantTitle : content.recommendation.fallbackTitle;
  const topBoxText = restaurantDescription || content.recommendation.fallbackText;
  const topBox = (
    <Surface style={local.topBox}>
      <Text style={local.title}>{topBoxTitle}</Text>
      <Text style={local.subtitle}>{topBoxText}</Text>
    </Surface>
  );

  const feedbackByName = new Map(
    (((profile as ProfileWithFeedback).recommendationFeedback ?? []) as RecommendationFeedback[]).map((item) => [
      item.dishNameOriginal.toLowerCase(),
      item
    ])
  );

  if (safeRecommendations.length === 0) {
    return (
      <>
        {topBox}

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
    <>
      {topBox}

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

          const priceText = typeof dishData.price === "number" ? `${dishData.price.toFixed(2).replace(".", ",")} €` : "";
          const existingFeedback = feedbackByName.get(originalName.toLowerCase());
          const isSelected = selectedDishId === dish.id || Boolean(existingFeedback);

          return (
            <Surface key={dish.id} style={local.card}>
              <View style={local.rankBubble}>
                <Text style={local.rankText}>{index + 1}</Text>
              </View>

              <View style={local.cardText}>
                <Text style={local.dishName}>{originalName}</Text>

                {showTranslation ? (
                  <Text style={local.translation}>{translatedName}</Text>
                ) : null}

                {priceText ? <Text style={local.price}>{priceText}</Text> : null}

                {rec.facts?.trim() ? (
                  <View style={local.factsBox}>
                    <Text style={local.factsText}>{rec.facts.trim()}</Text>
                  </View>
                ) : null}

                <ActionButton
                  label={content.recommendation.acceptButton}
                  variant="secondary"
                  onPress={() => setSelectedDishId(dish.id)}
                  style={local.acceptButton}
                />

                {isSelected ? (
                  <View style={local.ratingBox}>
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
    </>
  );
}

const local = StyleSheet.create({
  topBox: {
    backgroundColor: semanticColors.accentSoft,
    borderColor: semanticColors.accent,
    marginBottom: spacing.md,
    padding: spacing.xxl
  },

  unsafeBox: {
    marginBottom: spacing.md,
    padding: spacing.xxl
  },

  kicker: {
    color: semanticColors.textMuted,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },

  title: {
    color: semanticColors.text,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    lineHeight: typography.screenTitle.lineHeight,
    marginBottom: spacing.xs
  },

  subtitle: {
    color: semanticColors.text,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight
  },

  list: {
    gap: spacing.md,
    marginBottom: spacing.lg
  },

  card: {
    borderColor: semanticColors.border,
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: 0,
    padding: spacing.lg
  },

  rankBubble: {
    alignItems: "center",
    backgroundColor: semanticColors.accentSoft,
    borderColor: semanticColors.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },

  rankText: {
    color: semanticColors.text,
    fontSize: 16,
    fontWeight: "900"
  },

  cardText: {
    flex: 1
  },

  dishName: {
    color: semanticColors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },

  translation: {
    color: semanticColors.textMuted,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginBottom: spacing.xs,
    marginTop: spacing.xxs
  },

  price: {
    color: semanticColors.success,
    fontSize: 15,
    fontWeight: "900",
    marginTop: spacing.xxs
  },

  factsBox: {
    backgroundColor: semanticColors.primarySoft,
    borderColor: semanticColors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md
  },

  sectionLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },

  factsText: {
    color: semanticColors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },

  acceptButton: {
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingVertical: spacing.md
  },

  ratingBox: {
    backgroundColor: semanticColors.primarySoft,
    borderColor: semanticColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md
  },

  ratingTitle: {
    color: semanticColors.text,
    fontSize: typography.label.fontSize,
    fontWeight: "900",
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  starRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs
  },

  star: {
    color: semanticColors.textMuted,
    fontSize: 28,
    fontWeight: "900"
  },

  starActive: {
    color: semanticColors.accent
  },

  savedText: {
    color: semanticColors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },

  resetButton: {
    borderRadius: radius.pill,
    marginBottom: 20
  }
});
