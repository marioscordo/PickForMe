import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMobileContent } from "../../content/useMobileContent";
import type { RecommendationModeId, RecommendationModeOption } from "../../types/recommendationMode";

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

export function RecommendationModeSelector({
  mode,
  setMode
}: {
  mode: RecommendationModeId;
  setMode: (value: RecommendationModeId) => void;
}) {
  const content = useMobileContent();
  const options = content.recommendationModes as RecommendationModeOption[];

  return (
    <View style={local.stack}>
      {options.map((option) => {
        const active = mode === option.value;

        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            key={option.value}
            onPress={() => setMode(option.value)}
            style={[local.option, active && local.optionActive]}
          >
            <View style={[local.optionIcon, active ? local.optionIconActive : null]}>
              <RecommendationModeIcon value={option.value} active={active} />
            </View>
            <Text style={[local.optionText, active && local.optionTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RecommendationModeIcon({ value, active }: { value: RecommendationModeId; active: boolean }) {
  const color = active ? premiumPalette.surface : premiumPalette.gold;
  const name = value === "starters_and_salads" ? "food-variant" : "silverware-fork-knife";

  return <MaterialCommunityIcons color={color} name={name} size={s(19)} />;
}

const premiumPalette = {
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  gold: "#C6A04A",
  border: "#E4D4B6"
};

const local = StyleSheet.create({
  stack: {
    gap: s(10)
  },
  option: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.78)",
    borderColor: premiumPalette.border,
    borderRadius: s(22),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(10),
    minHeight: s(58),
    paddingHorizontal: s(14),
    paddingVertical: s(10),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(5) },
    shadowOpacity: 0.05,
    shadowRadius: s(10),
    width: "100%"
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
    height: s(32),
    justifyContent: "center",
    width: s(32)
  },
  optionIconActive: {
    backgroundColor: "rgba(255, 253, 248, 0.14)",
    borderColor: "rgba(215, 190, 131, 0.74)"
  },
  optionText: {
    color: premiumPalette.oliveDeep,
    flex: 1,
    flexShrink: 1,
    fontSize: fs(15),
    fontWeight: "800",
    lineHeight: fs(20),
    minWidth: 0
  },
  optionTextActive: {
    color: premiumPalette.surface
  }
});
