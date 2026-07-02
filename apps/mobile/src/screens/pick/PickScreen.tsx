import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/ui/Screen";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { QrMenuScanner } from "../../components/pick/QrMenuScanner";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { ActionButton } from "../../components/ui/ActionButton";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { Surface } from "../../components/ui/Surface";
import { useMobileContent } from "../../content/useMobileContent";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";
import type { Situation } from "../../types/profile";

export function PickScreen() {
  const content = useMobileContent();
  const loadingSteps = content.pick.loadingSteps;
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("richtig_hunger");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const analyze = useAnalyzeMenu();
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [lastAnalyzedMenuUrl, setLastAnalyzedMenuUrl] = useState("");

  useEffect(() => {
    if (!analyze.loading) {
      setLoadingStepIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setLoadingStepIndex((current) =>
        Math.min(current + 1, loadingSteps.length - 1)
      );
    }, 7000);

    return () => clearInterval(timer);
  }, [analyze.loading, loadingSteps.length]);

  function normalizeMenuUrl(value: string) {
    const trimmed = value.trim();

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }

    if (trimmed.startsWith("www.")) {
      return `https://${trimmed}`;
    }

    return "";
  }

  function handleAnalyze() {
    setLastAnalyzedMenuUrl(normalizeMenuUrl(menuText));
    analyze.run(menuText, situation);
  }

  async function openAnalyzedMenu() {
    if (!lastAnalyzedMenuUrl) return;
    await Linking.openURL(lastAnalyzedMenuUrl);
  }

  if (analyze.result) {
    return (
      <Screen>
        <RecommendationCard result={analyze.result} onReset={analyze.reset} />

        {lastAnalyzedMenuUrl ? (
          <View style={local.openMenuSection}>
            <ActionButton label={content.pick.openMenu} variant="secondary" onPress={openAnalyzedMenu} />
          </View>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={content.pick.heroTitle} subtitle={content.pick.heroSubtitle} />

      <View style={local.quickRow}>
        <Pressable
          style={[local.quickButton, !showQrScanner && local.quickButtonActive]}
          onPress={() => setShowQrScanner(false)}
        >
          <Text style={[local.quickButtonText, !showQrScanner && local.quickButtonTextActive]}>
            {content.pick.pasteTab}
          </Text>
        </Pressable>

        <Pressable
          style={[local.quickButton, showQrScanner && local.quickButtonActive]}
          onPress={() => setShowQrScanner(true)}
        >
          <Text style={[local.quickButtonText, showQrScanner && local.quickButtonTextActive]}>
            {content.pick.qrTab}
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

      <Surface style={local.moodCard}>
        <Text style={local.moodTitle}>{content.pick.moodTitle}</Text>
        <SituationSelector situation={situation} setSituation={setSituation} />
      </Surface>

      {analyze.loading ? (
        <Surface tone="soft" style={local.feedbackCard}>
          <Text style={local.loadingTitle}>{content.pick.loadingTitle}</Text>
          <Text style={local.loadingText}>{loadingSteps[loadingStepIndex]}</Text>
          <View style={local.loadingDots}>
            {loadingSteps.map((_, index) => (
              <View
                key={index}
                style={[
                  local.loadingDot,
                  index === loadingStepIndex && local.loadingDotActive
                ]}
              />
            ))}
          </View>
        </Surface>
      ) : null}

      {analyze.error ? (
        <View style={local.feedbackErrorCard}>
          <Text style={local.errorTitle}>{content.pick.errorTitle}</Text>
          <Text style={local.errorText}>{analyze.error}</Text>
        </View>
      ) : null}

      <ActionButton
        label={analyze.loading ? content.pick.mainButtonLoading : content.pick.mainButtonIdle}
        variant="accent"
        onPress={handleAnalyze}
        disabled={analyze.loading}
        style={local.mainButton}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },

  quickButton: {
    alignItems: "center",
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.md
  },

  quickButtonActive: {
    backgroundColor: semanticColors.accentSoft,
    borderColor: semanticColors.accent
  },

  quickButtonText: {
    color: semanticColors.textMuted,
    fontSize: typography.button.fontSize,
    fontWeight: typography.button.fontWeight,
    lineHeight: typography.button.lineHeight
  },

  quickButtonTextActive: {
    color: semanticColors.text
  },

  moodCard: {
    marginBottom: spacing.md,
    padding: spacing.md
  },

  moodTitle: {
    color: semanticColors.text,
    fontSize: typography.sectionTitle.fontSize,
    fontWeight: typography.sectionTitle.fontWeight,
    lineHeight: typography.sectionTitle.lineHeight,
    marginBottom: spacing.md
  },

  feedbackCard: {
    marginBottom: spacing.md,
    padding: spacing.lg
  },

  loadingTitle: {
    color: semanticColors.text,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  loadingText: {
    color: semanticColors.textMuted,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    marginBottom: spacing.md
  },

  loadingDots: {
    flexDirection: "row",
    gap: spacing.xs
  },

  loadingDot: {
    height: 7,
    width: 7,
    borderRadius: radius.pill,
    backgroundColor: semanticColors.border
  },

  loadingDotActive: {
    backgroundColor: semanticColors.accentActive,
    width: 18
  },

  feedbackErrorCard: {
    backgroundColor: semanticColors.warningSurface,
    borderColor: semanticColors.warningBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg
  },

  errorTitle: {
    color: semanticColors.warningText,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  errorText: {
    color: semanticColors.warningBody,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight
  },

  mainButton: {
    borderRadius: radius.pill,
    marginBottom: 20,
    marginTop: spacing.xxs,
    shadowColor: semanticColors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },

  openMenuSection: {
    marginTop: 12,
    marginBottom: 16
  }

});
