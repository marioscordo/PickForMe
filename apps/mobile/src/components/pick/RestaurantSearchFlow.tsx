import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PickForMeApiError } from "../../api/apiClient";
import { resolveRestaurantMenuSource, searchRestaurantCandidates } from "../../api/pickformeApi";
import { useMobileContent } from "../../content/useMobileContent";
import { colors, styles } from "../../theme/styles";
import { GustaroHelp } from "../ui/GustaroHelp";
import type { RestaurantDiscoveryCandidate } from "../../types/recommendations";

type RestaurantSearchFlowStep = "form" | "results" | "confirm" | "resolving";

type RestaurantSearchFlowProps = {
  // Wird nur aufgerufen, wenn Schritt 2 (Speisekarten-Isolierung) eine
  // tatsaechlich nutzbare Quelle gefunden hat - menuText wird genau wie beim
  // bestehenden Link/QR-Einstieg behandelt (die bestehende analyzeMenu()-
  // Pipeline erkennt darin selbst eine URL und laedt sie).
  onResolved: (menuText: string, menuUrls: string[] | undefined) => void;
  onClose: () => void;
};

// Zweistufiger, nutzerbestaetigter Ablauf: Suche -> Trefferliste (Adressliste)
// -> ausdrueckliche Bestaetigung EINES Kandidaten -> erst dann die teure
// Speisekarten-Isolierung. Der automatische Ein-Schritt-Pfad
// (discoverRestaurantSources) wird hier bewusst nie aufgerufen - siehe
// restaurant-discovery-regression.mjs.
export function RestaurantSearchFlow({ onResolved, onClose }: RestaurantSearchFlowProps) {
  const content = useMobileContent();
  const copy = content.restaurantSearch;

  const [step, setStep] = useState<RestaurantSearchFlowStep>("form");
  const [restaurantName, setRestaurantName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [candidates, setCandidates] = useState<RestaurantDiscoveryCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<RestaurantDiscoveryCandidate | null>(null);
  const [resolveError, setResolveError] = useState("");

  const canSearch = restaurantName.trim().length > 0 && city.trim().length > 0 && !searching;

  async function handleSearch() {
    if (!canSearch) {
      return;
    }

    setSearching(true);
    setSearchError("");

    try {
      const data = await searchRestaurantCandidates({
        restaurantName: restaurantName.trim(),
        city: city.trim(),
        country: country.trim() || undefined
      });

      if (data.candidates.length === 0) {
        setSearchError(copy.noResults);
        return;
      }

      setCandidates(data.candidates);
      setStep("results");
    } catch (error) {
      setSearchError(apiErrorMessage(error, copy.searchErrorGeneric));
    } finally {
      setSearching(false);
    }
  }

  function selectCandidate(candidate: RestaurantDiscoveryCandidate) {
    setSelectedCandidate(candidate);
    setResolveError("");
    setStep("confirm");
  }

  async function confirmCandidate() {
    if (!selectedCandidate) {
      return;
    }

    setStep("resolving");
    setResolveError("");

    try {
      const data = await resolveRestaurantMenuSource({ candidate: selectedCandidate });
      const resolvedMenuUrl = data.menuUrl || data.externalMenuCandidate?.url || "";
      const resolvedMenuUrls = data.menuUrls?.length ? data.menuUrls : undefined;

      if (resolvedMenuUrl) {
        onResolved(resolvedMenuUrl, resolvedMenuUrls);
        return;
      }

      if (resolvedMenuUrls?.length) {
        onResolved(resolvedMenuUrls[0] ?? "", resolvedMenuUrls);
        return;
      }

      setResolveError(copy.resolveErrorGeneric);
      setStep("confirm");
    } catch (error) {
      setResolveError(apiErrorMessage(error, copy.resolveErrorGeneric));
      setStep("confirm");
    }
  }

  function backToForm() {
    setStep("form");
    setSearchError("");
    setCandidates([]);
    setSelectedCandidate(null);
  }

  function backToResults() {
    setStep("results");
    setSelectedCandidate(null);
    setResolveError("");
  }

  return (
    <View style={styles.card}>
      <View style={local.headerRow}>
        <Text style={styles.h2}>{copy.title}</Text>
        <View style={local.headerActions}>
          <GustaroHelp common={content.help.common} topic={content.help.restaurantSearch} />
          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text style={local.closeText}>{copy.close}</Text>
          </Pressable>
        </View>
      </View>

      {step === "form" ? (
        <View>
          <Text style={styles.label}>{copy.nameLabel}</Text>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={copy.namePlaceholder}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={restaurantName}
            onChangeText={setRestaurantName}
          />

          <Text style={styles.label}>{copy.cityLabel}</Text>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={copy.cityPlaceholder}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={city}
            onChangeText={setCity}
          />

          <Text style={styles.label}>{copy.countryLabel}</Text>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            placeholder={copy.countryPlaceholder}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={country}
            onChangeText={setCountry}
          />

          {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={!canSearch}
            style={[styles.button, !canSearch && styles.buttonDisabled]}
            onPress={handleSearch}
          >
            {searching ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{copy.searchButton}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {step === "results" ? (
        <View>
          <Text style={styles.hint}>{copy.resultsHint}</Text>

          <ScrollView style={local.resultsList}>
            {candidates.map((candidate) => (
              <Pressable
                key={candidate.id}
                accessibilityRole="button"
                style={styles.resultItem}
                onPress={() => selectCandidate(candidate)}
              >
                <Text style={styles.resultName}>{candidate.name}</Text>
                <Text style={styles.resultMeta}>
                  {[candidate.address, candidate.city].filter(Boolean).join(", ")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={backToForm}>
            <Text style={styles.ghostButtonText}>{copy.newSearch}</Text>
          </Pressable>
        </View>
      ) : null}

      {step === "confirm" || step === "resolving" ? (
        <View>
          <Text style={styles.h3}>{copy.confirmTitle}</Text>

          {selectedCandidate ? (
            <View style={styles.resultItem}>
              <Text style={styles.resultName}>{selectedCandidate.name}</Text>
              <Text style={styles.resultMeta}>
                {[selectedCandidate.address, selectedCandidate.city].filter(Boolean).join(", ")}
              </Text>
            </View>
          ) : null}

          <Text style={styles.hint}>{copy.confirmHint}</Text>

          {resolveError ? <Text style={styles.error}>{resolveError}</Text> : null}

          {step === "resolving" ? (
            <View style={local.resolvingBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={local.resolvingText}>{copy.resolving}</Text>
            </View>
          ) : (
            <>
              <Pressable accessibilityRole="button" style={styles.button} onPress={confirmCandidate}>
                <Text style={styles.buttonText}>{copy.confirmButton}</Text>
              </Pressable>

              <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={backToResults}>
                <Text style={styles.ghostButtonText}>{copy.backToResults}</Text>
              </Pressable>

              {resolveError ? (
                <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={onClose}>
                  <Text style={styles.ghostButtonText}>{copy.fallbackManual}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof PickForMeApiError && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

const local = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  closeText: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 14
  },
  resultsList: {
    maxHeight: 360
  },
  resolvingBox: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 10
  },
  resolvingText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  }
});
