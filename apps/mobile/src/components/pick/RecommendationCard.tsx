import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { colors, styles } from "../../theme/styles";
import type { Dish } from "../../types/menu";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";

export function RecommendationCard({ result }: { result: AnalyzeData }) {
  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);

  const safeRecommendations = result.recommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.resultMeta}>{result.dishes.length} Speisen erkannt · Modus: {result.mode}</Text>

      {safeRecommendations.map(({ rec, dish }, index) => (
        <View
          key={dish.id}
          style={[
            styles.resultItem,
            index === 0 ? { borderTopWidth: 0, paddingTop: 0 } : { borderTopColor: colors.border }
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
  );
}
