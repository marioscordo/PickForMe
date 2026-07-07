import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, radius, spacing, typography } from "../../theme/tokens";
import type { Situation } from "../../types/profile";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

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
            <View style={[local.optionIcon, active ? local.optionIconActive : null]}>
              <Feather color={active ? premiumColors.gold : "#AA7C1E"} name={situationIcon(option.value)} size={17} />
            </View>
            <Text style={[local.optionText, active && local.optionTextActive]}>{stripMoodIcon(option.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function situationIcon(value: Situation): FeatherName {
  if (value === "richtig_hunger") {
    return "trending-up";
  }

  if (value === "leicht") {
    return "feather";
  }

  if (value === "neues_probieren") {
    return "compass";
  }

  return "shield";
}

function stripMoodIcon(label: string) {
  const firstSpaceIndex = label.indexOf(" ");

  return firstSpaceIndex > 0 ? label.slice(firstSpaceIndex + 1) : label;
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
    flexDirection: "row",
    flexGrow: 1,
    gap: spacing.sm,
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
  optionIcon: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "rgba(228, 212, 182, 0.78)",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  optionIconActive: {
    backgroundColor: "rgba(255, 253, 248, 0.12)",
    borderColor: "rgba(215, 190, 131, 0.72)"
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
