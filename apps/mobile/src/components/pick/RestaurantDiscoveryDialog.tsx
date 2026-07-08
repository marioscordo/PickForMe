import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  generateRestaurantCandidates,
  gustaroaiRestaurantDiscoveryProvider,
  resolveSelectedRestaurantSource,
  type RestaurantCandidate
} from "../../gustaroai/restaurantDiscoveryRoutine";
import { BottomTabs } from "../../app/navigation/PickTabs";
import { useMobileContent } from "../../content/useMobileContent";
import { radius } from "../../theme/tokens";
import { GustaroHelp } from "../ui/GustaroHelp";
import { Screen } from "../ui/Screen";

type RestaurantDiscoveryDialogProps = {
  onGoHome?: () => void;
  visible: boolean;
  onClose: () => void;
  onApply: (menuUrl: string) => void;
};

const DOUBLE_TAP_WINDOW_MS = 500;
const BASE_WIDTH = 393;
const screenWidth = Dimensions.get("window").width;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

const premiumPalette = {
  background: "#FBF8F1",
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  gold: "#C6A04A",
  border: "#E4D4B6",
  borderSoft: "#EFE4D1",
  textSoft: "#6F6A61",
  disabledText: "#9B9285"
};

function PremiumButton({
  disabled,
  icon,
  label,
  onPress,
  style,
  tone = "soft"
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: "soft" | "olive";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        local.premiumButton,
        tone === "olive" ? local.premiumButtonOlive : local.premiumButtonSoft,
        disabled ? local.premiumButtonDisabled : null,
        pressed && !disabled ? local.premiumButtonPressed : null,
        style
      ]}
    >
      {icon ? <View style={local.premiumButtonIcon}>{icon}</View> : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        style={[
          local.premiumButtonText,
          tone === "olive" ? local.premiumButtonTextOlive : local.premiumButtonTextSoft,
          disabled ? local.premiumButtonTextDisabled : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RestaurantDiscoveryDialog({
  visible,
  onClose,
  onGoHome,
  onApply
}: RestaurantDiscoveryDialogProps) {
  const content = useMobileContent();
  const copy = content.restaurantDiscovery;
  const [restaurantName, setRestaurantName] = useState("");
  const [city, setCity] = useState("");
  const [candidates, setCandidates] = useState<RestaurantCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<RestaurantCandidate | null>(null);
  const [menuUrl, setMenuUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [lastTap, setLastTap] = useState<{ id: string; time: number } | null>(null);
  const sessionIdRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current += 1;
    resetDialogState();
  }, [visible]);

  function resetDialogState() {
    setRestaurantName("");
    setCity("");
    setCandidates([]);
    setSelectedCandidate(null);
    setMenuUrl("");
    setMessage("");
    setLoadingCandidates(false);
    setLoadingMenu(false);
    setLastTap(null);
  }

  function isCurrentSession(sessionId: number) {
    return visible && sessionIdRef.current === sessionId;
  }

  function closeDialog() {
    sessionIdRef.current += 1;
    resetDialogState();
    onClose();
  }

  async function showCandidates() {
    const sessionId = sessionIdRef.current;
    setLoadingCandidates(true);
    setSelectedCandidate(null);
    setMenuUrl("");
    setMessage("");

    try {
      const result = await generateRestaurantCandidates(
        { restaurantName, city },
        gustaroaiRestaurantDiscoveryProvider
      );
      if (!isCurrentSession(sessionId)) return;
      setCandidates(result);
      setMessage(result.length === 0 ? copy.noResults : "");
    } catch {
      if (!isCurrentSession(sessionId)) return;
      setCandidates([]);
      setMessage(copy.noResults);
    } finally {
      if (isCurrentSession(sessionId)) {
        setLoadingCandidates(false);
      }
    }
  }

  function handleCandidatePress(candidate: RestaurantCandidate) {
    const now = Date.now();
    const isDoubleTap = lastTap?.id === candidate.id && now - lastTap.time <= DOUBLE_TAP_WINDOW_MS;
    setLastTap({ id: candidate.id, time: now });

    if (!isDoubleTap) return;

    setSelectedCandidate(candidate);
    setMenuUrl("");
    setMessage("");
  }

  async function findMenuUrl() {
    if (!selectedCandidate) return;

    const sessionId = sessionIdRef.current;
    setLoadingMenu(true);
    setMenuUrl("");
    setMessage("");

    try {
      const source = await resolveSelectedRestaurantSource(selectedCandidate, gustaroaiRestaurantDiscoveryProvider);
      if (!isCurrentSession(sessionId)) return;
      if (source.menuUrl) {
        setMenuUrl(source.menuUrl);
        return;
      }

      setMessage(copy.noMenuUrl);
    } catch {
      if (!isCurrentSession(sessionId)) return;
      setMessage(copy.noMenuUrl);
    } finally {
      if (isCurrentSession(sessionId)) {
        setLoadingMenu(false);
      }
    }
  }

  function applyMenuUrl() {
    if (!menuUrl) return;
    const nextMenuUrl = menuUrl;
    sessionIdRef.current += 1;
    resetDialogState();
    onApply(nextMenuUrl);
  }

  function goHomeFromDialog() {
    closeDialog();
    onGoHome?.();
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={closeDialog}>
      <View style={local.modalShell}>
        <Screen contentContainerStyle={local.screenContent} showScrollHint scrollToTopKey={visible ? "restaurant-discovery" : undefined}>
          <View style={local.header}>
            <GustaroHelp common={content.help.common} topic={content.help.menuDiscovery} style={local.headerHelpButton} />
            <View style={local.headerAccent}>
              <View style={local.headerLine} />
              <Feather color={premiumPalette.gold} name="search" size={s(20)} />
              <View style={local.headerLine} />
            </View>
            <Text style={local.title}>{copy.title}</Text>
          </View>

          <View style={local.card}>
            <View style={local.cardHeader}>
              <View style={local.cardIcon}>
                <MaterialCommunityIcons color={premiumPalette.gold} name="map-marker-radius-outline" size={s(23)} />
              </View>
              <Text style={local.cardTitle}>{copy.searchCardTitle}</Text>
            </View>

            <View style={local.fieldGroup}>
              <Text style={local.label}>{copy.restaurantNameLabel}</Text>
              <TextInput
                testID="restaurant-discovery-name-input"
                value={restaurantName}
                onChangeText={setRestaurantName}
                style={local.input}
                autoCapitalize="words"
                autoCorrect={false}
                placeholderTextColor={premiumPalette.disabledText}
              />
            </View>

            <View style={local.fieldGroup}>
              <Text style={local.label}>{copy.cityLabel}</Text>
              <TextInput
                testID="restaurant-discovery-city-input"
                value={city}
                onChangeText={setCity}
                style={local.input}
                autoCapitalize="words"
                autoCorrect={false}
                placeholderTextColor={premiumPalette.disabledText}
              />
            </View>

            <PremiumButton
              label={loadingCandidates ? copy.loading : copy.showButton}
              onPress={showCandidates}
              disabled={loadingCandidates || !restaurantName.trim() || !city.trim()}
              tone="olive"
              icon={<Feather color={premiumPalette.surface} name="arrow-right" size={s(18)} />}
            />

            {loadingCandidates ? <ActivityIndicator color={premiumPalette.gold} style={local.loader} /> : null}

            {candidates.length > 0 ? (
              <View
                testID="restaurant-discovery-candidate-list"
                style={local.list}
              >
                {candidates.map((item) => (
                  <Pressable
                    key={item.id}
                    testID="restaurant-discovery-candidate"
                    onPress={() => handleCandidatePress(item)}
                    style={[local.candidate, selectedCandidate?.id === item.id && local.candidateSelected]}
                  >
                    <Text style={local.candidateName}>{item.name}</Text>
                    <Text style={local.candidateMeta}>{[item.address, item.websiteUrl].filter(Boolean).join(" - ")}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={local.card}>
            <View style={local.cardHeader}>
              <View style={local.cardIcon}>
                <MaterialCommunityIcons color={premiumPalette.gold} name="book-open-variant" size={s(22)} />
              </View>
              <Text style={local.cardTitle}>{copy.applyCardTitle}</Text>
            </View>

            <View style={local.fieldGroup}>
              <Text style={local.label}>{copy.restaurantOutputLabel}</Text>
              <TextInput
                testID="restaurant-discovery-selected-restaurant"
                value={selectedCandidate ? [selectedCandidate.name, selectedCandidate.city].filter(Boolean).join(", ") : ""}
                editable={false}
                style={[local.input, local.inputReadonly]}
                placeholderTextColor={premiumPalette.disabledText}
              />
            </View>

            <PremiumButton
              label={loadingMenu ? copy.loading : copy.menuButton}
              onPress={findMenuUrl}
              disabled={loadingMenu || !selectedCandidate}
              icon={<MaterialCommunityIcons color={premiumPalette.gold} name="book-open-variant" size={s(18)} />}
            />

            <View style={local.fieldGroup}>
              <Text style={local.label}>{copy.linkOutputLabel}</Text>
              <TextInput
                testID="restaurant-discovery-link"
                value={menuUrl}
                editable={false}
                style={[local.input, local.inputReadonly]}
                placeholderTextColor={premiumPalette.disabledText}
              />
            </View>

            {message ? <Text style={local.message}>{message}</Text> : null}

            <View style={local.footerRow}>
              <PremiumButton label={copy.backButton} onPress={closeDialog} style={local.footerButton} />
              <PremiumButton
                label={copy.applyButton}
                onPress={applyMenuUrl}
                disabled={!menuUrl}
                tone="olive"
                style={local.footerButton}
              />
            </View>
          </View>
        </Screen>

        {onGoHome ? <BottomTabs onGoHome={goHomeFromDialog} /> : null}
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  modalShell: {
    backgroundColor: premiumPalette.background,
    flex: 1
  },
  screenContent: {
    backgroundColor: premiumPalette.background,
    paddingBottom: s(28),
    paddingHorizontal: s(24),
    paddingTop: s(30)
  },
  header: {
    marginBottom: s(22),
    position: "relative"
  },
  headerHelpButton: {
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 5
  },
  headerAccent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: s(14)
  },
  headerLine: {
    backgroundColor: premiumPalette.border,
    height: 1,
    marginHorizontal: s(12),
    width: s(62)
  },
  title: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(38),
    fontWeight: "800",
    lineHeight: fs(46),
    textAlign: "center"
  },
  card: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(28),
    borderWidth: 1,
    marginBottom: s(18),
    padding: s(20),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(10) },
    shadowOpacity: 0.07,
    shadowRadius: s(18)
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: s(12),
    marginBottom: s(18)
  },
  cardIcon: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(18),
    borderWidth: 1,
    height: s(44),
    justifyContent: "center",
    width: s(44)
  },
  cardTitle: {
    color: premiumPalette.oliveDeep,
    flex: 1,
    fontSize: fs(20),
    fontWeight: "800",
    lineHeight: fs(25)
  },
  fieldGroup: {
    marginBottom: s(14)
  },
  label: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(16),
    fontWeight: "700",
    lineHeight: fs(21),
    marginBottom: s(7)
  },
  input: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border,
    borderRadius: s(20),
    borderWidth: 1,
    color: premiumPalette.oliveDeep,
    fontSize: fs(16),
    lineHeight: fs(22),
    minHeight: s(58),
    paddingHorizontal: s(16),
    paddingVertical: s(12)
  },
  inputReadonly: {
    color: premiumPalette.textSoft
  },
  premiumButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: s(9),
    justifyContent: "center",
    marginBottom: s(12),
    minHeight: s(58),
    paddingHorizontal: s(16),
    paddingVertical: s(12)
  },
  premiumButtonSoft: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border
  },
  premiumButtonOlive: {
    backgroundColor: premiumPalette.olive,
    borderColor: premiumPalette.olive,
    shadowColor: premiumPalette.olive,
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.12,
    shadowRadius: s(14),
    elevation: 2
  },
  premiumButtonDisabled: {
    backgroundColor: "#EFE8DA",
    borderColor: "#E3D7C3",
    opacity: 0.72,
    shadowOpacity: 0
  },
  premiumButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
  },
  premiumButtonIcon: {
    alignItems: "center",
    justifyContent: "center"
  },
  premiumButtonText: {
    flexShrink: 1,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21),
    textAlign: "center"
  },
  premiumButtonTextSoft: {
    color: premiumPalette.oliveDeep
  },
  premiumButtonTextOlive: {
    color: premiumPalette.surface
  },
  premiumButtonTextDisabled: {
    color: premiumPalette.disabledText
  },
  loader: {
    marginBottom: s(12)
  },
  list: {
    marginBottom: s(14),
    maxHeight: s(208)
  },
  candidate: {
    backgroundColor: "rgba(255, 253, 248, 0.84)",
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(18),
    borderWidth: 1,
    marginBottom: s(10),
    paddingHorizontal: s(14),
    paddingVertical: s(12)
  },
  candidateSelected: {
    backgroundColor: "rgba(247, 241, 231, 0.96)",
    borderColor: premiumPalette.gold
  },
  candidateName: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21)
  },
  candidateMeta: {
    color: premiumPalette.textSoft,
    fontSize: fs(13),
    fontWeight: "500",
    lineHeight: fs(18),
    marginTop: s(4)
  },
  message: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "600",
    lineHeight: fs(20),
    marginBottom: s(14)
  },
  footerRow: {
    flexDirection: "row",
    gap: s(11)
  },
  footerButton: {
    flex: 1,
    marginBottom: 0,
    minHeight: s(58)
  }
});
