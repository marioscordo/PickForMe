import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/ui/Screen";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

const LOADING_STEPS = [
  "Speisekarte wird gelesen ...",
  "Gerichte werden erkannt ...",
  "Dein Profil wird beruecksichtigt ...",
  "PickForMe waehlt passende Empfehlungen ..."
];

export function PickScreen() {
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("richtig_hunger");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const analyze = useAnalyzeMenu();
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  useEffect(() => {
    if (!analyze.loading) {
      setLoadingStepIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setLoadingStepIndex((current) =>
        Math.min(current + 1, LOADING_STEPS.length - 1)
      );
    }, 7000);

    return () => clearInterval(timer);
  }, [analyze.loading]);

  if (analyze.result) {
    return (
      <Screen>
        <RecommendationCard result={analyze.result} onReset={analyze.reset} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={local.hero}>
        <Text style={local.title}>Was passt heute?</Text>
        <Text style={local.subtitle}>
          {"Speisekarte rein. PickForMe kennt Dein Profil."}
        </Text>
      </View>

      <View style={local.quickRow}>
        <Pressable
          style={[local.quickButton, !showQrScanner && local.quickButtonActive]}
          onPress={() => setShowQrScanner(false)}
        >
          <Text style={[local.quickButtonText, !showQrScanner && local.quickButtonTextActive]}>
            {"Einfügen"}
          </Text>
        </Pressable>

        <Pressable
          style={[local.quickButton, showQrScanner && local.quickButtonActive]}
          onPress={() => setShowQrScanner(true)}
        >
          <Text style={[local.quickButtonText, showQrScanner && local.quickButtonTextActive]}>
            {"QR-Code"}
          </Text>
        </Pressable>
      </View>

      {showQrScanner ? (
        <QrMenuScanner
          onUrlScanned={(value: string) => {
            setMenuText(value);
            setShowQrScanner(false);
          }}
          onClose={() => setShowQrScanner(false)}
        />
      ) : null}

      <MenuInputCard menuText={menuText} setMenuText={setMenuText} />

      <View style={local.moodCard}>
        <Text style={local.moodTitle}>Heute passt am besten:</Text>
        <SituationSelector situation={situation} setSituation={setSituation} />
      </View>

      {analyze.loading ? (
        <View style={local.loadingCard}>
          <Text style={local.loadingTitle}>PickForMe arbeitet fuer Dich</Text>
          <Text style={local.loadingText}>{LOADING_STEPS[loadingStepIndex]}</Text>
          <View style={local.loadingDots}>
            {LOADING_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  local.loadingDot,
                  index === loadingStepIndex && local.loadingDotActive
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}

      {analyze.error ? (
        <View style={local.errorCard}>
          <Text style={local.errorTitle}>Speisekarte nicht sicher ausgewertet</Text>
          <Text style={local.errorText}>{analyze.error}</Text>
        </View>
      ) : null}

      <Pressable
        style={[local.mainButton, analyze.loading && styles.buttonDisabled]}
        onPress={() => analyze.run(menuText, situation)}
        disabled={analyze.loading}
      >
        <Text style={local.mainButtonText}>
          {analyze.loading ? "Analyse läuft ..." : "Passende Gerichte finden"}
        </Text>
      </Pressable>
    </Screen>
  );
}

const local = StyleSheet.create({
  hero: {
    backgroundColor: "#DCEBF7",
    borderRadius: 26,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#9FB8C9",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },

  title: {
    color: "#132238",
    fontSize: 30,
    lineHeight: 33,
    fontWeight: "900",
    marginBottom: 6
  },

  subtitle: {
    color: "#334155",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800"
  },

  quickRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10
  },

  quickButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1"
  },

  quickButtonActive: {
    backgroundColor: "#A7C7C5",
    borderColor: "#A7C7C5"
  },

  quickButtonText: {
    color: "#64748B",
    fontWeight: "900",
    fontSize: 16
  },

  quickButtonTextActive: {
    color: "#102A2A"
  },

  moodCard: {
    backgroundColor: "#EEF7F3",
    borderColor: "#B7D9CD",
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    marginBottom: 10
  },

  moodTitle: {
    color: "#285C55",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8
  },

  loadingCard: {
    backgroundColor: "#EEF4F8",
    borderColor: "#C9DCE8",
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12
  },

  loadingTitle: {
    color: "#314A5C",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 6
  },

  loadingText: {
    color: "#3E5B6F",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    marginBottom: 10
  },

  loadingDots: {
    flexDirection: "row",
    gap: 6
  },

  loadingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#C5D5DF"
  },

  loadingDotActive: {
    width: 18,
    backgroundColor: "#7EA9B8"
  },
  errorCard: {
    backgroundColor: "#F8EAF0",
    borderColor: "#E8B9C8",
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12
  },

  errorTitle: {
    color: "#7A3146",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 5
  },

  errorText: {
    color: "#6B2D3F",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700"
  },

  mainButton: {
    backgroundColor: "#8FB9B4",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 2,
    marginBottom: 20,
    shadowColor: "#8FB9B4",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },

  mainButtonText: {
    color: "#102A2A",
    fontSize: 17,
    fontWeight: "900"
  }
});




