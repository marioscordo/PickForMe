import { StyleSheet, Text, TextInput, View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";

export function MenuInputCard({
  menuText,
  setMenuText
}: {
  menuText: string;
  setMenuText: (value: string) => void;
}) {
  const content = useMobileContent();

  return (
    <View style={[styles.card, local.card]}>
      <View style={local.headerRow}>
        <View>
          <Text style={local.kicker}>{content.menuInput.kicker}</Text>
          <Text style={local.title}>{content.menuInput.title}</Text>
        </View>

        <View style={local.iconBubble}>
          <Text style={local.icon}>🍽️</Text>
        </View>
      </View>

      <Text style={local.hint}>
        {content.menuInput.hint}
      </Text>

      <TextInput
        multiline
        scrollEnabled
        style={local.textArea}
        value={menuText}
        onChangeText={setMenuText}
        placeholder={content.menuInput.placeholder}
        placeholderTextColor="#94A3B8"
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect={false}
      />
    </View>
  );
}

const local = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 24,
    marginBottom: 10,
    backgroundColor: "#F3F0FA",
    borderColor: "#D8CFF0",
    borderWidth: 1
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5
  },

  kicker: {
    color: "#6D5D91",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },

  title: {
    color: "#172033",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "900"
  },

  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F3F1",
    borderWidth: 1,
    borderColor: "#B7D9CD"
  },

  icon: {
    fontSize: 20
  },

  hint: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    marginBottom: 8
  },

  textArea: {
    borderRadius: 18,
    minHeight: 78,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8CFF0",
    padding: 14,
    fontSize: 16,
    color: "#111827"
  }
});
