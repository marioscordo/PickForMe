import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Chip } from "../ui/Chip";
import { styles } from "../../theme/styles";
import type { UserProfile } from "../../types/profile";

const PREFERENCE_OPTIONS = [
  { label: "🍗 Ich esse Fleisch", value: "Fleisch", kind: "like" },
  { label: "🐟 Ich esse Fisch", value: "Fisch", kind: "like" },
  { label: "🥗 Ich esse vegetarisch", value: "vegetarisch", kind: "diet" },
  { label: "🌱 Ich esse vegan", value: "vegan", kind: "diet" },
  { label: "🌶️ Ich mag es scharf", value: "Scharf", kind: "like" },
  { label: "🍝 Ich mag große Portionen", value: "Große Portionen", kind: "like" },
  { label: "💸 Ich bevorzuge günstige Gerichte", value: "Günstig", kind: "like" },
  { label: "💪 Ich esse proteinreich", value: "Proteinreich", kind: "like" }
] as const;

const QUICK_EXCLUSIONS = [
  "🐷 Kein Schweinefleisch",
  "🍷 Kein Alkohol im Essen",
  "🥩 Kein Rindfleisch",
  "🐑 Kein Lamm",
  "🦐 Keine Meeresfrüchte",
  "🍄 Keine Pilze",
  "🌿 Kein Koriander",
  "🚫 Keine Innereien",
  "🐟 Kein Grätenfisch",
  "🚫 Keine Leber"
];

const QUICK_EXCEPTIONS = [
  "Muscheln in Weißweinsoße",
  "Muscheln in Tomatensoße",
  "Garnelen als Vorspeise",
  "Fisch ohne Gräten"
];

const ALLERGY_OPTIONS = [
  "⚠️ Laktose",
  "⚠️ Gluten",
  "⚠️ Nüsse",
  "⚠️ Ei",
  "⚠️ Soja",
  "⚠️ Sellerie",
  "⚠️ Fructose"
];


export function ProfileEditor({
  profile,
  setProfile
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
}) {
  const [customPreference, setCustomPreference] = useState("");
  const [customExclusion, setCustomExclusion] = useState("");
  const [customException, setCustomException] = useState("");
  const [customIntolerance, setCustomIntolerance] = useState("");

  const exceptions = profile.exceptions ?? [];

  const customPreferences = profile.customPreferences ?? [];
  const customExclusions = profile.customExclusions ?? [];
  const customIntolerances = profile.customIntolerances ?? [];
  const customExceptions = profile.customExceptions ?? [];

  const hiddenPreferences = profile.hiddenPreferences ?? [];
  const hiddenExclusions = profile.hiddenExclusions ?? [];
  const hiddenIntolerances = profile.hiddenIntolerances ?? [];
  const hiddenExceptions = profile.hiddenExceptions ?? [];

  const quickPreferenceValues = PREFERENCE_OPTIONS.map((option) => option.value);
  const quickExclusionValues = QUICK_EXCLUSIONS.map((label) => chipValue(label));
  const quickIntoleranceValues = ALLERGY_OPTIONS.map((label) => chipValue(label));

  const visiblePreferenceOptions = PREFERENCE_OPTIONS.filter(
    (option) => !includesValue(hiddenPreferences, option.value)
  );

  const visibleCustomPreferenceValues = uniqueValues([
    ...customPreferences,
    ...profile.primaryLikes.filter((value) => !includesValue(quickPreferenceValues, value))
  ]).filter((value) => !includesValue(hiddenPreferences, value));

  const visibleQuickExclusions = QUICK_EXCLUSIONS.filter(
    (label) => !includesValue(hiddenExclusions, chipValue(label))
  );

  const visibleCustomExclusionValues = uniqueValues([
    ...customExclusions,
    ...profile.dislikes.filter((value) => !includesValue(quickExclusionValues, value))
  ]).filter((value) => !includesValue(hiddenExclusions, value));

  const visibleAllergyOptions = ALLERGY_OPTIONS.filter(
    (label) => !includesValue(hiddenIntolerances, chipValue(label))
  );

  const visibleCustomIntoleranceValues = uniqueValues([
    ...customIntolerances,
    ...profile.intolerances.filter((value) => !includesValue(quickIntoleranceValues, value))
  ]).filter((value) => !includesValue(hiddenIntolerances, value));

  const visibleQuickExceptions = QUICK_EXCEPTIONS.filter(
    (value) => !includesValue(hiddenExceptions, value)
  );

  const visibleCustomExceptionValues = uniqueValues([
    ...customExceptions,
    ...exceptions.filter((value) => !includesValue(QUICK_EXCEPTIONS, value))
  ]).filter((value) => !includesValue(hiddenExceptions, value));

  function updateProfile(patch: Partial<UserProfile>) {
    setProfile({
      ...profile,
      ...patch
    });
  }

  function confirmDelete(title: string, message: string, onDelete: () => void) {
    Alert.alert(title, message, [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", style: "destructive", onPress: onDelete }
    ]);
  }

  function toggleLike(value: string) {
    const primaryLikes = toggleValue(profile.primaryLikes, value);
    const dietStyle = value === "Fleisch" || value === "Fisch" ? "normal" : profile.dietStyle;

    const cleanedPrimaryLikes =
      value === "Fleisch" || value === "Fisch"
        ? primaryLikes.filter((item) => item !== "vegan" && item !== "vegetarisch")
        : primaryLikes;

    updateProfile({
      primaryLikes: cleanedPrimaryLikes,
      dietStyle
    });
  }

  function addCustomPreference() {
    const value = customPreference.trim();

    if (!value) {
      return;
    }

    const isQuick = includesValue(quickPreferenceValues, value);

    updateProfile({
      primaryLikes: addUnique(profile.primaryLikes, value),
      customPreferences: isQuick ? customPreferences : addUnique(customPreferences, value),
      hiddenPreferences: removeValue(hiddenPreferences, value)
    });

    setCustomPreference("");
  }

  function setDietStyle(dietStyle: UserProfile["dietStyle"]) {
    const primaryLikes =
      dietStyle === "vegetarisch" || dietStyle === "vegan"
        ? profile.primaryLikes.filter((item) => item !== "Fleisch" && item !== "Fisch")
        : profile.primaryLikes;

    updateProfile({ dietStyle, primaryLikes });
  }

  function deleteDietStyle() {
    const value = profile.dietStyle;

    if (value === "normal") {
      return;
    }

    confirmDelete(
      "Vorliebe löschen?",
      `„${value}“ wird dauerhaft aus deiner Vorlieben-Liste entfernt.`,
      () =>
        updateProfile({
          dietStyle: "normal",
          hiddenPreferences: addUnique(hiddenPreferences, value)
        })
    );
  }

  function deletePreference(value: string) {
    const isQuick = includesValue(quickPreferenceValues, value);

    confirmDelete(
      "Vorliebe löschen?",
      `„${value}“ wird dauerhaft aus deiner Vorlieben-Liste entfernt.`,
      () =>
        updateProfile({
          primaryLikes: removeValue(profile.primaryLikes, value),
          customPreferences: isQuick ? customPreferences : removeValue(customPreferences, value),
          hiddenPreferences: isQuick ? addUnique(hiddenPreferences, value) : hiddenPreferences
        })
    );
  }

  function toggleDislike(value: string) {
    updateProfile({
      dislikes: toggleValue(profile.dislikes, value)
    });
  }

  function addCustomExclusion() {
    const value = customExclusion.trim();

    if (!value) {
      return;
    }

    const isQuick = includesValue(quickExclusionValues, value);

    updateProfile({
      dislikes: addUnique(profile.dislikes, value),
      customExclusions: isQuick ? customExclusions : addUnique(customExclusions, value),
      hiddenExclusions: removeValue(hiddenExclusions, value)
    });

    setCustomExclusion("");
  }

  function deleteExclusion(value: string) {
    const isQuick = includesValue(quickExclusionValues, value);

    confirmDelete(
      "Ausschluss löschen?",
      `„${value}“ wird dauerhaft aus deiner Ausschluss-Liste entfernt.`,
      () =>
        updateProfile({
          dislikes: removeValue(profile.dislikes, value),
          customExclusions: isQuick ? customExclusions : removeValue(customExclusions, value),
          hiddenExclusions: isQuick ? addUnique(hiddenExclusions, value) : hiddenExclusions
        })
    );
  }

  function toggleIntolerance(value: string) {
    updateProfile({
      intolerances: toggleValue(profile.intolerances, value)
    });
  }

  function addCustomIntolerance() {
    const value = customIntolerance.trim();

    if (!value) {
      return;
    }

    const isQuick = includesValue(quickIntoleranceValues, value);

    updateProfile({
      intolerances: addUnique(profile.intolerances, value),
      customIntolerances: isQuick ? customIntolerances : addUnique(customIntolerances, value),
      hiddenIntolerances: removeValue(hiddenIntolerances, value)
    });

    setCustomIntolerance("");
  }

  function deleteIntolerance(value: string) {
    const isQuick = includesValue(quickIntoleranceValues, value);

    confirmDelete(
      "Unverträglichkeit löschen?",
      `„${value}“ wird dauerhaft aus deiner Allergien-/Unverträglichkeiten-Liste entfernt.`,
      () =>
        updateProfile({
          intolerances: removeValue(profile.intolerances, value),
          customIntolerances: isQuick ? customIntolerances : removeValue(customIntolerances, value),
          hiddenIntolerances: isQuick ? addUnique(hiddenIntolerances, value) : hiddenIntolerances
        })
    );
  }

  function toggleException(value: string) {
    updateProfile({
      exceptions: toggleValue(exceptions, value)
    });
  }

  function addCustomException() {
    const value = customException.trim();

    if (!value) {
      return;
    }

    const isQuick = includesValue(QUICK_EXCEPTIONS, value);

    updateProfile({
      exceptions: addUnique(exceptions, value),
      customExceptions: isQuick ? customExceptions : addUnique(customExceptions, value),
      hiddenExceptions: removeValue(hiddenExceptions, value)
    });

    setCustomException("");
  }

  function deleteException(value: string) {
    const isQuick = includesValue(QUICK_EXCEPTIONS, value);

    confirmDelete(
      "Ausnahme löschen?",
      `„${value}“ wird dauerhaft aus deiner Ausnahmen-Liste entfernt.`,
      () =>
        updateProfile({
          exceptions: removeValue(exceptions, value),
          customExceptions: isQuick ? customExceptions : removeValue(customExceptions, value),
          hiddenExceptions: isQuick ? addUnique(hiddenExceptions, value) : hiddenExceptions
        })
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Sag mir kurz, worauf ich achten soll 😊</Text>
      <Text style={styles.subtitle}>Alles freiwillig. PickForMe nutzt es sofort für bessere Empfehlungen.</Text>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>Meine Vorlieben</Text>
        <Text style={styles.profileSectionHint}>Was PickForMe bei Empfehlungen bevorzugen soll.</Text>

        <View style={styles.chipRow}>
          {visiblePreferenceOptions.map((option) => {
            const active =
              option.kind === "diet"
                ? profile.dietStyle === option.value
                : profile.primaryLikes.includes(option.value);

            return (
              <Chip
                key={option.value}
                label={option.label}
                active={active}
                onPress={() => {
                  if (option.kind === "diet") {
                    setDietStyle(option.value);
                  } else {
                    toggleLike(option.value);
                  }
                }}
              />
            );
          })}

          {visibleCustomPreferenceValues.map((value) => (
            <Chip
              key={value}
              label={`✨ ${value}`}
              active={profile.primaryLikes.includes(value)}
              onPress={() => toggleLike(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>Vorliebe hinzufügen</Text>
          <TextInput
            style={styles.input}
            value={customPreference}
            onChangeText={setCustomPreference}
            placeholder="z. B. Steak, Sushi, proteinreich ..."
            returnKeyType="done"
            onSubmitEditing={addCustomPreference}
          />

          <Pressable style={styles.ghostButton} onPress={addCustomPreference}>
            <Text style={styles.ghostButtonText}>➕ Vorliebe hinzufügen</Text>
          </Pressable>
        </View>

        {profile.primaryLikes.length > 0 || profile.dietStyle !== "normal" ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>Aktive Vorlieben löschen</Text>
            <View style={styles.chipRow}>
              {profile.dietStyle !== "normal" ? (
                <Chip label={`✕ ${profile.dietStyle}`} active onPress={deleteDietStyle} />
              ) : null}

              {profile.primaryLikes.map((value) => (
                <Chip key={value} label={`✕ ${value}`} active onPress={() => deletePreference(value)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>Meine Ausschlüsse 🚫</Text>
        <Text style={styles.profileSectionHint}>Was PickForMe nicht empfehlen darf.</Text>

        <View style={styles.chipRow}>
          {visibleQuickExclusions.map((label) => {
            const value = chipValue(label);

            return (
              <Chip
                key={value}
                label={label}
                active={profile.dislikes.includes(value)}
                onPress={() => toggleDislike(value)}
              />
            );
          })}

          {visibleCustomExclusionValues.map((value) => (
            <Chip
              key={value}
              label={`🚫 ${value}`}
              active={profile.dislikes.includes(value)}
              onPress={() => toggleDislike(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>Ausschluss hinzufügen</Text>
          <TextInput
            style={styles.input}
            value={customExclusion}
            onChangeText={setCustomExclusion}
            placeholder="z. B. Knoblauch, Kümmel, Lamm ..."
            returnKeyType="done"
            onSubmitEditing={addCustomExclusion}
          />

          <Pressable style={styles.ghostButton} onPress={addCustomExclusion}>
            <Text style={styles.ghostButtonText}>➕ Ausschluss hinzufügen</Text>
          </Pressable>
        </View>

        {profile.dislikes.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>Aktive Ausschlüsse löschen</Text>
            <View style={styles.chipRow}>
              {profile.dislikes.map((value) => (
                <Chip key={value} label={`✕ ${value}`} active onPress={() => deleteExclusion(value)} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>Ausnahmen</Text>
          <Text style={styles.profileSectionHint}>
            Wenn ein Ausschluss zu grob ist: Was darf trotzdem empfohlen werden?
          </Text>

          <View style={styles.chipRow}>
            {visibleQuickExceptions.map((value) => (
              <Chip
                key={value}
                label={`✅ ${value}`}
                active={exceptions.includes(value)}
                onPress={() => toggleException(value)}
              />
            ))}

            {visibleCustomExceptionValues.map((value) => (
              <Chip
                key={value}
                label={`✅ ${value}`}
                active={exceptions.includes(value)}
                onPress={() => toggleException(value)}
              />
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={customException}
            onChangeText={setCustomException}
            placeholder="z. B. Muscheln in Tomatensoße ..."
            returnKeyType="done"
            onSubmitEditing={addCustomException}
          />

          <Pressable style={styles.ghostButton} onPress={addCustomException}>
            <Text style={styles.ghostButtonText}>➕ Ausnahme hinzufügen</Text>
          </Pressable>

          {exceptions.length > 0 ? (
            <View style={styles.profileSubBlock}>
              <Text style={styles.label}>Aktive Ausnahmen löschen</Text>
              <View style={styles.chipRow}>
                {exceptions.map((value) => (
                  <Chip key={value} label={`✕ ${value}`} active onPress={() => deleteException(value)} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>Allergien & Unverträglichkeiten ⚠️</Text>
        <Text style={styles.profileSectionHint}>Diese Zutaten werden besonders streng berücksichtigt.</Text>

        <Text style={styles.profileSectionHint}>
          Deine Sicherheit geht vor: PickForMe hilft dir bei der Auswahl – aber du entscheidest.
          Bitte prüfe jedes Gericht selbst, wenn Allergien oder Unverträglichkeiten bestehen.
        </Text>

        <View style={styles.chipRow}>
          {visibleAllergyOptions.map((label) => {
            const value = chipValue(label);

            return (
              <Chip
                key={value}
                label={label}
                active={profile.intolerances.includes(value)}
                onPress={() => toggleIntolerance(value)}
              />
            );
          })}

          {visibleCustomIntoleranceValues.map((value) => (
            <Chip
              key={value}
              label={`⚠️ ${value}`}
              active={profile.intolerances.includes(value)}
              onPress={() => toggleIntolerance(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>Unverträglichkeit hinzufügen</Text>
          <TextInput
            style={styles.input}
            value={customIntolerance}
            onChangeText={setCustomIntolerance}
            placeholder="z. B. Histamin, Zwiebeln, Fructose ..."
            returnKeyType="done"
            onSubmitEditing={addCustomIntolerance}
          />

          <Pressable style={styles.ghostButton} onPress={addCustomIntolerance}>
            <Text style={styles.ghostButtonText}>➕ Unverträglichkeit hinzufügen</Text>
          </Pressable>
        </View>

        {profile.intolerances.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>Aktive Unverträglichkeiten löschen</Text>
            <View style={styles.chipRow}>
              {profile.intolerances.map((value) => (
                <Chip key={value} label={`✕ ${value}`} active onPress={() => deleteIntolerance(value)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function chipValue(label: string) {
  return label.replace(/^.+? /, "");
}

function toggleValue(values: string[], value: string) {
  return includesValue(values, value) ? removeValue(values, value) : [...values, value];
}

function addUnique(values: string[], value: string) {
  return includesValue(values, value) ? values : [...values, value];
}

function removeValue(values: string[], value: string) {
  return values.filter((item) => !sameValue(item, value));
}

function includesValue(values: string[], value: string) {
  return values.some((item) => sameValue(item, value));
}

function sameValue(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return includesValue(result, value) ? result : [...result, value];
  }, []);
}


