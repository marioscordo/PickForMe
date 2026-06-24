import { View } from "react-native";
import { Chip } from "../ui/Chip";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

const SITUATION_OPTIONS: Array<{ value: Situation; label: string }> = [
  { value: "richtig_hunger", label: "😋 Richtig Hunger" },
  { value: "leicht", label: "🤏 Etwas Leichtes" },
  { value: "neues_probieren", label: "🧪 Etwas Neues probieren" },
  { value: "sicher", label: "🛡️ Auf Nummer sicher gehen" }
];

export function SituationSelector({
  situation,
  setSituation
}: {
  situation: Situation;
  setSituation: (value: Situation) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {SITUATION_OPTIONS.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          active={situation === option.value}
          onPress={() => setSituation(option.value)}
        />
      ))}
    </View>
  );
}
