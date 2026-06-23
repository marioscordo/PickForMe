import React from "react";
import { Text, View } from "react-native";
import { Chip } from "../ui/Chip";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

const SITUATIONS: Situation[] = ["leicht", "regional", "teilen", "überraschen"];

export function SituationSelector({
  situation,
  setSituation
}: {
  situation: Situation;
  setSituation: (situation: Situation) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h3}>Situation</Text>
      <View style={styles.chipRow}>
        {SITUATIONS.map((item) => (
          <Chip key={item} label={item} active={situation === item} onPress={() => setSituation(item)} />
        ))}
      </View>
    </View>
  );
}
