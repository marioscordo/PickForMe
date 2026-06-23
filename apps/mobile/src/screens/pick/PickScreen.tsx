import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { Screen } from "../../components/ui/Screen";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

export function PickScreen() {
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("regional");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const analyze = useAnalyzeMenu();

  if (analyze.result) {
    return (
      <Screen scrollToTopKey="result">
        <RecommendationCard result={analyze.result} onReset={analyze.reset} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Für Mario</Text>
        <Text style={styles.heroText}>
          Speisekarte einfügen, QR-Code scannen, Situation wählen und passende Gerichte bekommen.
        </Text>
      </View>

      {showQrScanner ? (
        <QrMenuScanner
          onUrlScanned={(url) => {
            setMenuText(url.trim());
            setShowQrScanner(false);
          }}
          onClose={() => setShowQrScanner(false)}
        />
      ) : (
        <Pressable style={styles.ghostButton} onPress={() => setShowQrScanner(true)}>
          <Text style={styles.ghostButtonText}>QR-Code der Speisekarte scannen</Text>
        </Pressable>
      )}

      <MenuInputCard menuText={menuText} setMenuText={setMenuText} />
      <SituationSelector situation={situation} setSituation={setSituation} />

      {analyze.error ? <Text style={styles.error}>{analyze.error}</Text> : null}

      <Pressable
        style={[styles.button, analyze.loading && styles.buttonDisabled]}
        onPress={() => analyze.run(menuText, situation)}
        disabled={analyze.loading}
      >
        <Text style={styles.buttonText}>{analyze.loading ? "PickForMe prüft..." : "Finde meine 3 passenden Gerichte"}</Text>
      </Pressable>
    </Screen>
  );
}
