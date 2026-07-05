import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  generateRestaurantCandidates,
  gustaroaiRestaurantDiscoveryProvider,
  resolveSelectedRestaurantSource,
  type RestaurantCandidate
} from "../../gustaroai/restaurantDiscoveryRoutine";
import { BottomTabs } from "../../app/navigation/PickTabs";
import { useMobileContent } from "../../content/useMobileContent";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";
import { ActionButton } from "../ui/ActionButton";
import { Screen } from "../ui/Screen";
import { Surface } from "../ui/Surface";
import {
  detectRestaurant,
  type RestaurantCandidate as DetectedRestaurantCandidate,
  type RestaurantDetectorRuntime
} from "../../restaurant-detector";

type RestaurantDiscoveryDialogProps = {
  onGoHome?: () => void;
  visible: boolean;
  onClose: () => void;
  onApply: (menuUrl: string) => void;
  restaurantDetector?: RestaurantDetectorRuntime;
};

const DOUBLE_TAP_WINDOW_MS = 500;

export function RestaurantDiscoveryDialog({
  visible,
  onClose,
  onGoHome,
  onApply,
  restaurantDetector
}: RestaurantDiscoveryDialogProps) {
  const content = useMobileContent();
  const copy = content.restaurantDiscovery;
  const [restaurantName, setRestaurantName] = useState("");
  const [city, setCity] = useState("");
  const [detectedCandidates, setDetectedCandidates] = useState<DetectedRestaurantCandidate[]>([]);
  const [candidates, setCandidates] = useState<RestaurantCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<RestaurantCandidate | null>(null);
  const [menuUrl, setMenuUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loadingDetector, setLoadingDetector] = useState(false);
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
    setDetectedCandidates([]);
    setCandidates([]);
    setSelectedCandidate(null);
    setMenuUrl("");
    setMessage("");
    setLoadingDetector(false);
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

  async function detectNearbyRestaurant() {
    if (!restaurantDetector) {
      setDetectedCandidates([]);
      setMessage(copy.detectorUnavailable);
      return;
    }

    const sessionId = sessionIdRef.current;
    setLoadingDetector(true);
    setDetectedCandidates([]);
    setSelectedCandidate(null);
    setMenuUrl("");
    setMessage("");

    try {
      const location = await restaurantDetector.getCurrentLocation();
      const result = await detectRestaurant(
        {
          ...location,
          hint: restaurantName
        },
        restaurantDetector.provider
      );
      if (!isCurrentSession(sessionId)) return;

      setDetectedCandidates(result.candidates);
      if (result.confidence === "low" || result.candidates.length === 0) {
        setMessage(copy.detectorLowConfidence);
      }
    } catch {
      if (!isCurrentSession(sessionId)) return;
      setDetectedCandidates([]);
      setMessage(copy.detectorFailed);
    } finally {
      if (isCurrentSession(sessionId)) {
        setLoadingDetector(false);
      }
    }
  }

  function applyDetectedRestaurant(candidate: DetectedRestaurantCandidate) {
    setRestaurantName(candidate.name);
    setCity(inferCityFromAddress(candidate.address));
    setDetectedCandidates([]);
    setCandidates([]);
    setSelectedCandidate(null);
    setMenuUrl("");
    setMessage(copy.detectorApplied);
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

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={closeDialog}>
      <View style={local.modalShell}>
        <Screen>
          <Text style={local.title}>{copy.title}</Text>

        <Surface style={local.panel}>
          <ActionButton
            label={loadingDetector ? copy.loading : copy.detectNearbyButton}
            onPress={detectNearbyRestaurant}
            disabled={loadingDetector}
            variant="secondary"
            style={local.action}
          />

          {loadingDetector ? <ActivityIndicator color={semanticColors.accentActive} /> : null}

          {detectedCandidates.length > 0 ? (
            <FlatList
              testID="restaurant-detector-candidate-list"
              data={detectedCandidates}
              keyExtractor={(item, index) => item.externalId ?? `${item.source}-${item.name}-${index}`}
              style={local.list}
              renderItem={({ item }) => (
                <Pressable
                  testID="restaurant-detector-candidate"
                  onPress={() => applyDetectedRestaurant(item)}
                  style={local.candidate}
                >
                  <Text style={local.candidateName}>{item.name}</Text>
                  <Text style={local.candidateMeta}>
                    {[item.address, formatDetectorDistance(item.distanceMeters), copy.detectorConfirmHint]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Pressable>
              )}
            />
          ) : null}

          <Text style={local.label}>{copy.restaurantNameLabel}</Text>
          <TextInput
            testID="restaurant-discovery-name-input"
            value={restaurantName}
            onChangeText={setRestaurantName}
            style={local.input}
            autoCapitalize="words"
            autoCorrect={false}
          />

          <Text style={local.label}>{copy.cityLabel}</Text>
          <TextInput
            testID="restaurant-discovery-city-input"
            value={city}
            onChangeText={setCity}
            style={local.input}
            autoCapitalize="words"
            autoCorrect={false}
          />

          <ActionButton
            label={loadingCandidates ? copy.loading : copy.showButton}
            onPress={showCandidates}
            disabled={loadingCandidates || !restaurantName.trim() || !city.trim()}
            variant="secondary"
            style={local.action}
          />
        </Surface>

        {loadingCandidates ? <ActivityIndicator color={semanticColors.accentActive} /> : null}

        {candidates.length > 0 ? (
          <FlatList
            testID="restaurant-discovery-candidate-list"
            data={candidates}
            keyExtractor={(item) => item.id}
            style={local.list}
            renderItem={({ item }) => (
              <Pressable
                testID="restaurant-discovery-candidate"
                onPress={() => handleCandidatePress(item)}
                style={[local.candidate, selectedCandidate?.id === item.id && local.candidateSelected]}
              >
                <Text style={local.candidateName}>{item.name}</Text>
                <Text style={local.candidateMeta}>{[item.address, item.websiteUrl].filter(Boolean).join(" Â· ")}</Text>
              </Pressable>
            )}
          />
        ) : null}

        <Surface style={local.panel}>
          <Text style={local.label}>{copy.restaurantOutputLabel}</Text>
          <TextInput
            testID="restaurant-discovery-selected-restaurant"
            value={selectedCandidate ? [selectedCandidate.name, selectedCandidate.city].filter(Boolean).join(", ") : ""}
            editable={false}
            style={local.input}
          />

          <ActionButton
            label={loadingMenu ? copy.loading : copy.menuButton}
            onPress={findMenuUrl}
            disabled={loadingMenu || !selectedCandidate}
            variant="secondary"
            style={local.action}
          />

          <Text style={local.label}>{copy.linkOutputLabel}</Text>
          <TextInput testID="restaurant-discovery-link" value={menuUrl} editable={false} style={local.input} />

          {message ? <Text style={local.message}>{message}</Text> : null}

          <View style={local.footerRow}>
            <ActionButton label={copy.backButton} onPress={closeDialog} variant="secondary" style={local.footerButton} />
            <ActionButton
              label={copy.applyButton}
              onPress={applyMenuUrl}
              disabled={!menuUrl}
              variant="accent"
              style={local.footerButton}
            />
          </View>
        </Surface>
        </Screen>

        {onGoHome ? <BottomTabs onGoHome={goHomeFromDialog} /> : null}
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  modalShell: {
    flex: 1
  },
  title: {
    color: semanticColors.text,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    lineHeight: typography.screenTitle.lineHeight,
    marginBottom: spacing.md
  },
  panel: {
    padding: spacing.md
  },
  label: {
    color: semanticColors.text,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.xs
  },
  input: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: semanticColors.text,
    fontSize: 16,
    lineHeight: 21,
    marginBottom: spacing.md,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  action: {
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
    paddingVertical: spacing.md
  },
  list: {
    marginBottom: spacing.md,
    maxHeight: 220
  },
  candidate: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md
  },
  candidateSelected: {
    backgroundColor: semanticColors.accentSoft,
    borderColor: semanticColors.accent
  },
  candidateName: {
    color: semanticColors.text,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight
  },
  candidateMeta: {
    color: semanticColors.textMuted,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginTop: spacing.xxs
  },
  message: {
    color: semanticColors.warningText,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginBottom: spacing.md
  },
  footerRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  footerButton: {
    borderRadius: radius.pill,
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  }
});

function inferCityFromAddress(address: string | undefined) {
  const parts = address?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.length >= 2 ? parts[1] ?? "" : parts[0] ?? "";
}

function formatDetectorDistance(distanceMeters: number | undefined) {
  if (typeof distanceMeters !== "number") return "";
  if (distanceMeters < 1000) return `${distanceMeters} m`;

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}
