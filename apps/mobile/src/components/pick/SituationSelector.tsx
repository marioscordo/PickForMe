import { View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";
import { Chip } from "../ui/Chip";

type SituationOption = {
  value: Situation;
  label: string;
};

export function SituationSelector({
  situation,
  setSituation
}: {
  situation: Situation;
  setSituation: (value: Situation) => void;
}) {
  const content = useMobileContent();
  const options = content.situations as SituationOption[];

  return (
    <View style={styles.chipRow}>
      {options.map((option) => (
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
