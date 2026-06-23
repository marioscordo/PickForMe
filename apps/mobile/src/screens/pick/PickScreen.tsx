import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { Screen } from "../../components/ui/Screen";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

export function PickScreen() {
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("regional");
  const analyze = useAnalyzeMenu();

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Für Mario</Text>
        <Text style={styles.heroText}>
          Speisekarte einfügen, Situation wählen und wenige passende Gerichte bekommen.
        </Text>
      </View>

      <MenuInputCard menuText={menuText} setMenuText={setMenuText} />
      <SituationSelector situation={situation} setSituation={setSituation} />

      {analyze.error ? <Text style={styles.error}>{analyze.error}</Text> : null}

      <Pressable
        style={[styles.button, analyze.loading && styles.buttonDisabled]}
        onPress={() => analyze.run(menuText, situation)}
        disabled={analyze.loading}
      >
        <Text style={styles.buttonText}>{analyze.loading ? "PickForMe prüft..." : "3 passende Gerichte finden"}</Text>
      </Pressable>

      {analyze.result ? <RecommendationCard result={analyze.result} /> : null}
    </Screen>
  );
}
