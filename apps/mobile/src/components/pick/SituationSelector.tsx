import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, spacing, typography } from "../../theme/tokens";
import type { Situation } from "../../types/profile";

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
    <View style={local.grid}>
      {options.map((option) => {
        const active = situation === option.value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            style={[local.option, active && local.optionActive]}
            onPress={() => setSituation(option.value)}
          >
            <Text style={[local.optionText, active && local.optionTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const local = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  option: {
    alignItems: "center",
    backgroundColor: "rgba(250, 247, 241, 0.70)",
    borderColor: "rgba(231, 222, 210, 0.84)",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  optionActive: {
    backgroundColor: premiumColors.olive,
    borderColor: premiumColors.olive,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2
  },
  optionText: {
    color: premiumColors.textMuted,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    textAlign: "center"
  },
  optionTextActive: {
    color: premiumColors.surface
  }
});
