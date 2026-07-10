import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
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
  type ExternalMenuCandidate,
  type RestaurantCandidate
} from "../../gustaroai/restaurantDiscoveryRoutine";
import { ExternalMenuSourceConfirmation } from "./ExternalMenuSourceConfirmation";
import { BottomTabs } from "../../app/navigation/PickTabs";
import { useMobileContent } from "../../content/useMobileContent";
import { radius } from "../../theme/tokens";
import { GustaroHelp } from "../ui/GustaroHelp";
import { Screen } from "../ui/Screen";

type RestaurantDiscoveryDialogProps = {
  onGoHome?: () => void;
  visible: boolean;
  onClose: () => void;
  onApply: (menuUrl: string, restaurantName?: string, menuSourceDomain?: string, menuUrls?: string[]) => void;
};

const BASE_WIDTH = 393;
const DOUBLE_TAP_DELAY_MS = 450;
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
const COUNTRY_OPTIONS = [
  "AL",
  "AD",
  "AM",
  "AT",
  "AZ",
  "BY",
  "BE",
  "BA",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "GE",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IT",
  "XK",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "MD",
  "MC",
  "ME",
  "NL",
  "MK",
  "NO",
  "PL",
  "PT",
  "RO",
  "RU",
  "SM",
  "RS",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "TR",
  "UA",
  "GB",
  "VA",
  "US",
  "CA",
  "CN",
  "JP",
  "AU",
  "BR",
  "MX",
  "AR",
  "CL",
  "IN",
  "TH",
  "VN",
  "KR",
  "SG",
  "AE",
  "ZA"
] as const;
type RestaurantDiscoveryCountryCode = (typeof COUNTRY_OPTIONS)[number];
const DEFAULT_COUNTRY: RestaurantDiscoveryCountryCode = "DE";

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
  const [country, setCountry] = useState<RestaurantDiscoveryCountryCode>(DEFAULT_COUNTRY);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [candidates, setCandidates] = useState<RestaurantCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<RestaurantCandidate | null>(null);
  const [highlightedCandidate, setHighlightedCandidate] = useState<RestaurantCandidate | null>(null);
  const [menuUrl, setMenuUrl] = useState("");
  const [menuUrls, setMenuUrls] = useState<string[]>([]);
  const [externalMenuCandidate, setExternalMenuCandidate] = useState<ExternalMenuCandidate | null>(null);
  const [confirmedExternalMenuProviderDomain, setConfirmedExternalMenuProviderDomain] = useState("");
  const [message, setMessage] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [selectionHintY, setSelectionHintY] = useState(0);
  const [selectionHintScrollKey, setSelectionHintScrollKey] = useState(0);
  const [selectionHintScrollRequestKey, setSelectionHintScrollRequestKey] = useState(0);
  const [applyCardY, setApplyCardY] = useState(0);
  const [applyCardScrollKey, setApplyCardScrollKey] = useState(0);
  const [applyCardScrollRequestKey, setApplyCardScrollRequestKey] = useState(0);
  const sessionIdRef = useRef(0);
  const menuLookupIdRef = useRef(0);
  const lastCandidateTapRef = useRef<{ id: string; timestamp: number } | null>(null);
  const restaurantNameRef = useRef("");
  const cityRef = useRef("");
  const countryRef = useRef<RestaurantDiscoveryCountryCode>(DEFAULT_COUNTRY);
  const visibleCountryOptions = COUNTRY_OPTIONS.filter((option) =>
    matchesCountrySearch(option, copy.countries[option], countrySearch)
  );

  useEffect(() => {
    sessionIdRef.current += 1;
    resetDialogState();
  }, [visible]);

  useEffect(() => {
    if (selectionHintScrollRequestKey > 0 && selectionHintY > 0) {
      setSelectionHintScrollKey(selectionHintScrollRequestKey);
    }
  }, [selectionHintScrollRequestKey, selectionHintY]);

  useEffect(() => {
    if (applyCardScrollRequestKey > 0 && applyCardY > 0) {
      setApplyCardScrollKey(applyCardScrollRequestKey);
    }
  }, [applyCardScrollRequestKey, applyCardY]);

  function resetDialogState() {
    restaurantNameRef.current = "";
    cityRef.current = "";
    countryRef.current = DEFAULT_COUNTRY;
    setRestaurantName("");
    setCity("");
    setCountry(DEFAULT_COUNTRY);
    setCountryMenuOpen(false);
    setCountrySearch("");
    setCandidates([]);
    setSelectedCandidate(null);
    setHighlightedCandidate(null);
    setMenuUrl("");
    setMenuUrls([]);
    setExternalMenuCandidate(null);
    setConfirmedExternalMenuProviderDomain("");
    setMessage("");
    setLoadingCandidates(false);
    setLoadingMenu(false);
    setSelectionHintY(0);
    setSelectionHintScrollKey(0);
    setSelectionHintScrollRequestKey(0);
    setApplyCardY(0);
    setApplyCardScrollKey(0);
    setApplyCardScrollRequestKey(0);
    menuLookupIdRef.current += 1;
  }

  function isCurrentSession(sessionId: number) {
    return visible && sessionIdRef.current === sessionId;
  }

  function isCurrentMenuLookup(sessionId: number, lookupId: number) {
    return isCurrentSession(sessionId) && menuLookupIdRef.current === lookupId;
  }

  function closeDialog() {
    sessionIdRef.current += 1;
    resetDialogState();
    onClose();
  }

  function clearSearchStateForInputChange() {
    sessionIdRef.current += 1;
    menuLookupIdRef.current += 1;
    setCandidates([]);
    setSelectedCandidate(null);
    setHighlightedCandidate(null);
    setMenuUrl("");
    setMenuUrls([]);
    setExternalMenuCandidate(null);
    setConfirmedExternalMenuProviderDomain("");
    setMessage("");
    setLoadingCandidates(false);
    setLoadingMenu(false);
    setSelectionHintY(0);
    setSelectionHintScrollKey(0);
    setSelectionHintScrollRequestKey(0);
    setApplyCardY(0);
    setApplyCardScrollKey(0);
    setApplyCardScrollRequestKey(0);
    lastCandidateTapRef.current = null;
  }

  function changeRestaurantName(nextRestaurantName: string) {
    restaurantNameRef.current = nextRestaurantName;
    setRestaurantName(nextRestaurantName);
    clearSearchStateForInputChange();
  }

  function changeCity(nextCity: string) {
    cityRef.current = nextCity;
    setCity(nextCity);
    clearSearchStateForInputChange();
  }

  async function showCandidates() {
    sessionIdRef.current += 1;
    const sessionId = sessionIdRef.current;
    const queryRestaurantName = restaurantNameRef.current.trim();
    const queryCity = cityRef.current.trim();
    const queryCountry = countryRef.current;
    if (!queryRestaurantName || !queryCity) return;

    menuLookupIdRef.current += 1;
    Keyboard.dismiss();
    setCountryMenuOpen(false);
    setLoadingCandidates(true);
    setSelectedCandidate(null);
    setHighlightedCandidate(null);
    setMenuUrl("");
    setMenuUrls([]);
    setExternalMenuCandidate(null);
    setConfirmedExternalMenuProviderDomain("");
    lastCandidateTapRef.current = null;
    setMessage("");

    try {
      const result = await generateRestaurantCandidates(
        { restaurantName: queryRestaurantName, city: queryCity, country: queryCountry },
        gustaroaiRestaurantDiscoveryProvider
      );
      if (!isCurrentSession(sessionId)) return;
      setCandidates(result);
      setMessage(result.length === 0 ? copy.noResults : "");
      if (result.length > 0) {
        setSelectionHintScrollRequestKey((current) => current + 1);
      }
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
    Keyboard.dismiss();
    setCountryMenuOpen(false);

    const now = Date.now();
    const lastTap = lastCandidateTapRef.current;
    lastCandidateTapRef.current = { id: candidate.id, timestamp: now };

    if (lastTap?.id === candidate.id && now - lastTap.timestamp <= DOUBLE_TAP_DELAY_MS) {
      confirmRestaurantCandidate(candidate);
      return;
    }

    setHighlightedCandidate(candidate);
  }

  function confirmRestaurantCandidate(candidate: RestaurantCandidate) {
    setSelectedCandidate(candidate);
    setHighlightedCandidate(candidate);
    setMenuUrl("");
    setMenuUrls([]);
    setExternalMenuCandidate(null);
    setConfirmedExternalMenuProviderDomain("");
    setMessage(copy.menuSearchLoading);
    setApplyCardScrollRequestKey((current) => current + 1);
    void findMenuUrl(candidate);
  }

  async function findMenuUrl(candidate: RestaurantCandidate) {
    const sessionId = sessionIdRef.current;
    const lookupId = menuLookupIdRef.current + 1;
    menuLookupIdRef.current = lookupId;
    setLoadingMenu(true);
    setMenuUrl("");
    setMenuUrls([]);
    setExternalMenuCandidate(null);
    setConfirmedExternalMenuProviderDomain("");
    setMessage(copy.menuSearchLoading);

    try {
      const source = await resolveSelectedRestaurantSource(candidate, gustaroaiRestaurantDiscoveryProvider);
      if (!isCurrentMenuLookup(sessionId, lookupId)) return;
      if (source.menuUrl) {
        setMenuUrl(source.menuUrl);
        setMenuUrls(source.menuUrls?.length ? source.menuUrls : [source.menuUrl]);
        setMessage("");
        setApplyCardScrollRequestKey((current) => current + 1);
        return;
      }

      if (source.externalMenuCandidate) {
        setExternalMenuCandidate(source.externalMenuCandidate);
        setMessage("");
        setApplyCardScrollRequestKey((current) => current + 1);
        return;
      }

      setMessage(copy.noMenuUrl);
    } catch {
      if (!isCurrentMenuLookup(sessionId, lookupId)) return;
      setMessage(copy.noMenuUrl);
    } finally {
      if (isCurrentMenuLookup(sessionId, lookupId)) {
        setLoadingMenu(false);
      }
    }
  }

  function applyMenuUrl() {
    if (!menuUrl) return;
    const nextMenuUrl = menuUrl;
    const nextMenuUrls = menuUrls.length ? menuUrls : [menuUrl];
    const nextRestaurantName = selectedCandidate?.name.trim();
    const nextMenuSourceDomain = confirmedExternalMenuProviderDomain.trim();
    sessionIdRef.current += 1;
    resetDialogState();
    onApply(nextMenuUrl, nextRestaurantName || undefined, nextMenuSourceDomain || undefined, nextMenuUrls);
  }

  function confirmExternalMenuCandidate(candidate: ExternalMenuCandidate) {
    setMenuUrl(candidate.url);
    setMenuUrls([candidate.url]);
    setConfirmedExternalMenuProviderDomain(candidate.providerDomain);
    setExternalMenuCandidate(null);
    setMessage("");
    setApplyCardScrollRequestKey((current) => current + 1);
  }

  function rejectExternalMenuCandidate() {
    setExternalMenuCandidate(null);
    setMessage(copy.noMenuUrl);
  }

  function goHomeFromDialog() {
    closeDialog();
    onGoHome?.();
  }

  function selectCountry(nextCountry: RestaurantDiscoveryCountryCode) {
    Keyboard.dismiss();
    sessionIdRef.current += 1;
    countryRef.current = nextCountry;
    setCountry(nextCountry);
    setCountryMenuOpen(false);
    setCountrySearch("");
    setCandidates([]);
    setSelectedCandidate(null);
    setHighlightedCandidate(null);
    setMenuUrl("");
    setMenuUrls([]);
    setExternalMenuCandidate(null);
    setConfirmedExternalMenuProviderDomain("");
    lastCandidateTapRef.current = null;
    setMessage("");
    setSelectionHintY(0);
    setSelectionHintScrollKey(0);
    setSelectionHintScrollRequestKey(0);
    setApplyCardY(0);
    setApplyCardScrollKey(0);
    setApplyCardScrollRequestKey(0);
    menuLookupIdRef.current += 1;
  }

  function cancelSearch() {
    sessionIdRef.current += 1;
    menuLookupIdRef.current += 1;
    setLoadingCandidates(false);
    setLoadingMenu(false);
    setExternalMenuCandidate(null);
    setMessage("");
  }

  function handleSelectionHintLayout(event: LayoutChangeEvent) {
    setSelectionHintY(event.nativeEvent.layout.y);
  }

  function handleApplyCardLayout(event: LayoutChangeEvent) {
    setApplyCardY(event.nativeEvent.layout.y);
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={closeDialog}>
      <View style={local.modalShell}>
        <Screen
          contentContainerStyle={local.screenContent}
          showScrollHint
          scrollToOffsetKey={
            applyCardScrollKey
              ? `apply-card-${applyCardScrollKey}`
              : selectionHintScrollKey
                ? `selection-hint-${selectionHintScrollKey}`
                : undefined
          }
          scrollToOffsetY={applyCardScrollKey
            ? Math.max(applyCardY - s(12), 0)
            : Math.max(selectionHintY - s(12), 0)}
          scrollToTopKey={visible ? "restaurant-discovery" : undefined}
        >
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
                onChangeText={changeRestaurantName}
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
                onChangeText={changeCity}
                style={local.input}
                autoCapitalize="words"
                autoCorrect={false}
                placeholderTextColor={premiumPalette.disabledText}
              />
            </View>

            <View style={local.fieldGroup}>
              <Text style={local.label}>{copy.countryLabel}</Text>
              <Pressable
                accessibilityRole="button"
                testID="restaurant-discovery-country-select"
                onPress={() => {
                  Keyboard.dismiss();
                  setCountrySearch("");
                  setCountryMenuOpen((open) => !open);
                }}
                style={({ pressed }) => [local.countrySelect, pressed ? local.countrySelectPressed : null]}
              >
                <Text style={local.countrySelectText}>{copy.countries[country]}</Text>
                <Feather color={premiumPalette.gold} name={countryMenuOpen ? "chevron-up" : "chevron-down"} size={s(18)} />
              </Pressable>
            </View>

            <PremiumButton
              label={loadingCandidates ? copy.loading : copy.showButton}
              onPress={showCandidates}
              disabled={loadingCandidates || !restaurantName.trim() || !city.trim()}
              tone="olive"
              icon={<Feather color={premiumPalette.surface} name="arrow-right" size={s(18)} />}
            />

            {loadingCandidates ? <ActivityIndicator color={premiumPalette.gold} style={local.loader} /> : null}
            {loadingCandidates ? (
              <PremiumButton label={copy.cancelSearchButton} onPress={cancelSearch} style={local.cancelButton} />
            ) : null}

            {candidates.length > 0 ? (
              <>
                <Text onLayout={handleSelectionHintLayout} style={local.selectionHint}>{copy.selectRestaurantHint}</Text>
                <View
                  testID="restaurant-discovery-candidate-list"
                  style={local.list}
                >
                  {candidates.map((item) => (
                    <Pressable
                      key={item.id}
                      testID="restaurant-discovery-candidate"
                      onPress={() => handleCandidatePress(item)}
                      style={[
                        local.candidate,
                        (highlightedCandidate?.id === item.id || selectedCandidate?.id === item.id) && local.candidateSelected
                      ]}
                    >
                      <Text style={local.candidateName}>{item.name}</Text>
                      <Text style={local.candidateMeta}>{[item.address, item.websiteUrl].filter(Boolean).join(" - ")}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>

          <View onLayout={handleApplyCardLayout} style={local.card}>
            <View style={local.cardHeader}>
              <View style={local.cardIcon}>
                <MaterialCommunityIcons color={premiumPalette.gold} name="book-open-variant" size={s(22)} />
              </View>
              <Text style={local.cardTitle}>{copy.applyCardTitle}</Text>
            </View>

            {menuUrl ? <Text style={local.applyHint}>{copy.applyHint}</Text> : null}
            {confirmedExternalMenuProviderDomain ? (
              <Text style={local.externalSourceHint}>
                {copy.externalMenuSourceLine.replace("{provider}", confirmedExternalMenuProviderDomain)}
              </Text>
            ) : null}

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

            {loadingMenu ? <ActivityIndicator color={premiumPalette.gold} style={local.loader} /> : null}
            {loadingMenu ? (
              <PremiumButton label={copy.cancelSearchButton} onPress={cancelSearch} style={local.cancelButton} />
            ) : null}

            <View style={local.fieldGroup}>
              <Text style={local.label}>{copy.linkOutputLabel}</Text>
              <TextInput
                testID="restaurant-discovery-link"
                value={menuUrl}
                editable={false}
                multiline
                scrollEnabled={false}
                style={[local.input, local.inputReadonly, local.linkInput]}
                placeholderTextColor={premiumPalette.disabledText}
                textAlignVertical="top"
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

        <Modal animationType="fade" transparent visible={countryMenuOpen} onRequestClose={() => setCountryMenuOpen(false)}>
          <View style={local.countryPickerOverlay}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCountryMenuOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <View style={local.countryPickerSheet}>
              <View style={local.countryPickerHeader}>
                <Text style={local.countryPickerTitle}>{copy.countryLabel}</Text>
                <Pressable accessibilityRole="button" onPress={() => setCountryMenuOpen(false)} style={local.countryPickerClose}>
                  <Feather color={premiumPalette.oliveDeep} name="x" size={s(20)} />
                </Pressable>
              </View>
              <View style={local.countrySearchBox}>
                <Feather color={premiumPalette.textSoft} name="search" size={s(17)} />
                <TextInput
                  testID="restaurant-discovery-country-search"
                  value={countrySearch}
                  onChangeText={setCountrySearch}
                  style={local.countrySearchInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder={copy.countrySearchPlaceholder}
                  placeholderTextColor={premiumPalette.disabledText}
                />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={local.countryPickerScroll}>
                {visibleCountryOptions.map((option) => {
                  const active = option === country;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      testID="restaurant-discovery-country-option"
                      onPress={() => selectCountry(option)}
                      style={[local.countryOption, active ? local.countryOptionActive : null]}
                    >
                      <Text style={[local.countryOptionText, active ? local.countryOptionTextActive : null]}>
                        {copy.countries[option]}
                      </Text>
                    </Pressable>
                  );
                })}
                {visibleCountryOptions.length === 0 ? (
                  <Text style={local.countryNoResults}>{copy.countrySearchNoResults}</Text>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <ExternalMenuSourceConfirmation
          candidate={externalMenuCandidate}
          restaurantName={selectedCandidate?.name ?? ""}
          visible={Boolean(externalMenuCandidate)}
          onConfirm={confirmExternalMenuCandidate}
          onReject={rejectExternalMenuCandidate}
        />

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
  linkInput: {
    minHeight: s(84)
  },
  countrySelect: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border,
    borderRadius: s(20),
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: s(58),
    paddingHorizontal: s(16),
    paddingVertical: s(12)
  },
  countrySelectPressed: {
    opacity: 0.86
  },
  countrySelectText: {
    color: premiumPalette.oliveDeep,
    flex: 1,
    fontSize: fs(16),
    fontWeight: "700",
    lineHeight: fs(22)
  },
  countryPickerOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(24, 44, 27, 0.34)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: s(24)
  },
  countryPickerSheet: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(24),
    borderWidth: 1,
    maxHeight: Math.round(Dimensions.get("window").height * 0.68),
    overflow: "hidden",
    width: "100%"
  },
  countryPickerHeader: {
    alignItems: "center",
    borderBottomColor: premiumPalette.borderSoft,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: s(16),
    paddingVertical: s(14)
  },
  countryPickerTitle: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(18),
    fontWeight: "800",
    lineHeight: fs(23)
  },
  countryPickerClose: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(16),
    borderWidth: 1,
    height: s(34),
    justifyContent: "center",
    width: s(34)
  },
  countrySearchBox: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(18),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(9),
    marginHorizontal: s(14),
    marginVertical: s(12),
    minHeight: s(48),
    paddingHorizontal: s(13)
  },
  countrySearchInput: {
    color: premiumPalette.oliveDeep,
    flex: 1,
    fontSize: fs(15),
    fontWeight: "700",
    lineHeight: fs(20),
    paddingVertical: s(8)
  },
  countryPickerScroll: {
    maxHeight: Math.round(Dimensions.get("window").height * 0.56)
  },
  countryOption: {
    borderBottomColor: premiumPalette.borderSoft,
    borderBottomWidth: 1,
    paddingHorizontal: s(14),
    paddingVertical: s(12)
  },
  countryOptionActive: {
    backgroundColor: premiumPalette.surfaceSoft
  },
  countryOptionText: {
    color: premiumPalette.textSoft,
    fontSize: fs(15),
    fontWeight: "700",
    lineHeight: fs(20)
  },
  countryOptionTextActive: {
    color: premiumPalette.oliveDeep
  },
  countryNoResults: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "700",
    lineHeight: fs(20),
    paddingHorizontal: s(16),
    paddingVertical: s(14),
    textAlign: "center"
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
  cancelButton: {
    marginBottom: s(14)
  },
  selectionHint: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: s(16),
    borderWidth: 1,
    color: premiumPalette.oliveDeep,
    fontSize: fs(14),
    fontWeight: "700",
    lineHeight: fs(20),
    marginBottom: s(12),
    paddingHorizontal: s(14),
    paddingVertical: s(10)
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
  applyHint: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "700",
    lineHeight: fs(20),
    marginBottom: s(14)
  },
  externalSourceHint: {
    color: premiumPalette.textSoft,
    fontSize: fs(13),
    fontWeight: "700",
    lineHeight: fs(18),
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

function matchesCountrySearch(code: string, label: string, search: string) {
  const query = normalizeCountrySearchText(search);
  if (!query) return true;

  return normalizeCountrySearchText(code).startsWith(query) ||
    normalizeCountrySearchText(label).startsWith(query);
}

function normalizeCountrySearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
