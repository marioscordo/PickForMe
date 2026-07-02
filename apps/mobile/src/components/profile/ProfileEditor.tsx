import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";
import type { UserProfile } from "../../types/profile";
import { Chip } from "../ui/Chip";

type PreferenceOption = {
  label: string;
  value: string;
  kind: "like" | "diet";
};

export function ProfileEditor({
  profile,
  setProfile
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
}) {
  const content = useMobileContent();
  const editor = content.profileEditor;
  const preferenceOptions = editor.preferenceOptions as PreferenceOption[];
  const quickExclusions = editor.quickExclusions;
  const quickExceptions = editor.quickExceptions;
  const allergyOptions = editor.allergyOptions;
  const normalDietPreferenceValues = editor.normalDietPreferenceValues;
  const exclusiveDietPreferenceValues = editor.exclusiveDietPreferenceValues;

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

  const quickPreferenceValues = preferenceOptions.map((option) => option.value);
  const quickExclusionValues = quickExclusions.map((label) => chipValue(label));
  const quickIntoleranceValues = allergyOptions.map((label) => chipValue(label));

  const visiblePreferenceOptions = preferenceOptions.filter(
    (option) => !includesValue(hiddenPreferences, option.value)
  );

  const visibleCustomPreferenceValues = uniqueValues([
    ...customPreferences,
    ...profile.primaryLikes.filter((value) => !includesValue(quickPreferenceValues, value))
  ]).filter((value) => !includesValue(hiddenPreferences, value));

  const visibleQuickExclusions = quickExclusions.filter(
    (label) => !includesValue(hiddenExclusions, chipValue(label))
  );

  const visibleCustomExclusionValues = uniqueValues([
    ...customExclusions,
    ...profile.dislikes.filter((value) => !includesValue(quickExclusionValues, value))
  ]).filter((value) => !includesValue(hiddenExclusions, value));

  const visibleAllergyOptions = allergyOptions.filter(
    (label) => !includesValue(hiddenIntolerances, chipValue(label))
  );

  const visibleCustomIntoleranceValues = uniqueValues([
    ...customIntolerances,
    ...profile.intolerances.filter((value) => !includesValue(quickIntoleranceValues, value))
  ]).filter((value) => !includesValue(hiddenIntolerances, value));

  const visibleQuickExceptions = quickExceptions.filter(
    (value) => !includesValue(hiddenExceptions, value)
  );

  const visibleCustomExceptionValues = uniqueValues([
    ...customExceptions,
    ...exceptions.filter((value) => !includesValue(quickExceptions, value))
  ]).filter((value) => !includesValue(hiddenExceptions, value));

  function updateProfile(patch: Partial<UserProfile>) {
    setProfile({
      ...profile,
      ...patch
    });
  }

  function confirmDelete(title: string, message: string, onDelete: () => void) {
    Alert.alert(title, message, [
      { text: content.common.cancel, style: "cancel" },
      { text: content.common.delete, style: "destructive", onPress: onDelete }
    ]);
  }

  function toggleLike(value: string) {
    const primaryLikes = toggleValue(profile.primaryLikes, value);
    const switchesToNormalDiet = includesValue(normalDietPreferenceValues, value);
    const dietStyle = switchesToNormalDiet ? "normal" : profile.dietStyle;

    const cleanedPrimaryLikes = switchesToNormalDiet
      ? primaryLikes.filter((item) => !includesValue(exclusiveDietPreferenceValues, item))
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
    const primaryLikes = includesValue(exclusiveDietPreferenceValues, dietStyle)
      ? profile.primaryLikes.filter((item) => !includesValue(normalDietPreferenceValues, item))
      : profile.primaryLikes;

    updateProfile({ dietStyle, primaryLikes });
  }

  function deleteDietStyle() {
    const value = profile.dietStyle;

    if (value === "normal") {
      return;
    }

    confirmDelete(
      editor.deletePreferenceTitle,
      formatContent(editor.deletePreferenceMessage, { value }),
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
      editor.deletePreferenceTitle,
      formatContent(editor.deletePreferenceMessage, { value }),
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
      editor.deleteExclusionTitle,
      formatContent(editor.deleteExclusionMessage, { value }),
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
      editor.deleteIntoleranceTitle,
      formatContent(editor.deleteIntoleranceMessage, { value }),
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

    const isQuick = includesValue(quickExceptions, value);

    updateProfile({
      exceptions: addUnique(exceptions, value),
      customExceptions: isQuick ? customExceptions : addUnique(customExceptions, value),
      hiddenExceptions: removeValue(hiddenExceptions, value)
    });

    setCustomException("");
  }

  function deleteException(value: string) {
    const isQuick = includesValue(quickExceptions, value);

    confirmDelete(
      editor.deleteExceptionTitle,
      formatContent(editor.deleteExceptionMessage, { value }),
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
      <Text style={styles.h2}>{editor.introTitle}</Text>
      <Text style={styles.subtitle}>{editor.introSubtitle}</Text>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>{editor.preferencesTitle}</Text>
        <Text style={styles.profileSectionHint}>{editor.preferencesHint}</Text>

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
              label={withPrefix(editor.customPreferencePrefix, value)}
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
            onChangeText={setCustomPreference}
            placeholder={editor.addPreferencePlaceholder}
            returnKeyType="done"
            onSubmitEditing={addCustomPreference}
          />

          <Pressable style={styles.ghostButton} onPress={addCustomPreference}>
            <Text style={styles.ghostButtonText}>
              {withPrefix(editor.addPrefix, editor.addPreferenceButton)}
            </Text>
          </Pressable>
        </View>

        {profile.primaryLikes.length > 0 || profile.dietStyle !== "normal" ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActivePreferencesLabel}</Text>
            <View style={styles.chipRow}>
              {profile.dietStyle !== "normal" ? (
                <Chip label={withPrefix(editor.deletePrefix, profile.dietStyle)} active onPress={deleteDietStyle} />
              ) : null}

              {profile.primaryLikes.map((value) => (
                <Chip key={value} label={withPrefix(editor.deletePrefix, value)} active onPress={() => deletePreference(value)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>{editor.exclusionsTitle}</Text>
        <Text style={styles.profileSectionHint}>{editor.exclusionsHint}</Text>

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
              label={withPrefix(editor.customExclusionPrefix, value)}
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

          <Pressable style={styles.ghostButton} onPress={addCustomExclusion}>
            <Text style={styles.ghostButtonText}>
              {withPrefix(editor.addPrefix, editor.addExclusionButton)}
            </Text>
          </Pressable>
        </View>

        {profile.dislikes.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActiveExclusionsLabel}</Text>
            <View style={styles.chipRow}>
              {profile.dislikes.map((value) => (
                <Chip key={value} label={withPrefix(editor.deletePrefix, value)} active onPress={() => deleteExclusion(value)} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.profileSubBlock}>
          <Text style={styles.label}>{editor.exceptionsLabel}</Text>
          <Text style={styles.profileSectionHint}>
            {editor.exceptionsHint}
          </Text>

          <View style={styles.chipRow}>
            {visibleQuickExceptions.map((value) => (
              <Chip
                key={value}
                label={withPrefix(editor.exceptionPrefix, value)}
                active={exceptions.includes(value)}
                onPress={() => toggleException(value)}
              />
            ))}

            {visibleCustomExceptionValues.map((value) => (
              <Chip
                key={value}
                label={withPrefix(editor.exceptionPrefix, value)}
                active={exceptions.includes(value)}
                onPress={() => toggleException(value)}
              />
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={customException}
            onChangeText={setCustomException}
            placeholder={editor.addExceptionPlaceholder}
            returnKeyType="done"
            onSubmitEditing={addCustomException}
          />

          <Pressable style={styles.ghostButton} onPress={addCustomException}>
            <Text style={styles.ghostButtonText}>
              {withPrefix(editor.addPrefix, editor.addExceptionButton)}
            </Text>
          </Pressable>

          {exceptions.length > 0 ? (
            <View style={styles.profileSubBlock}>
              <Text style={styles.label}>{editor.deleteActiveExceptionsLabel}</Text>
              <View style={styles.chipRow}>
                {exceptions.map((value) => (
                  <Chip key={value} label={withPrefix(editor.deletePrefix, value)} active onPress={() => deleteException(value)} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>{editor.intolerancesTitle}</Text>
        <Text style={styles.profileSectionHint}>{editor.intolerancesHint}</Text>

        <Text style={styles.profileSectionHint}>
          {editor.safetyHint}
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
              label={withPrefix(editor.customIntolerancePrefix, value)}
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

          <Pressable style={styles.ghostButton} onPress={addCustomIntolerance}>
            <Text style={styles.ghostButtonText}>
              {withPrefix(editor.addPrefix, editor.addIntoleranceButton)}
            </Text>
          </Pressable>
        </View>

        {profile.intolerances.length > 0 ? (
          <View style={styles.profileSubBlock}>
            <Text style={styles.label}>{editor.deleteActiveIntolerancesLabel}</Text>
            <View style={styles.chipRow}>
              {profile.intolerances.map((value) => (
                <Chip key={value} label={withPrefix(editor.deletePrefix, value)} active onPress={() => deleteIntolerance(value)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function withPrefix(prefix: string, value: string) {
  return `${prefix} ${value}`;
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
