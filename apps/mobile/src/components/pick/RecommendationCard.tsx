import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useProfile } from "../../app/providers/ProfileProvider";
import { analyzeMenu, requestRestaurantIntro } from "../../api/pickformeApi";
import { DEFAULT_OUTPUT_LOCALE, resolveOutputLocale } from "../../config/outputLocales";
import { useMobileContent } from "../../content/useMobileContent";
import { getAnalyzeMenuErrorMessage } from "../../hooks/useAnalyzeMenu";
import { premiumColors, radius, semanticColors, spacing, typography } from "../../theme/tokens";
import type { Dish } from "../../types/menu";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";
import { Surface } from "../ui/Surface";

type RestaurantIntroStatus = "idle" | "loading" | "loaded" | "error";
type NestedRecommendationStatus = "idle" | "loading" | "loaded" | "error";
type PremiumActionTone = "secondary";
type NestedRecommendationState = {
  error?: string;
  result?: AnalyzeData;
  status: NestedRecommendationStatus;
};

function buildDisplayTranslation(originalName: string, translatedName?: string) {
  const cleaned = translatedName?.trim() ?? "";

  if (cleaned.length > 0 && cleaned.toLowerCase() !== originalName.toLowerCase()) {
    return cleaned;
  }

  return "";
}

function formatEuroPrice(price: number) {
  return `${price.toFixed(2).replace(".", ",")} €`;
}

function normalizeRestaurantIntroText(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitRestaurantIntroParagraphs(value: string) {
  const paragraphs = normalizeRestaurantIntroText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length !== 1) {
    return paragraphs;
  }

  const introParagraph = paragraphs[0];
  if (!introParagraph) {
    return paragraphs;
  }

  const sentences = introParagraph.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

  if (sentences.length <= 3) {
    return paragraphs;
  }

  const groupedParagraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    groupedParagraphs.push(sentences.slice(index, index + 2).join(" "));
  }

  return groupedParagraphs;
}

function PremiumCardAction({
  disabled,
  hero,
  label,
  onPress,
  tone
}: {
  disabled?: boolean;
  hero?: boolean;
  label: string;
  onPress: () => void;
  tone: PremiumActionTone;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        local.premiumAction,
        local.premiumActionSecondary,
        hero && tone === "secondary" ? local.premiumActionSecondaryHero : null,
        state.pressed && !disabled ? local.premiumActionPressed : null,
        disabled ? local.premiumActionDisabled : null
      ]}
    >
      <Text
        style={[
          local.premiumActionText,
          local.premiumActionSecondaryText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PremiumFooterAction({
  icon,
  label,
  onPress
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [local.footerPremiumButton, pressed ? local.footerPremiumButtonPressed : null]}
    >
      <View style={local.footerPremiumIcon}>{icon}</View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={local.footerPremiumText}>
        {label}
      </Text>
      <Feather color={premiumColors.textMuted} name="chevron-right" size={22} />
    </Pressable>
  );
}

export function RecommendationCard({
  result,
  menuText,
  showStartersAndSaladsAction = false,
  onReset,
  openMenuLabel,
  onOpenMenu
}: {
  result: AnalyzeData;
  menuText: string;
  showStartersAndSaladsAction?: boolean;
  onReset: () => void;
  openMenuLabel?: string;
  onOpenMenu?: () => void;
}) {
  const content = useMobileContent();
  const { profile } = useProfile();
  const nestedLoadingDishIdsRef = useRef(new Set<string>());
  const activeNestedDishIdRef = useRef<string | null>(null);
  const [activeNestedDishId, setActiveNestedDishId] = useState<string | null>(null);
  const [nestedRecommendationsByDishId, setNestedRecommendationsByDishId] = useState<Record<string, NestedRecommendationState>>({});
  const [restaurantIntroStatus, setRestaurantIntroStatus] = useState<RestaurantIntroStatus>("idle");
  const [restaurantIntroText, setRestaurantIntroText] = useState("");
  const [restaurantIntroVisible, setRestaurantIntroVisible] = useState(false);

  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);
  const visibleRecommendations = result.recommendations;

  const safeRecommendations = visibleRecommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));
  const restaurantIntroLocale = resolveOutputLocale(profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE);
  const cachedRestaurantIntro = normalizeRestaurantIntroText(restaurantIntroText);
  const restaurantIntroParagraphs = useMemo(
    () => splitRestaurantIntroParagraphs(cachedRestaurantIntro),
    [cachedRestaurantIntro]
  );
  const hasRestaurantIntro = restaurantIntroVisible && cachedRestaurantIntro.length > 0;
  const isRestaurantIntroLoading = restaurantIntroStatus === "loading";
  const topBox = (
    <Surface style={local.topBox}>
      <View style={local.topBoxAccent} />
      {hasRestaurantIntro ? (
        <Pressable
          accessibilityLabel={content.common.cancel}
          accessibilityRole="button"
          onPress={closeRestaurantIntro}
          style={({ pressed }) => [local.restaurantIntroCloseButton, pressed ? local.restaurantIntroCloseButtonPressed : null]}
        >
          <Feather color={premiumColors.textMuted} name="x" size={20} />
        </Pressable>
      ) : null}
      <Text style={local.title}>{content.recommendation.restaurantTitle}</Text>
      {hasRestaurantIntro ? (
        <ScrollView
          contentContainerStyle={local.restaurantIntroTextBlock}
          nestedScrollEnabled
          showsVerticalScrollIndicator={restaurantIntroParagraphs.length > 2}
          style={local.restaurantIntroScroll}
        >
          {restaurantIntroParagraphs.map((paragraph, index) => (
            <Text
              android_hyphenationFrequency="full"
              key={`${index}-${paragraph.slice(0, 16)}`}
              lineBreakStrategyIOS="standard"
              style={[
                local.restaurantIntroText,
                index === restaurantIntroParagraphs.length - 1 ? local.restaurantIntroTextLast : null
              ]}
              textBreakStrategy="highQuality"
            >
              {paragraph}
            </Text>
          ))}
        </ScrollView>
      ) : (
        <Text style={local.subtitle}>{content.recommendation.restaurantIntroTeaser}</Text>
      )}
      {isRestaurantIntroLoading ? (
        <Text style={local.restaurantIntroStatusText}>{content.recommendation.restaurantIntroLoading}</Text>
      ) : null}
      {restaurantIntroStatus === "error" ? (
        <Text style={local.restaurantIntroStatusText}>{content.recommendation.restaurantIntroError}</Text>
      ) : null}
      {!hasRestaurantIntro ? (
        <PremiumCardAction
          disabled={isRestaurantIntroLoading}
          label={
            restaurantIntroStatus === "error"
              ? content.recommendation.restaurantIntroRetry
              : content.recommendation.restaurantIntroButton
          }
          onPress={handleRestaurantIntro}
          tone="secondary"
        />
      ) : null}
    </Surface>
  );
  const analysisWarning = result.analysisWarning?.trim() ?? "";
  const warningBox = analysisWarning ? (
    <Surface tone="soft" style={local.warningBox}>
      <Text style={local.warningTitle}>{content.recommendation.warningTitle}</Text>
      <Text style={local.warningText}>{analysisWarning}</Text>
    </Surface>
  ) : null;

  useEffect(() => {
    nestedLoadingDishIdsRef.current.clear();
    activeNestedDishIdRef.current = null;
    setActiveNestedDishId(null);
    setNestedRecommendationsByDishId({});
    setRestaurantIntroStatus("idle");
    setRestaurantIntroText("");
    setRestaurantIntroVisible(false);
  }, [restaurantIntroLocale, result]);

  async function handleRestaurantIntro() {
    if (isRestaurantIntroLoading) {
      return;
    }

    if (cachedRestaurantIntro) {
      setRestaurantIntroVisible(true);
      setRestaurantIntroStatus("loaded");
      return;
    }

    setRestaurantIntroStatus("loading");

    try {
      const data = await requestRestaurantIntro({
        menuText,
        profile
      });
      const nextText = normalizeRestaurantIntroText(data.introText);

      if (!nextText) {
        setRestaurantIntroStatus("error");
        return;
      }

      setRestaurantIntroText(nextText);
      setRestaurantIntroVisible(true);
      setRestaurantIntroStatus("loaded");
    } catch {
      setRestaurantIntroStatus("error");
    }
  }

  function closeRestaurantIntro() {
    setRestaurantIntroVisible(false);
    setRestaurantIntroStatus("idle");
  }

  async function handleStartersAndSaladsSearch(dishId: string) {
    const activeDishId = activeNestedDishIdRef.current;
    const currentStatus = nestedRecommendationsByDishId[dishId]?.status;

    if (activeDishId && activeDishId !== dishId) {
      return;
    }

    if (currentStatus === "loading" || currentStatus === "loaded" || nestedLoadingDishIdsRef.current.has(dishId)) {
      return;
    }

    if (!activeDishId) {
      activeNestedDishIdRef.current = dishId;
      setActiveNestedDishId(dishId);
    }
    nestedLoadingDishIdsRef.current.add(dishId);
    setNestedRecommendationsByDishId((current) => ({
      ...current,
      [dishId]: {
        status: "loading"
      }
    }));

    try {
      const data = await analyzeMenu({
        menuText,
        requestedDishRoles: ["starter", "salad"],
        preferredDishRole: "starter",
        profile
      });

      setNestedRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          result: data,
          status: "loaded"
        }
      }));
    } catch (error) {
      setNestedRecommendationsByDishId((current) => ({
        ...current,
        [dishId]: {
          error: getAnalyzeMenuErrorMessage(error, content),
          status: "error"
        }
      }));
    } finally {
      nestedLoadingDishIdsRef.current.delete(dishId);
    }
  }

  if (safeRecommendations.length === 0) {
    return (
      <>
        {topBox}
        {warningBox}

        <Surface tone="soft" style={local.unsafeBox}>
          <Text style={local.kicker}>{content.recommendation.unsafeKicker}</Text>
          <Text style={local.title}>{content.recommendation.unsafeTitle}</Text>
          <Text style={local.subtitle}>
            {content.recommendation.unsafeText}
          </Text>
        </Surface>

        {renderFooterActions()}
      </>
    );
  }

  function renderFooterActions() {
    return (
      <View style={local.footerActions}>
        <PremiumFooterAction
          icon={<Feather color={premiumColors.gold} name="refresh-cw" size={21} />}
          label={content.recommendation.resetButton}
          onPress={onReset}
        />
        {openMenuLabel && onOpenMenu ? (
          <PremiumFooterAction
            icon={<Feather color={premiumColors.gold} name="external-link" size={21} />}
            label={openMenuLabel}
            onPress={onOpenMenu}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={local.resultRoot}>
      {topBox}
      {warningBox}

      <View style={local.list}>
        {safeRecommendations.map(({ rec, dish }, index) => {
          const dishData = dish as Dish & {
            name?: string;
            nameOriginal?: string;
            description?: string;
            price?: number;
          };

          const originalName = dishData.nameOriginal ?? dishData.name ?? content.recommendation.fallbackDishName;
          const translatedName = buildDisplayTranslation(originalName, rec.translatedName);
          const showTranslation = translatedName.length > 0;
          const translatedDescription = typeof dishData.description === "string" ? dishData.description.trim() : "";
          const showDescription = translatedDescription.length > 0 && translatedDescription !== translatedName;
          const isPrimaryRecommendation = index === 0;
          const nestedState = nestedRecommendationsByDishId[rec.dishId] ?? { status: "idle" };
          const isNestedActiveDish = activeNestedDishId === rec.dishId;
          const isOtherNestedDishActive = Boolean(activeNestedDishId && !isNestedActiveDish);
          const nestedActionDisabled = nestedState.status === "loading" ||
            nestedState.status === "loaded" ||
            isOtherNestedDishActive;

          const priceText = typeof dishData.price === "number" ? formatEuroPrice(dishData.price) : "";
          return (
            <Surface key={dish.id} style={[local.card, isPrimaryRecommendation ? local.primaryCard : local.secondaryCard]}>
              <View style={[local.rankBubble, isPrimaryRecommendation ? local.rankBubblePrimary : local.rankBubbleSecondary]}>
                <Text style={[local.rankText, isPrimaryRecommendation && local.rankTextPrimary]}>{index + 1}</Text>
              </View>

              <View style={[local.cardText, isPrimaryRecommendation && local.cardTextPrimary]}>
                <Text style={[local.dishName, isPrimaryRecommendation ? local.dishNamePrimary : local.dishNameSecondary]}>
                  {originalName}
                </Text>

                {showTranslation ? (
                  <Text style={[local.translation, isPrimaryRecommendation && local.translationPrimary]}>{translatedName}</Text>
                ) : null}

                {showDescription ? (
                  <Text style={[local.description, isPrimaryRecommendation && local.descriptionPrimary]}>{translatedDescription}</Text>
                ) : null}

                {priceText ? <Text style={[local.price, isPrimaryRecommendation && local.pricePrimary]}>{priceText}</Text> : null}

                {showStartersAndSaladsAction ? (
                  <View style={local.nestedActionBox}>
                    <PremiumCardAction
                      disabled={nestedActionDisabled}
                      hero={isPrimaryRecommendation}
                      label={
                        nestedState.status === "loading"
                          ? content.recommendation.startersAndSaladsLoading
                          : nestedState.status === "error"
                            ? content.recommendation.startersAndSaladsRetry
                            : content.recommendation.startersAndSaladsButton
                      }
                      onPress={() => handleStartersAndSaladsSearch(rec.dishId)}
                      tone="secondary"
                    />
                  </View>
                ) : null}

                {renderNestedRecommendations(nestedState, isPrimaryRecommendation)}

              </View>
            </Surface>
          );
        })}
      </View>

      {renderFooterActions()}
    </View>
  );

  function renderNestedRecommendations(state: NestedRecommendationState, isPrimaryRecommendation: boolean) {
    if (state.status === "idle" || state.status === "loading") {
      return null;
    }

    if (state.status === "error") {
      return (
        <View style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}>
          <Text style={local.nestedResultTitle}>{content.recommendation.startersAndSaladsTitle}</Text>
          <Text style={local.nestedResultText}>{state.error ?? content.analysisErrors.generic}</Text>
        </View>
      );
    }

    const nestedResult = state.result;
    const nestedDishesById = new Map(nestedResult?.dishes.map((item) => [item.id, item]) ?? []);
    const nestedRecommendations = (nestedResult?.recommendations ?? [])
      .map((recommendation) => ({ recommendation, dish: nestedDishesById.get(recommendation.dishId) }))
      .filter((item): item is { recommendation: Recommendation; dish: Dish } => Boolean(item.dish));

    if (nestedRecommendations.length === 0) {
      return (
        <View style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}>
          <Text style={local.nestedResultTitle}>{content.recommendation.startersAndSaladsTitle}</Text>
          <Text style={local.nestedResultText}>{content.recommendation.startersAndSaladsEmpty}</Text>
        </View>
      );
    }

    return (
      <View style={[local.nestedResultBox, isPrimaryRecommendation ? local.nestedResultBoxPrimary : null]}>
        <Text style={local.nestedResultTitle}>{content.recommendation.startersAndSaladsTitle}</Text>
        <View style={local.nestedResultList}>
          {nestedRecommendations.map(({ recommendation, dish }, nestedIndex) => {
            const nestedDish = dish as Dish & {
              name?: string;
              nameOriginal?: string;
              description?: string;
              price?: number;
            };
            const originalName = nestedDish.nameOriginal ?? nestedDish.name ?? content.recommendation.fallbackDishName;
            const translatedName = buildDisplayTranslation(originalName, recommendation.translatedName);
            const translatedDescription = typeof nestedDish.description === "string" ? nestedDish.description.trim() : "";

            return (
              <View key={dish.id} style={local.nestedResultItem}>
                <Text style={local.nestedResultRank}>{nestedIndex + 1}</Text>
                <View style={local.nestedResultCopy}>
                  <Text style={local.nestedDishName}>{originalName}</Text>
                  {translatedName ? <Text style={local.nestedDishMeta}>{translatedName}</Text> : null}
                  {translatedDescription && translatedDescription !== translatedName ? (
                    <Text style={local.nestedDishDescription}>{translatedDescription}</Text>
                  ) : null}
                  {typeof nestedDish.price === "number" ? (
                    <Text style={local.nestedDishPrice}>{formatEuroPrice(nestedDish.price)}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
}

const local = StyleSheet.create({
  resultRoot: {
    position: "relative",
    paddingBottom: spacing.md
  },

  topBox: {
    backgroundColor: "rgba(255, 253, 248, 0.74)",
    borderColor: "rgba(200, 168, 90, 0.22)",
    borderWidth: 1,
    marginBottom: spacing.xxl,
    paddingHorizontal: 22,
    paddingRight: 22,
    paddingVertical: 20,
    position: "relative",
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.045,
    shadowRadius: 20,
    elevation: 1
  },

  topBoxAccent: {
    backgroundColor: premiumColors.gold,
    borderRadius: radius.pill,
    height: 2,
    marginBottom: spacing.md,
    opacity: 0.72,
    width: 40
  },

  restaurantIntroCloseButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    top: 14,
    width: 34
  },

  restaurantIntroCloseButtonPressed: {
    backgroundColor: "rgba(116, 109, 100, 0.10)",
    opacity: 0.82
  },

  unsafeBox: {
    marginBottom: spacing.md,
    padding: spacing.xxl
  },

  warningBox: {
    backgroundColor: semanticColors.warningSurface,
    borderColor: semanticColors.warningBorder,
    marginBottom: spacing.md,
    padding: spacing.lg
  },

  warningTitle: {
    color: semanticColors.warningText,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },

  warningText: {
    color: semanticColors.warningBody,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight
  },

  kicker: {
    color: premiumColors.bordeaux,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },

  title: {
    color: premiumColors.text,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 29,
    marginBottom: spacing.sm
  },

  subtitle: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 22
  },

  restaurantIntroText: {
    color: premiumColors.textMuted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 21,
    marginBottom: spacing.sm
  },

  restaurantIntroScroll: {
    maxHeight: 360
  },

  restaurantIntroTextBlock: {
    paddingBottom: 2
  },

  restaurantIntroTextLast: {
    marginBottom: 0
  },

  restaurantIntroStatusText: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: spacing.sm
  },

  list: {
    gap: spacing.xxl,
    marginBottom: spacing.section
  },

  card: {
    backgroundColor: premiumColors.surface,
    borderColor: "rgba(231, 222, 210, 0.72)",
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: 0,
    overflow: "hidden",
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.055,
    shadowRadius: 18
  },

  primaryCard: {
    backgroundColor: "#FFFDF8",
    borderColor: "rgba(200, 168, 90, 0.46)",
    borderRadius: radius.hero,
    flexDirection: "column",
    gap: spacing.lg,
    padding: 24,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 5
  },

  secondaryCard: {
    backgroundColor: "rgba(255, 253, 248, 0.88)",
    borderColor: "rgba(231, 222, 210, 0.72)",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.025,
    shadowRadius: 10,
    elevation: 1
  },

  rankBubble: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    height: 32,
    width: 32
  },

  rankBubblePrimary: {
    backgroundColor: premiumColors.olive,
    borderColor: premiumColors.olive,
    height: 48,
    shadowColor: premiumColors.olive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    width: 48
  },

  rankBubbleSecondary: {
    backgroundColor: "rgba(200, 168, 90, 0.10)",
    borderColor: "rgba(200, 168, 90, 0.26)"
  },

  rankText: {
    color: premiumColors.textMuted,
    fontSize: 15,
    fontWeight: "800"
  },

  rankTextPrimary: {
    color: premiumColors.surface,
    fontSize: 20,
    fontWeight: "900"
  },

  cardText: {
    flex: 1
  },

  cardTextPrimary: {
    paddingTop: spacing.xxs
  },

  dishName: {
    color: premiumColors.text,
    fontWeight: "900"
  },

  dishNamePrimary: {
    fontSize: 18,
    lineHeight: 23
  },

  dishNameSecondary: {
    fontSize: 18,
    lineHeight: 23
  },

  translation: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: spacing.xs,
    marginTop: spacing.xs
  },

  translationPrimary: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs
  },

  description: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
    marginBottom: spacing.xs
  },

  descriptionPrimary: {
    fontSize: 13,
    lineHeight: 19
  },

  price: {
    color: premiumColors.bordeaux,
    fontSize: 15,
    fontWeight: "900",
    marginTop: spacing.sm
  },

  pricePrimary: {
    color: premiumColors.gold,
    fontSize: 15,
    marginTop: spacing.sm
  },

  nestedActionBox: {
    marginTop: spacing.md
  },

  nestedResultBox: {
    backgroundColor: "rgba(247, 241, 231, 0.52)",
    borderColor: "rgba(200, 168, 90, 0.24)",
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg
  },

  nestedResultBoxPrimary: {
    backgroundColor: "rgba(247, 241, 231, 0.68)",
    borderColor: "rgba(200, 168, 90, 0.34)"
  },

  nestedResultTitle: {
    color: premiumColors.olive,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
    marginBottom: spacing.sm
  },

  nestedResultText: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },

  nestedResultList: {
    gap: spacing.md
  },

  nestedResultItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },

  nestedResultRank: {
    color: premiumColors.gold,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    minWidth: 18
  },

  nestedResultCopy: {
    flex: 1,
    minWidth: 0
  },

  nestedDishName: {
    color: premiumColors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19
  },

  nestedDishMeta: {
    color: premiumColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: spacing.xxs
  },

  nestedDishDescription: {
    color: premiumColors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: spacing.xxs
  },

  nestedDishPrice: {
    color: premiumColors.bordeaux,
    fontSize: 13,
    fontWeight: "900",
    marginTop: spacing.xs
  },

  premiumAction: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 15
  },

  premiumActionSecondary: {
    backgroundColor: "rgba(250, 247, 241, 0.62)",
    borderColor: "rgba(116, 109, 100, 0.18)"
  },

  premiumActionSecondaryHero: {
    backgroundColor: "rgba(231, 222, 210, 0.42)",
    marginTop: spacing.sm
  },

  premiumActionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }]
  },

  premiumActionDisabled: {
    opacity: 0.48
  },

  premiumActionText: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textAlign: "center"
  },

  premiumActionSecondaryText: {
    color: premiumColors.textMuted,
    fontSize: 14,
    fontWeight: "800"
  },

  footerActions: {
    gap: 12,
    marginBottom: 16
  },

  footerPremiumButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.88)",
    borderColor: "#E4D4B6",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16
  },

  footerPremiumButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }]
  },

  footerPremiumIcon: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "rgba(228, 212, 182, 0.78)",
    borderRadius: 17,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },

  footerPremiumText: {
    color: premiumColors.olive,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
    textAlign: "center"
  }
});
