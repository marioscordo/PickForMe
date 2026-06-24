import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Dish } from "../../types/menu";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";

export function RecommendationCard({
  result,
  onReset
}: {
  result: AnalyzeData;
  onReset: () => void;
}) {
  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);

  const safeRecommendations = result.recommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));

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
            description?: string;
            descriptionOriginal?: string;
            price?: number;
            sourceLine?: string;
          };

          const originalName = dishData.nameOriginal ?? dishData.name ?? "Gericht";
          const translatedName = rec.translatedName?.trim();
          const showTranslation =
            translatedName &&
            translatedName.length > 0 &&
            translatedName.toLowerCase() !== originalName.toLowerCase();

          const description = dishData.descriptionOriginal ?? dishData.description ?? dishData.sourceLine;
          const priceText = typeof dishData.price === "number" ? `${dishData.price.toFixed(2).replace(".", ",")} €` : "";

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

                {description ? <Text style={local.description}>{description}</Text> : null}

                {priceText ? <Text style={local.price}>{priceText}</Text> : null}

                <Text style={local.reason}>{rec.reason}</Text>
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

  description: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 7
  },

  price: {
    color: "#285C55",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 7
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
