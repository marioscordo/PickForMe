import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useProfile } from "../../app/providers/ProfileProvider";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import type { Dish } from "../../types/menu";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";

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
    <View style={local.hero}>
      <Text style={local.title}>{topBoxTitle}</Text>
      <Text style={local.subtitle}>{topBoxText}</Text>
    </View>
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

        <View style={local.hero}>
          <Text style={local.kicker}>{content.recommendation.unsafeKicker}</Text>
          <Text style={local.title}>{content.recommendation.unsafeTitle}</Text>
          <Text style={local.subtitle}>
            {content.recommendation.unsafeText}
          </Text>
        </View>

        <Pressable style={local.resetButton} onPress={onReset}>
          <Text style={local.resetButtonText}>{content.recommendation.resetButton}</Text>
        </Pressable>
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
            <View key={dish.id} style={local.card}>
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

                <Pressable style={local.acceptButton} onPress={() => setSelectedDishId(dish.id)}>
                  <Text style={local.acceptButtonText}>{content.recommendation.acceptButton}</Text>
                </Pressable>

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
            </View>
          );
        })}
      </View>

      <Pressable style={local.resetButton} onPress={onReset}>
        <Text style={local.resetButtonText}>{content.recommendation.resetButton}</Text>
      </Pressable>
    </>
  );
}

const local = StyleSheet.create({
  hero: {
    backgroundColor: "#DCEBF7",
    borderRadius: 26,
    padding: 18,
    marginBottom: 12
  },

  kicker: {
    color: "#4B6B88",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8
  },

  title: {
    color: "#132238",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    marginBottom: 6
  },

  subtitle: {
    color: "#334155",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700"
  },

  list: {
    gap: 12,
    marginBottom: 14
  },

  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: "#D8CFF0"
  },

  rankBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F3F1",
    borderWidth: 1,
    borderColor: "#B7D9CD"
  },

  rankText: {
    color: "#285C55",
    fontWeight: "900",
    fontSize: 16
  },

  cardText: {
    flex: 1
  },

  dishName: {
    color: "#111827",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900"
  },

  translation: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    marginTop: 3,
    marginBottom: 6
  },

  price: {
    color: "#285C55",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4
  },

  factsBox: {
    marginTop: 9,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0"
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
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700"
  },

  acceptButton: {
    marginTop: 10,
    backgroundColor: "#E8F3F1",
    borderColor: "#B7D9CD",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center"
  },

  acceptButtonText: {
    color: "#285C55",
    fontSize: 15,
    fontWeight: "900"
  },

  ratingBox: {
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },

  ratingTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6
  },

  starRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6
  },

  star: {
    color: "#94A3B8",
    fontSize: 28,
    fontWeight: "900"
  },

  starActive: {
    color: "#8FB9B4"
  },

  savedText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700"
  },

  resetButton: {
    backgroundColor: "#8FB9B4",
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 20
  },

  resetButtonText: {
    color: "#102A2A",
    fontSize: 16,
    fontWeight: "900"
  }
});
