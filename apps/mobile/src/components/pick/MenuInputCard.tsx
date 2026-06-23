import React from "react";
import { Text, TextInput, View } from "react-native";
import { styles } from "../../theme/styles";

export function MenuInputCard({
  menuText,
  setMenuText
}: {
  menuText: string;
  setMenuText: (value: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Speisekarte</Text>
      <Text style={styles.hint}>
        Kopiere hier den Text der Karte hinein. Foto- und PDF-Erkennung bauen wir danach sauber ein.
      </Text>

      <TextInput
        multiline
        scrollEnabled
        style={[styles.input, styles.textArea]}
        value={menuText}
        onChangeText={setMenuText}
        placeholder={"Beispiel:\nSchäufele mit Kloß und Wirsing 18,90 €\nTagliatelle mit Pilzen 16,50 €\nGroßer Salat mit Hähnchen 14,90 €"}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}
