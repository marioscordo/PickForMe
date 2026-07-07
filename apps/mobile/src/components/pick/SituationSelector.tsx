import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMobileContent } from "../../content/useMobileContent";
import type { Situation } from "../../types/profile";

const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screenWidth = Dimensions.get("window").width;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

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
              <SituationIcon value={option.value} active={active} />
            </View>
            <Text style={[local.optionText, active && local.optionTextActive]} numberOfLines={2}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SituationIcon({ value, active }: { value: Situation; active: boolean }) {
  const color = active ? premiumPalette.surface : premiumPalette.gold;

  if (value === "richtig_hunger") {
    return <MaterialCommunityIcons color={color} name="silverware-fork-knife" size={s(19)} />;
  }

  if (value === "leicht") {
    return <MaterialCommunityIcons color={color} name="leaf" size={s(19)} />;
  }

  if (value === "neues_probieren") {
    return <Feather color={color} name="star" size={s(18)} />;
  }

  return <Feather color={color} name="shield" size={s(18)} />;
}


const premiumPalette = {
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  gold: "#C6A04A",
  border: "#E4D4B6",
  textSoft: "#6F6A61"
};

const local = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: s(10)
  },
  option: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.78)",
    borderColor: premiumPalette.border,
    borderRadius: s(22),
    borderWidth: 1,
    flexBasis: "48%",
    flexDirection: "row",
    flexGrow: 1,
    gap: s(9),
    minHeight: s(58),
    paddingHorizontal: s(12),
    paddingVertical: s(10),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(5) },
    shadowOpacity: 0.05,
    shadowRadius: s(10)
  },
  optionActive: {
    backgroundColor: premiumPalette.olive,
    borderColor: premiumPalette.olive,
    shadowColor: premiumPalette.olive,
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.12,
    shadowRadius: s(14),
    elevation: 2
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: "rgba(228, 212, 182, 0.86)",
    borderRadius: 999,
    borderWidth: 1,
    height: s(34),
    justifyContent: "center",
    width: s(34)
  },
  optionIconActive: {
    backgroundColor: "rgba(255, 253, 248, 0.14)",
    borderColor: "rgba(215, 190, 131, 0.74)"
  },
  optionText: {
    color: premiumPalette.oliveDeep,
    flex: 1,
    fontSize: fs(15),
    fontWeight: "700",
    lineHeight: fs(19)
  },
  optionTextActive: {
    color: premiumPalette.surface
  }
});