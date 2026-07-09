import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { classifyProfilePreference } from "../../api/pickformeApi";
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
  kind: "like" | "diet";
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
  const preferenceOptions = editor.preferenceOptions as PreferenceOption[];
  const quickExclusions = editor.quickExclusions as ValueOption[];
  const allergyOptions = editor.allergyOptions as ValueOption[];
  const normalDietPreferenceValues = editor.normalDietPreferenceValues;
  const exclusiveDietPreferenceValues = editor.exclusiveDietPreferenceValues;

  const [customPreference, setCustomPreference] = useState("");
  const [customPreferenceValidationError, setCustomPreferenceValidationError] = useState("");
  const [customPreferenceValidationLoading, setCustomPreferenceValidationLoading] = useState(false);
  const [customExclusion, setCustomExclusion] = useState("");
  const [customIntolerance, setCustomIntolerance] = useState("");

  const customPreferences = profile.customPreferences ?? [];
  const customExclusions = profile.customExclusions ?? [];
  const customIntolerances = profile.customIntolerances ?? [];

  const hiddenPreferences = profile.hiddenPreferences ?? [];
  const hiddenExclusions = profile.hiddenExclusions ?? [];
  const hiddenIntolerances = profile.hiddenIntolerances ?? [];

  const quickPreferenceValues = preferenceOptions.map((option) => option.value);
  const quickExclusionValues = quickExclusions.map((option) => optionValue(option));
  const quickIntoleranceValues = allergyOptions.map((option) => optionValue(option));
  const preferenceLabels = createOptionLabelMap(preferenceOptions);
  const exclusionLabels = createOptionLabelMap(quickExclusions);
  const intoleranceLabels = createOptionLabelMap(allergyOptions);

  const visiblePreferenceOptions = preferenceOptions.filter(
    (option) => !includesValue(hiddenPreferences, option.value)
  );

  const visibleCustomPreferenceValues = uniqueValues([
    ...customPreferences,
    ...profile.primaryLikes.filter((value) => !includesValue(quickPreferenceValues, value))
  ]).filter((value) => !includesValue(hiddenPreferences, value));

  const visibleQuickExclusions = quickExclusions.filter(
    (option) => !includesValue(hiddenExclusions, optionValue(option))
  );

  const visibleCustomExclusionValues = uniqueValues([
    ...customExclusions,
    ...profile.dislikes.filter((value) => !includesValue(quickExclusionValues, value))
  ]).filter((value) => !includesValue(hiddenExclusions, value));

  const visibleAllergyOptions = allergyOptions.filter(
    (option) => !includesValue(hiddenIntolerances, optionValue(option))
  );

  const visibleCustomIntoleranceValues = uniqueValues([
    ...customIntolerances,
    ...profile.intolerances.filter((value) => !includesValue(quickIntoleranceValues, value))
  ]).filter((value) => !includesValue(hiddenIntolerances, value));

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
    const switchesToNormalDiet = includesValue(normalDietPreferenceValues, value);

    updateProfile((currentProfile) => {
      const primaryLikes = toggleValue(currentProfile.primaryLikes, value);
      const dietStyle = switchesToNormalDiet ? "normal" : currentProfile.dietStyle;
      const cleanedPrimaryLikes = switchesToNormalDiet
        ? primaryLikes.filter((item) => !includesValue(exclusiveDietPreferenceValues, item))
        : primaryLikes;

      return {
        primaryLikes: cleanedPrimaryLikes,
        dietStyle
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
      const isQuick = includesValue(quickPreferenceValues, nextValue);

      updateProfile((currentProfile) => {
        const currentCustomPreferences = currentProfile.customPreferences ?? [];
        const currentHiddenPreferences = currentProfile.hiddenPreferences ?? [];

        return {
          primaryLikes: addUnique(currentProfile.primaryLikes, nextValue),
          customPreferences: isQuick ? currentCustomPreferences : addUnique(currentCustomPreferences, nextValue),
          hiddenPreferences: removeValue(currentHiddenPreferences, nextValue)
        };
      });

      setCustomPreference("");
    } catch {
      setCustomPreferenceValidationError(editor.addPreferenceValidationUnavailable);
    } finally {
      setCustomPreferenceValidationLoading(false);
    }
  }

  function setDietStyle(dietStyle: UserProfile["dietStyle"]) {
    updateProfile((currentProfile) => {
      const primaryLikes = includesValue(exclusiveDietPreferenceValues, dietStyle)
        ? currentProfile.primaryLikes.filter((item) => !includesValue(normalDietPreferenceValues, item))
        : currentProfile.primaryLikes;

      return { dietStyle, primaryLikes };
    });
  }

  function preferenceAlreadyExists(value: string) {
    return [
      profile.primaryLikes,
      customPreferences,
      quickPreferenceValues,
      hiddenPreferences
    ].some((values) => includesValue(values, value));
  }

  function deleteDietStyle() {
    const value = profile.dietStyle;
    const displayValue = displayPreferenceValue(value);

    if (value === "normal") {
      return;
    }

    confirmDelete(
      editor.deletePreferenceTitle,
      formatContent(editor.deletePreferenceMessage, { value: displayValue }),
      () =>
        updateProfile((currentProfile) => ({
          dietStyle: "normal",
          hiddenPreferences: addUnique(currentProfile.hiddenPreferences ?? [], value)
        }))
    );
  }

  function deletePreference(value: string) {
    const isQuick = includesValue(quickPreferenceValues, value);
    const displayValue = displayPreferenceValue(value);

    confirmDelete(
      editor.deletePreferenceTitle,
      formatContent(editor.deletePreferenceMessage, { value: displayValue }),
      () =>
        updateProfile((currentProfile) => {
          const currentCustomPreferences = currentProfile.customPreferences ?? [];
          const currentHiddenPreferences = currentProfile.hiddenPreferences ?? [];

          return {
            primaryLikes: removeValue(currentProfile.primaryLikes, value),
            customPreferences: isQuick ? currentCustomPreferences : removeValue(currentCustomPreferences, value),
            hiddenPreferences: isQuick ? addUnique(currentHiddenPreferences, value) : currentHiddenPreferences
          };
        })
    );
  }

  function toggleDislike(value: string) {
    updateProfile((currentProfile) => ({
      dislikes: toggleValue(currentProfile.dislikes, value)
    }));
  }

  function addCustomExclusion() {
    const value = customExclusion.trim();

    if (!value) {
      return;
    }

    const isQuick = includesValue(quickExclusionValues, value);

    updateProfile((currentProfile) => {
      const currentCustomExclusions = currentProfile.customExclusions ?? [];
      const currentHiddenExclusions = currentProfile.hiddenExclusions ?? [];

      return {
        dislikes: addUnique(currentProfile.dislikes, value),
        customExclusions: isQuick ? currentCustomExclusions : addUnique(currentCustomExclusions, value),
        hiddenExclusions: removeValue(currentHiddenExclusions, value)
      };
    });

    setCustomExclusion("");
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

          return {
            dislikes: removeValue(currentProfile.dislikes, value),
            customExclusions: isQuick ? currentCustomExclusions : removeValue(currentCustomExclusions, value),
            hiddenExclusions: isQuick ? addUnique(currentHiddenExclusions, value) : currentHiddenExclusions
          };
        })
    );
  }

  function toggleIntolerance(value: string) {
    updateProfile((currentProfile) => ({
      intolerances: toggleValue(currentProfile.intolerances, value)
    }));
  }

  function addCustomIntolerance() {
    const value = customIntolerance.trim();

    if (!value) {
      return;
    }

    const isQuick = includesValue(quickIntoleranceValues, value);

    updateProfile((currentProfile) => {
      const currentCustomIntolerances = currentProfile.customIntolerances ?? [];
      const currentHiddenIntolerances = currentProfile.hiddenIntolerances ?? [];

      return {
        intolerances: addUnique(currentProfile.intolerances, value),
        customIntolerances: isQuick ? currentCustomIntolerances : addUnique(currentCustomIntolerances, value),
        hiddenIntolerances: removeValue(currentHiddenIntolerances, value)
      };
    });

    setCustomIntolerance("");
  }

  function deleteIntolerance(value: string) {
    const isQuick = includesValue(quickIntoleranceValues, value);
    const displayValue = displayIntoleranceValue(value);

    confirmDelete(
      editor.deleteIntoleranceTitle,
      formatContent(editor.deleteIntoleranceMessage, { value: displayValue }),
      () =>
        updateProfile((currentProfile) => {
          const currentCustomIntolerances = currentProfile.customIntolerances ?? [];
          const currentHiddenIntolerances = currentProfile.hiddenIntolerances ?? [];

          return {
            intolerances: removeValue(currentProfile.intolerances, value),
            customIntolerances: isQuick ? currentCustomIntolerances : removeValue(currentCustomIntolerances, value),
            hiddenIntolerances: isQuick ? addUnique(currentHiddenIntolerances, value) : currentHiddenIntolerances
          };
        })
    );
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
            const active =
              option.kind === "diet"
                ? profile.dietStyle === option.value
                : profile.primaryLikes.includes(option.value);

            return (
              <Chip
                key={option.value}
                label={option.label}
                icon={editor.preferenceValueIcon}
                active={active}
                onPress={() => {
                  if (option.kind === "diet") {
                    setDietStyle(option.value as UserProfile["dietStyle"]);
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

        {profile.primaryLikes.length > 0 || profile.dietStyle !== "normal" ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActivePreferencesLabel}</Text>
            <View style={styles.chipRow}>
              {profile.dietStyle !== "normal" ? (
                <Chip
                  label={displayPreferenceValue(profile.dietStyle)}
                  icon={editor.preferenceValueIcon}
                  active
                  onPress={deleteDietStyle}
                />
              ) : null}

              {profile.primaryLikes.map((value) => (
                <Chip
                  key={value}
                  label={displayPreferenceValue(value)}
                  icon={editor.preferenceValueIcon}
                  active
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
                active={profile.dislikes.includes(value)}
                onPress={() => toggleDislike(value)}
              />
            );
          })}

          {visibleCustomExclusionValues.map((value) => (
            <Chip
              key={value}
              label={displayExclusionValue(value)}
              icon={editor.exclusionValueIcon}
              active={profile.dislikes.includes(value)}
              onPress={() => toggleDislike(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>{editor.addExclusionLabel}</Text>
          <TextInput
            style={styles.input}
            value={customExclusion}
            onChangeText={setCustomExclusion}
            placeholder={editor.addExclusionPlaceholder}
            returnKeyType="done"
            onSubmitEditing={addCustomExclusion}
          />

          <ActionButton
            label={labelWithIcon(editor.addExclusionButton, editor.exclusionValueIcon)}
            variant="secondary"
            onPress={addCustomExclusion}
          />
        </View>

        {profile.dislikes.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActiveExclusionsLabel}</Text>
            <View style={styles.chipRow}>
              {profile.dislikes.map((value) => (
                <Chip
                  key={value}
                  label={displayExclusionValue(value)}
                  icon={editor.exclusionValueIcon}
                  active
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
        {hideHeader ? null : <SectionHeader title={editor.intolerancesTitle} subtitle={editor.intolerancesHint} />}

        <Text style={styles.profileSectionHint}>
          {editor.safetyHint}
        </Text>

        <View style={styles.chipRow}>
          {visibleAllergyOptions.map((option) => {
            const value = optionValue(option);

            return (
              <Chip
                key={value}
                label={optionLabel(option)}
                icon={editor.intoleranceValueIcon}
                active={profile.intolerances.includes(value)}
                onPress={() => toggleIntolerance(value)}
              />
            );
          })}

          {visibleCustomIntoleranceValues.map((value) => (
            <Chip
              key={value}
              label={displayIntoleranceValue(value)}
              icon={editor.intoleranceValueIcon}
              active={profile.intolerances.includes(value)}
              onPress={() => toggleIntolerance(value)}
            />
          ))}
        </View>

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>{editor.addIntoleranceLabel}</Text>
          <TextInput
            style={styles.input}
            value={customIntolerance}
            onChangeText={setCustomIntolerance}
            placeholder={editor.addIntolerancePlaceholder}
            returnKeyType="done"
            onSubmitEditing={addCustomIntolerance}
          />

          <ActionButton
            label={labelWithIcon(editor.addIntoleranceButton, editor.intoleranceValueIcon)}
            variant="secondary"
            onPress={addCustomIntolerance}
          />
        </View>

        {profile.intolerances.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActiveIntolerancesLabel}</Text>
            <View style={styles.chipRow}>
              {profile.intolerances.map((value) => (
                <Chip
                  key={value}
                  label={displayIntoleranceValue(value)}
                  icon={editor.intoleranceValueIcon}
                  active
                  onPress={() => deleteIntolerance(value)}
                />
              ))}
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
  return value.trim().toLowerCase();
}
