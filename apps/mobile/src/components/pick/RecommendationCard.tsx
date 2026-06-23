import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, styles } from "../../theme/styles";
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
      <Text style={styles.title}>PickForMe empfiehlt:</Text>
      <Text style={styles.subtitle}>
        Ich habe Dir 3 passende Empfehlungen aus der Speisekarte ausgewählt.
      </Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Für Mario</Text>
        <Text style={styles.heroText}>
          Nicht die ganze Karte lesen. Nur die Gerichte sehen, die wirklich interessant sind.
        </Text>
      </View>

      <View style={styles.card}>
        {safeRecommendations.map(({ rec, dish }, index) => (
          <View
            key={dish.id}
            style={[
              styles.resultItem,
              index === 0 ? { borderTopWidth: 0, paddingTop: 0, marginTop: 0 } : { borderTopColor: colors.border }
            ]}
          >
            <Text style={styles.resultName}>
              {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "•"} {dish.nameOriginal}
            </Text>

            <Text style={styles.resultMeta}>
              {typeof dish.price === "number" ? `${dish.price.toFixed(2)} €` : "Preis nicht erkannt"}
              {dish.category ? ` · ${dish.category}` : ""}
            </Text>

            {dish.descriptionOriginal ? <Text style={styles.resultMeta}>{dish.descriptionOriginal}</Text> : null}

            <Text style={styles.reason}>Warum? {rec.reason}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.button} onPress={onReset}>
        <Text style={styles.buttonText}>Neue Karte prüfen</Text>
      </Pressable>
    </>
  );
}
