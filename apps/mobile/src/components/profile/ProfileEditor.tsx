import React, { useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { classifyProfileInput, classifyProfilePreference } from "../../api/pickformeApi";
import { profileFeatures } from "../../config/profileFeatures";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";
import type { UserProfile } from "../../types/profile";
import { ActionButton } from "../ui/ActionButton";
import { Chip } from "../ui/Chip";
import { SectionHeader } from "../ui/SectionHeader";

type PreferenceOption = {
  label: string;
  value: string;
  kind: "like";
};

type ValueOption = string | {
  label: string;
  value: string;
};

export type ProfileEditorSection = "preferences" | "exclusions" | "intolerances";

export function ProfileEditor({
  profile,
  setProfile,
  section,
  hideHeader
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile | ((current: UserProfile) => UserProfile)) => void;
  section: ProfileEditorSection;
  hideHeader?: boolean;
}) {
  const content = useMobileContent();
  const editor = content.profileEditor;
  const latestProfileRef = useRef(profile);
  latestProfileRef.current = profile;
  const preferenceOptions = editor.preferenceOptions as PreferenceOption[];
  const quickExclusions = editor.quickExclusions as ValueOption[];
  const allergyOptions = editor.allergyOptions as ValueOption[];
  const allergenModuleEnabled = profileFeatures.allergenModuleEnabled;

  const [customPreference, setCustomPreference] = useState("");
  const [customPreferenceValidationError, setCustomPreferenceValidationError] = useState("");
  const [customPreferenceValidationLoading, setCustomPreferenceValidationLoading] = useState(false);
  const [customExclusion, setCustomExclusion] = useState("");
  const [customExclusionValidationError, setCustomExclusionValidationError] = useState("");
  const [customExclusionValidationLoading, setCustomExclusionValidationLoading] = useState(false);

  const customExclusions = profile.customExclusions ?? [];
  const allergens = profile.allergens ?? [];

  const hiddenPreferences = profile.hiddenPreferences ?? [];
  const hiddenExclusions = profile.hiddenExclusions ?? [];
  const deletedPreferences = profile.deletedPreferences ?? [];
  const deletedExclusions = profile.deletedExclusions ?? [];

  const quickPreferenceValues = preferenceOptions.map((option) => option.value);
  const quickExclusionValues = quickExclusions.map((option) => optionValue(option));
  const preferenceLabels = createOptionLabelMap(preferenceOptions);
  const exclusionLabels = createOptionLabelMap(quickExclusions);
  const intoleranceLabels = createOptionLabelMap(allergyOptions);

  const visiblePreferenceOptions = preferenceOptions.filter(
    (option) => !includesValue(deletedPreferences, option.value)
  );

  const visibleCustomPreferenceValues = uniqueValues([
    ...profile.primaryLikes.filter((value) => !includesValue(quickPreferenceValues, value)),
    ...hiddenPreferences.filter((value) => !includesValue(quickPreferenceValues, value))
  ]);

  // Loeschbare Vorlieben: aktive (primaryLikes) PLUS eigene/alte Werte, die
  // gerade deaktiviert sind (nur in hiddenPreferences stehen). Vorher wurden
  // hier nur aktive Werte gelistet, wodurch deaktivierte alte/kaputte
  // Eintraege zwar oben aktivierbar, aber nirgends loeschbar waren.
  const deletablePreferenceValues = uniqueValues([...profile.primaryLikes, ...visibleCustomPreferenceValues]);

  const visibleQuickExclusions = quickExclusions.filter(
    (option) => !includesValue(deletedExclusions, optionValue(option))
  );

  const visibleCustomExclusionValues = uniqueValues([
    ...customExclusions.filter((value) => !includesValue(quickExclusionValues, value)),
    ...hiddenExclusions.filter((value) => !includesValue(quickExclusionValues, value))
  ]);

  // Loeschbare Abneigungen: aktive (customExclusions) PLUS eigene/alte Werte,
  // die gerade deaktiviert sind (nur in hiddenExclusions stehen). Analog zur
  // gleichen Korrektur bei den Vorlieben oben.
  const deletableExclusionValues = uniqueValues([...customExclusions, ...visibleCustomExclusionValues]);

  const visibleAllergyOptions = allergenModuleEnabled ? allergyOptions : [];

  function updateProfile(patch: Partial<UserProfile> | ((current: UserProfile) => Partial<UserProfile>)) {
    setProfile((currentProfile) => ({
      ...currentProfile,
      ...(typeof patch === "function" ? patch(currentProfile) : patch)
    }));
  }

  function confirmDelete(title: string, message: string, onDelete: () => void) {
    Alert.alert(title, message, [
      { text: content.common.cancel, style: "cancel" },
      { text: content.common.delete, style: "destructive", onPress: onDelete }
    ]);
  }

  function toggleLike(value: string) {
    updateProfile((currentProfile) => {
      const isActive = includesValue(currentProfile.primaryLikes, value);
      const primaryLikes = isActive
        ? removeValue(currentProfile.primaryLikes, value)
        : addUnique(currentProfile.primaryLikes, value);
      const hiddenPreferences = isActive
        ? addUnique(currentProfile.hiddenPreferences ?? [], value)
        : removeValue(currentProfile.hiddenPreferences ?? [], value);

      return {
        primaryLikes,
        hiddenPreferences,
        deletedPreferences: removeValue(currentProfile.deletedPreferences ?? [], value)
      };
    });
  }

  async function addCustomPreference() {
    const value = customPreference.trim();

    if (!value || customPreferenceValidationLoading) {
      return;
    }

    if (preferenceAlreadyExists(value)) {
      setCustomPreferenceValidationError(editor.addPreferenceDuplicateError);
      return;
    }

    setCustomPreferenceValidationError("");
    setCustomPreferenceValidationLoading(true);

    try {
      const classification = await classifyProfilePreference(value);

      if (!classification.allowed) {
        setCustomPreferenceValidationError(editor.addPreferenceValidationError);
        return;
      }

      const nextValue = classification.normalizedValue?.trim() || value;
      if (preferenceAlreadyExists(nextValue, latestProfileRef.current)) {
        setCustomPreferenceValidationError(editor.addPreferenceDuplicateError);
        return;
      }

      updateProfile((currentProfile) => {
        const currentHiddenPreferences = currentProfile.hiddenPreferences ?? [];
        const currentDeletedPreferences = currentProfile.deletedPreferences ?? [];

        return {
          primaryLikes: addUnique(currentProfile.primaryLikes, nextValue),
          hiddenPreferences: removeValue(currentHiddenPreferences, nextValue),
          deletedPreferences: removeValue(currentDeletedPreferences, nextValue)
        };
      });

      setCustomPreference("");
    } catch {
      setCustomPreferenceValidationError(editor.addPreferenceValidationUnavailable);
    } finally {
      setCustomPreferenceValidationLoading(false);
    }
  }

  function preferenceAlreadyExists(value: string, currentProfile = profile) {
    return includesValue(currentProfile.primaryLikes, value);
  }

  function deletePreference(value: string) {
    const isQuick = includesValue(quickPreferenceValues, value);
    const displayValue = displayPreferenceValue(value);

    confirmDelete(
      editor.deletePreferenceTitle,
      formatContent(editor.deletePreferenceMessage, { value: displayValue }),
      () =>
        updateProfile((currentProfile) => {
          const currentHiddenPreferences = currentProfile.hiddenPreferences ?? [];
          const currentDeletedPreferences = currentProfile.deletedPreferences ?? [];

          return {
            primaryLikes: removeValue(currentProfile.primaryLikes, value),
            hiddenPreferences: removeValue(currentHiddenPreferences, value),
            deletedPreferences: isQuick ? addUnique(currentDeletedPreferences, value) : currentDeletedPreferences
          };
        })
    );
  }

  function toggleDislike(value: string) {
    updateProfile((currentProfile) => {
      const currentCustomExclusions = currentProfile.customExclusions ?? [];
      const isActive = includesValue(currentCustomExclusions, value);

      return {
        customExclusions: isActive
          ? removeValue(currentCustomExclusions, value)
          : addUnique(currentCustomExclusions, value),
        hiddenExclusions: isActive
          ? addUnique(currentProfile.hiddenExclusions ?? [], value)
          : removeValue(currentProfile.hiddenExclusions ?? [], value),
        deletedExclusions: removeValue(currentProfile.deletedExclusions ?? [], value)
      };
    });
  }

  async function addCustomExclusion() {
    const value = customExclusion.trim();

    if (!value || customExclusionValidationLoading) {
      return;
    }

    if (exclusionAlreadyExists(value)) {
      setCustomExclusionValidationError(editor.addExclusionDuplicateError);
      return;
    }

    setCustomExclusionValidationError("");
    setCustomExclusionValidationLoading(true);

    try {
      const classification = await classifyProfileInput(value, "exclusion");

      if (!classification.allowed) {
        setCustomExclusionValidationError(editor.addExclusionValidationError);
        return;
      }

      const nextValue = classification.normalizedValue?.trim() || value;
      if (exclusionAlreadyExists(nextValue, latestProfileRef.current)) {
        setCustomExclusionValidationError(editor.addExclusionDuplicateError);
        return;
      }

      updateProfile((currentProfile) => {
        const currentCustomExclusions = currentProfile.customExclusions ?? [];
        const currentHiddenExclusions = currentProfile.hiddenExclusions ?? [];
        const currentDeletedExclusions = currentProfile.deletedExclusions ?? [];

        return {
          customExclusions: addUnique(currentCustomExclusions, nextValue),
          hiddenExclusions: removeValue(currentHiddenExclusions, nextValue),
          deletedExclusions: removeValue(currentDeletedExclusions, nextValue)
        };
      });

      setCustomExclusion("");
    } catch {
      setCustomExclusionValidationError(editor.addExclusionValidationUnavailable);
    } finally {
      setCustomExclusionValidationLoading(false);
    }
  }

  function deleteExclusion(value: string) {
    const isQuick = includesValue(quickExclusionValues, value);
    const displayValue = displayExclusionValue(value);

    confirmDelete(
      editor.deleteExclusionTitle,
      formatContent(editor.deleteExclusionMessage, { value: displayValue }),
      () =>
        updateProfile((currentProfile) => {
          const currentCustomExclusions = currentProfile.customExclusions ?? [];
          const currentHiddenExclusions = currentProfile.hiddenExclusions ?? [];
          const currentDeletedExclusions = currentProfile.deletedExclusions ?? [];

          return {
            customExclusions: removeValue(currentCustomExclusions, value),
            hiddenExclusions: removeValue(currentHiddenExclusions, value),
            deletedExclusions: isQuick ? addUnique(currentDeletedExclusions, value) : currentDeletedExclusions
          };
        })
    );
  }

  function toggleAllergen(value: string) {
    updateProfile((currentProfile) => ({
      allergens: toggleValue(currentProfile.allergens ?? [], value)
    }));
  }

  function deleteAllergen(value: string) {
    const displayValue = displayIntoleranceValue(value);

    confirmDelete(
      editor.deleteIntoleranceTitle,
      formatContent(editor.deleteIntoleranceMessage, { value: displayValue }),
      () =>
        updateProfile((currentProfile) => ({
          allergens: removeValue(currentProfile.allergens ?? [], value)
        }))
    );
  }

  function exclusionAlreadyExists(value: string, currentProfile = profile) {
    return includesValue(currentProfile.customExclusions ?? [], value);
  }

  function displayPreferenceValue(value: string) {
    return optionMapLabel(preferenceLabels, value);
  }

  function displayExclusionValue(value: string) {
    return optionMapLabel(exclusionLabels, value);
  }

  function displayIntoleranceValue(value: string) {
    return optionMapLabel(intoleranceLabels, value);
  }

  return (
    <View style={styles.profileEditorSurface}>
      {section === "preferences" ? (
        <View style={styles.profileDetailBlock}>
        {hideHeader ? null : <SectionHeader title={editor.preferencesTitle} subtitle={editor.preferencesHint} />}

        <View style={styles.chipRow}>
          {visiblePreferenceOptions.map((option) => {
            const active = profile.primaryLikes.includes(option.value);

            return (
              <Chip
                key={option.value}
                label={option.label}
                icon={editor.preferenceValueIcon}
                active={active}
                onPress={() => toggleLike(option.value)}
              />
            );
          })}

          {visibleCustomPreferenceValues.map((value) => (
            <Chip
              key={value}
              label={displayPreferenceValue(value)}
              icon={editor.preferenceValueIcon}
              active={profile.primaryLikes.includes(value)}
              onPress={() => toggleLike(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>{editor.addPreferenceLabel}</Text>
          <TextInput
            style={styles.input}
            value={customPreference}
            onChangeText={(value) => {
              setCustomPreference(value);
              setCustomPreferenceValidationError("");
            }}
            placeholder={editor.addPreferencePlaceholder}
            returnKeyType="done"
            onSubmitEditing={addCustomPreference}
          />

          {customPreferenceValidationError ? (
            <Text style={styles.error}>{customPreferenceValidationError}</Text>
          ) : null}

          <ActionButton
            label={labelWithIcon(editor.addPreferenceButton, editor.preferenceValueIcon)}
            variant="secondary"
            disabled={customPreference.trim().length === 0 || customPreferenceValidationLoading}
            onPress={addCustomPreference}
          />
        </View>

        {deletablePreferenceValues.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActivePreferencesLabel}</Text>
            <View style={styles.chipRow}>
              {deletablePreferenceValues.map((value) => (
                <Chip
                  key={value}
                  label={displayPreferenceValue(value)}
                  icon={editor.preferenceValueIcon}
                  active={profile.primaryLikes.includes(value)}
                  onPress={() => deletePreference(value)}
                />
              ))}
            </View>
          </View>
        ) : null}
        </View>
      ) : null}

      {section === "exclusions" ? (
        <View style={styles.profileDetailBlock}>
        {hideHeader ? null : <SectionHeader title={editor.exclusionsTitle} subtitle={editor.exclusionsHint} />}

        <View style={styles.chipRow}>
          {visibleQuickExclusions.map((option) => {
            const value = optionValue(option);

            return (
              <Chip
                key={value}
                label={optionLabel(option)}
                icon={editor.exclusionValueIcon}
                active={customExclusions.includes(value)}
                onPress={() => toggleDislike(value)}
              />
            );
          })}

          {visibleCustomExclusionValues.map((value) => (
            <Chip
              key={value}
              label={displayExclusionValue(value)}
              icon={editor.exclusionValueIcon}
              active={customExclusions.includes(value)}
              onPress={() => toggleDislike(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>{editor.addExclusionLabel}</Text>
          <TextInput
            style={styles.input}
            value={customExclusion}
            onChangeText={(value) => {
              setCustomExclusion(value);
              setCustomExclusionValidationError("");
            }}
            placeholder={editor.addExclusionPlaceholder}
            returnKeyType="done"
            onSubmitEditing={addCustomExclusion}
          />

          {customExclusionValidationError ? (
            <Text style={styles.error}>{customExclusionValidationError}</Text>
          ) : null}

          <ActionButton
            label={labelWithIcon(editor.addExclusionButton, editor.exclusionValueIcon)}
            variant="secondary"
            disabled={customExclusion.trim().length === 0 || customExclusionValidationLoading}
            onPress={addCustomExclusion}
          />
        </View>

        {deletableExclusionValues.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActiveExclusionsLabel}</Text>
            <View style={styles.chipRow}>
              {deletableExclusionValues.map((value) => (
                <Chip
                  key={value}
                  label={displayExclusionValue(value)}
                  icon={editor.exclusionValueIcon}
                  active={customExclusions.includes(value)}
                  onPress={() => deleteExclusion(value)}
                />
              ))}
            </View>
          </View>
        ) : null}

        </View>
      ) : null}

      {section === "intolerances" ? (
        <View style={styles.profileDetailBlock}>
        {hideHeader ? null : (
          <SectionHeader
            title={allergenModuleEnabled ? editor.intolerancesTitle : editor.intolerancesOnlyTitle}
            subtitle={editor.intolerancesHint}
          />
        )}

        {allergenModuleEnabled ? (
          <Text style={styles.profileSectionHint}>
            {editor.safetyHint}
          </Text>
        ) : null}

        {allergenModuleEnabled ? (
          <View style={styles.chipRow}>
            {visibleAllergyOptions.map((option) => {
              const value = optionValue(option);

              return (
                <Chip
                  key={value}
                  label={optionLabel(option)}
                  icon={editor.intoleranceValueIcon}
                  active={allergens.includes(value)}
                  onPress={() => toggleAllergen(value)}
                />
              );
            })}
          </View>
        ) : null}

        {allergenModuleEnabled && allergens.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActiveIntolerancesLabel}</Text>
            <View style={styles.chipRow}>
              {allergenModuleEnabled ? allergens.map((value) => (
                <Chip
                  key={value}
                  label={displayIntoleranceValue(value)}
                  icon={editor.intoleranceValueIcon}
                  active
                  onPress={() => deleteAllergen(value)}
                />
              )) : null}

            </View>
          </View>
        ) : null}
        </View>
      ) : null}
    </View>
  );
}

function optionLabel(option: ValueOption) {
  return typeof option === "string" ? option : option.label;
}

function optionValue(option: ValueOption) {
  return typeof option === "string" ? option : option.value;
}

function createOptionLabelMap(options: ValueOption[]) {
  return new Map(options.map((option) => [normalizeValue(optionValue(option)), optionLabel(option)]));
}

function optionMapLabel(labels: Map<string, string>, value: string) {
  return labels.get(normalizeValue(value)) ?? value;
}

function labelWithIcon(value: string, icon: string) {
  return `${icon} ${value}`.trim();
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
  return normalizeValue(a) === normalizeValue(b);
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return includesValue(result, value) ? result : [...result, value];
  }, []);
}

function normalizeValue(value: string) {
  return value.trim().normalize("NFC").toLowerCase();
}
