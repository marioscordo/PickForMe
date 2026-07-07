import { Dimensions, StyleSheet, TextInput } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";

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

export function MenuInputCard({
  menuText,
  setMenuText,
  compact = false
}: {
  menuText: string;
  setMenuText: (value: string) => void;
  compact?: boolean;
}) {
  const content = useMobileContent();

  return (
    <TextInput
      testID="menu-input-textarea"
      multiline
      scrollEnabled
      style={[local.textArea, compact && local.textAreaCompact]}
      value={menuText}
      onChangeText={setMenuText}
      placeholder={content.menuInput.placeholder}
      placeholderTextColor={premiumPalette.placeholder}
      textAlignVertical="top"
      autoCapitalize="sentences"
      autoCorrect={false}
    />
  );
}

const premiumPalette = {
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  border: "#E4D4B6",
  placeholder: "#8A8378"
};

const local = StyleSheet.create({
  textArea: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border,
    borderRadius: s(20),
    borderWidth: 1,
    color: premiumPalette.olive,
    fontSize: fs(16),
    lineHeight: fs(22),
    minHeight: s(124),
    paddingHorizontal: s(16),
    paddingVertical: s(14)
  },
  textAreaCompact: {
    minHeight: s(104)
  }
});