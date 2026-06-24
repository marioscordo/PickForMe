import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useProfile } from "../../app/providers/ProfileProvider";
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

  const fallback = originalName
    .replace(/\bHimali\b/gi, "Himalaya")
    .replace(/\bChicken\b/gi, "H\u00fchnchen")
    .replace(/\bBeef\b/gi, "Rindfleisch")
    .replace(/\bLamb\b/gi, "Lamm")
    .replace(/\bPork\b/gi, "Schwein")
    .replace(/\bFish\b/gi, "Fisch")
    .replace(/\bSalmon\b/gi, "Lachs")
    .replace(/\bTuna\b/gi, "Thunfisch")
    .replace(/\bShrimp\b/gi, "Garnelen")
    .replace(/\bPrawns\b/gi, "Garnelen");

  return fallback.toLowerCase() !== originalName.toLowerCase() ? fallback : "";
}
export function RecommendationCard({
  result,
  onReset
}: {
  result: AnalyzeData;
  onReset: () => void;
}) {
  const { profile, setProfile } = useProfile();
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);

  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);

  const safeRecommendations = result.recommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));

  const feedbackByName = new Map(
    (((profile as ProfileWithFeedback).recommendationFeedback ?? []) as RecommendationFeedback[]).map((item) => [
      item.dishNameOriginal.toLowerCase(),
      item
    ])
  );

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
      <View style={local.hero}>
        <Text style={local.kicker}>PickForMe empfiehlt</Text>
        <Text style={local.title}>Das passt zu Dir</Text>
        <Text style={local.subtitle}>
          {"Aus der Speisekarte ausgewählt und mit Deinem Profil abgeglichen."}
        </Text>
      </View>

      <View style={local.list}>
        {safeRecommendations.map(({ rec, dish }, index) => {
          const dishData = dish as Dish & {
            name?: string;
            nameOriginal?: string;
            price?: number;
          };

          const originalName = dishData.nameOriginal ?? dishData.name ?? "Gericht";
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

                <Text style={local.reason}>{rec.reason}</Text>

                <Pressable style={local.acceptButton} onPress={() => setSelectedDishId(dish.id)}>
                  <Text style={local.acceptButtonText}>Das nehme ich</Text>
                </Pressable>

                {isSelected ? (
                  <View style={local.ratingBox}>
                    <Text style={local.ratingTitle}>Wie gut passt diese Empfehlung?</Text>

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
                        {`Gespeichert: ${existingFeedback.rating} von 5 Sternen für Dein persönliches Ranking.`}
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
        <Text style={local.resetButtonText}>Neue Speisekarte prüfen</Text>
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
    fontSize: 30,
    lineHeight: 34,
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
    fontSize: 20,
    lineHeight: 24,
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

  reason: {
    color: "#172033",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    marginTop: 9,
    backgroundColor: "#F3F0FA",
    borderRadius: 14,
    padding: 10
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
    fontSize: 14,
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

