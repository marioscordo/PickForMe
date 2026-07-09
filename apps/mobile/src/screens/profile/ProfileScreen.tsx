import React, { useMemo, useState } from "react";
import { Alert, Dimensions, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Feather } from "@expo/vector-icons";
import { classifyProfilePreference } from "../../api/pickformeApi";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { ProfileEditor, type ProfileEditorSection } from "../../components/profile/ProfileEditor";
import { GustaroHelp } from "../../components/ui/GustaroHelp";
import { Screen } from "../../components/ui/Screen";
import { env } from "../../config/env";
import { OUTPUT_LOCALES, resolveOutputLocale } from "../../config/outputLocales";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { premiumColors, semanticColors, spacing, typography } from "../../theme/tokens";
import type { UserProfile } from "../../types/profile";

const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screenWidth = Dimensions.get("window").width;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

const premiumFont = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type PreferenceOption = {
  label: string;
  value: string;
  kind: "like" | "diet";
};

type ValueOption = string | {
  label: string;
  value: string;
};

export type ProfileSection = "general" | ProfileEditorSection;

export function ProfileScreen({
  activeSection,
  setActiveSection
}: {
  activeSection: ProfileSection | null;
  setActiveSection: (section: ProfileSection | null) => void;
}) {
  const content = useMobileContent();
  const auth = useAuth();
  const { profile, setProfile } = useProfile();
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [customPreference, setCustomPreference] = useState("");
  const [customPreferenceValidationError, setCustomPreferenceValidationError] = useState("");
  const [customPreferenceValidationLoading, setCustomPreferenceValidationLoading] = useState(false);
  const [customExclusion, setCustomExclusion] = useState("");
  const [customIntolerance, setCustomIntolerance] = useState("");
  const [overviewContentHeight, setOverviewContentHeight] = useState(0);
  const [overviewViewportHeight, setOverviewViewportHeight] = useState(0);
  const [overviewScrollY, setOverviewScrollY] = useState(0);

  const editor = content.profileEditor;
  const preferenceOptions = editor.preferenceOptions as PreferenceOption[];
  const quickExclusions = editor.quickExclusions as ValueOption[];
  const allergyOptions = editor.allergyOptions as ValueOption[];
  const normalDietPreferenceValues = editor.normalDietPreferenceValues;
  const exclusiveDietPreferenceValues = editor.exclusiveDietPreferenceValues;

  const profileSections: { id: ProfileEditorSection; label: string }[] = [
    { id: "preferences", label: content.profileScreen.preferencesButton },
    { id: "exclusions", label: content.profileScreen.exclusionsButton },
    { id: "intolerances", label: content.profileScreen.intolerancesButton }
  ];
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
  const visiblePreferenceOptions = preferenceOptions.filter((option) => !includesValue(hiddenPreferences, option.value));
  const visibleCustomPreferenceValues = uniqueValues([
    ...customPreferences,
    ...profile.primaryLikes.filter((value) => !includesValue(quickPreferenceValues, value))
  ]).filter((value) => !includesValue(hiddenPreferences, value));
  const visibleQuickExclusions = quickExclusions.filter((option) => !includesValue(hiddenExclusions, optionValue(option)));
  const visibleCustomExclusionValues = uniqueValues([
    ...customExclusions,
    ...profile.dislikes.filter((value) => !includesValue(quickExclusionValues, value))
  ]).filter((value) => !includesValue(hiddenExclusions, value));
  const visibleAllergyOptions = allergyOptions.filter((option) => !includesValue(hiddenIntolerances, optionValue(option)));
  const visibleCustomIntoleranceValues = uniqueValues([
    ...customIntolerances,
    ...profile.intolerances.filter((value) => !includesValue(quickIntoleranceValues, value))
  ]).filter((value) => !includesValue(hiddenIntolerances, value));
  const overviewCanScrollFurther = overviewContentHeight > overviewViewportHeight + 18 && overviewScrollY + overviewViewportHeight < overviewContentHeight - 36;
  const selectedOutputLocale = resolveOutputLocale(profile.outputLocale);
  const outputLocaleOptions = useMemo(
    () =>
      OUTPUT_LOCALES.map((locale) => ({
        locale,
        label: formatLocaleLabel(locale, selectedOutputLocale)
      })),
    [selectedOutputLocale]
  );

  function handleOverviewLayout(event: LayoutChangeEvent) {
    setOverviewViewportHeight(event.nativeEvent.layout.height);
  }

  function handleOverviewScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setOverviewScrollY(event.nativeEvent.contentOffset.y);
  }

  if (activeSection) {
    const activeTitle =
      activeSection === "general"
        ? content.profileScreen.generalButton
        : profileSections.find((section) => section.id === activeSection)?.label ?? content.profileScreen.title;

    const activeSubtitle = activeSection === "general" ? content.profileScreen.subtitle : activeSectionHint(activeSection, content);
    const activeHelpTopic =
      activeSection === "general"
        ? content.help.profileGeneral
        : activeSection === "preferences"
          ? content.help.profilePreferences
          : activeSection === "exclusions"
            ? content.help.profileExclusions
            : content.help.profileIntolerances;

    function confirmDeleteAccount() {
      setDeleteAccountError(null);
      Alert.alert(
        content.profileScreen.deleteAccountConfirmTitle,
        content.profileScreen.deleteAccountConfirmText,
        [
          {
            text: content.common.cancel,
            style: "cancel"
          },
          {
            text: content.profileScreen.deleteAccountConfirmAction,
            style: "destructive",
            onPress: deleteAccount
          }
        ]
      );
    }

    async function deleteAccount() {
      setDeleteAccountError(null);
      setDeleteAccountPending(true);

      try {
        await auth.deleteAccount();
      } catch (error) {
        setDeleteAccountError(error instanceof Error ? error.message : content.profileScreen.deleteAccountFailed);
      } finally {
        setDeleteAccountPending(false);
      }
    }

    async function openLegalUrl(url: string) {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(content.profileScreen.legalLinkFailed);
      }
    }



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

    function setDietStyle(dietStyle: UserProfile["dietStyle"]) {
      updateProfile((currentProfile) => {
        const primaryLikes = includesValue(exclusiveDietPreferenceValues, dietStyle)
          ? currentProfile.primaryLikes.filter((item) => !includesValue(normalDietPreferenceValues, item))
          : currentProfile.primaryLikes;

        return { dietStyle, primaryLikes };
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

    function preferenceAlreadyExists(value: string) {
      return [
        profile.primaryLikes,
        customPreferences,
        quickPreferenceValues,
        hiddenPreferences
      ].some((values) => includesValue(values, value));
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

    function displayPreferenceValue(value: string) {
      return optionMapLabel(preferenceLabels, value);
    }

    function displayExclusionValue(value: string) {
      return optionMapLabel(exclusionLabels, value);
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

    function displayIntoleranceValue(value: string) {
      return optionMapLabel(intoleranceLabels, value);
    }

    if (activeSection === "general") {
      function selectOutputLocale(outputLocale: string) {
        setProfile((currentProfile) => ({
          ...currentProfile,
          outputLocale: resolveOutputLocale(outputLocale)
        }));
        setLanguageMenuOpen(false);
      }

      return (
        <Screen contentContainerStyle={local.generalContent}>
          <PremiumProfileBackLink
            accessory={<GustaroHelp common={content.help.common} topic={activeHelpTopic} />}
            label={content.profileScreen.title}
            onPress={() => setActiveSection(null)}
          />

          <PremiumProfileDetailHeader title={activeTitle} subtitle={activeSubtitle} />

          <View style={local.languageCard}>
            <Text style={local.languageLabel}>{content.outputLocale.label}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLanguageMenuOpen(true)}
              style={({ pressed }) => [local.languageSelect, pressed ? local.pressedSoft : null]}
            >
              <Text style={local.languageSelectText}>{formatCompactLocaleLabel(profile.outputLocale)}</Text>
              <Feather color="#AA7C1E" name="chevron-down" size={s(24)} />
            </Pressable>
          </View>

          <View style={local.generalRows}>
            <PremiumActionRow
              icon="shield"
              label={content.profileScreen.privacyPolicy}
              onPress={() => openLegalUrl(env.privacyUrl)}
            />
            <PremiumActionRow
              icon="help-circle"
              label={content.profileScreen.support}
              onPress={() => openLegalUrl(env.supportUrl)}
            />
            <PremiumActionRow icon="log-out" label={content.profileScreen.signOut} onPress={() => auth.signOut()} />
            {deleteAccountError ? (
              <Text style={local.errorText}>{deleteAccountError}</Text>
            ) : null}
            <PremiumActionRow
              disabled={deleteAccountPending}
              icon="trash-2"
              label={deleteAccountPending ? content.profileScreen.deleteAccountLoading : content.profileScreen.deleteAccount}
              onPress={confirmDeleteAccount}
            />
          </View>

          <Modal visible={languageMenuOpen} transparent animationType="fade" onRequestClose={() => setLanguageMenuOpen(false)}>
            <Pressable style={local.languageBackdrop} onPress={() => setLanguageMenuOpen(false)}>
              <View style={local.languageMenu}>
                <Text style={local.languageMenuTitle}>{content.outputLocale.menuTitle}</Text>
                {outputLocaleOptions.map((option) => {
                  const active = option.locale === selectedOutputLocale;

                  return (
                    <Pressable
                      key={option.locale}
                      accessibilityRole="button"
                      style={[local.languageOption, active ? local.languageOptionActive : null]}
                      onPress={() => selectOutputLocale(option.locale)}
                    >
                      <View style={local.languageOptionTextBlock}>
                        <Text style={[local.languageOptionText, active ? local.languageOptionTextActive : null]}>{option.label}</Text>
                        <Text style={[local.languageOptionCode, active ? local.languageOptionTextActive : null]}>{formatCompactLocaleLabel(option.locale)}</Text>
                      </View>
                      {active ? <Feather color="#C6A04A" name="check" size={s(22)} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Modal>
        </Screen>
      );
    }



    if (activeSection === "preferences") {
      return (
        <Screen contentContainerStyle={local.detailContent}>
          <PremiumProfileBackLink
            accessory={<GustaroHelp common={content.help.common} topic={activeHelpTopic} />}
            label={content.profileScreen.title}
            onPress={() => setActiveSection(null)}
          />
          <PremiumProfileDetailHeader title={activeTitle} subtitle={activeSubtitle} />

          <View style={local.premiumEditorStack}>
            <View style={local.premiumChipRow}>
              {visiblePreferenceOptions.map((option) => {
                const active = option.kind === "diet"
                  ? profile.dietStyle === option.value
                  : profile.primaryLikes.includes(option.value);

                return (
                  <PremiumProfileChip
                    key={option.value}
                    active={active}
                    icon="thumbs-up"
                    label={option.label}
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
                <PremiumProfileChip
                  key={value}
                  active={profile.primaryLikes.includes(value)}
                  icon="thumbs-up"
                  label={displayPreferenceValue(value)}
                  onPress={() => toggleLike(value)}
                />
              ))}
            </View>

            <PremiumProfileSubBlock title={editor.addPreferenceLabel}>
              <PremiumProfileInput
                value={customPreference}
                onChangeText={(value) => {
                  setCustomPreference(value);
                  setCustomPreferenceValidationError("");
                }}
                placeholder={editor.addPreferencePlaceholder}
                onSubmitEditing={addCustomPreference}
              />
              {customPreferenceValidationError ? (
                <Text style={local.preferenceValidationError}>{customPreferenceValidationError}</Text>
              ) : null}
              <PremiumEditorButton
                disabled={customPreference.trim().length === 0 || customPreferenceValidationLoading}
                icon="thumbs-up"
                label={editor.addPreferenceButton}
                ready={customPreference.trim().length > 0 && !customPreferenceValidationLoading}
                onPress={addCustomPreference}
              />
            </PremiumProfileSubBlock>

            {profile.primaryLikes.length > 0 || profile.dietStyle !== "normal" ? (
              <PremiumProfileSubBlock title={editor.deleteActivePreferencesLabel} compact>
                <View style={local.premiumChipRowCompact}>
                  {profile.dietStyle !== "normal" ? (
                    <PremiumProfileChip
                      active
                      compact
                      icon="thumbs-up"
                      label={displayPreferenceValue(profile.dietStyle)}
                      onPress={deleteDietStyle}
                    />
                  ) : null}

                  {profile.primaryLikes.map((value) => (
                    <PremiumProfileChip
                      key={value}
                      active
                      compact
                      icon="thumbs-up"
                      label={displayPreferenceValue(value)}
                      onPress={() => deletePreference(value)}
                    />
                  ))}
                </View>
              </PremiumProfileSubBlock>
            ) : null}
          </View>
        </Screen>
      );
    }

    if (activeSection === "exclusions") {
      return (
        <Screen contentContainerStyle={local.detailContent}>
          <PremiumProfileBackLink
            accessory={<GustaroHelp common={content.help.common} topic={activeHelpTopic} />}
            label={content.profileScreen.title}
            onPress={() => setActiveSection(null)}
          />
          <PremiumProfileDetailHeader title={activeTitle} subtitle={activeSubtitle} />

          <View style={local.premiumEditorStack}>
            <View style={local.premiumChipRow}>
              {visibleQuickExclusions.map((option) => {
                const value = optionValue(option);

                return (
                  <PremiumProfileChip
                    key={value}
                    active={profile.dislikes.includes(value)}
                    icon="thumbs-down"
                    label={optionLabel(option)}
                    onPress={() => toggleDislike(value)}
                  />
                );
              })}

              {visibleCustomExclusionValues.map((value) => (
                <PremiumProfileChip
                  key={value}
                  active={profile.dislikes.includes(value)}
                  icon="thumbs-down"
                  label={displayExclusionValue(value)}
                  onPress={() => toggleDislike(value)}
                />
              ))}
            </View>

            <PremiumProfileSubBlock title={editor.addExclusionLabel}>
              <PremiumProfileInput
                value={customExclusion}
                onChangeText={setCustomExclusion}
                placeholder={editor.addExclusionPlaceholder}
                onSubmitEditing={addCustomExclusion}
              />
              <PremiumEditorButton
                icon="thumbs-down"
                label={editor.addExclusionButton}
                ready={customExclusion.trim().length > 0}
                onPress={addCustomExclusion}
              />
            </PremiumProfileSubBlock>

            {profile.dislikes.length > 0 ? (
              <PremiumProfileSubBlock title={editor.deleteActiveExclusionsLabel} compact>
                <View style={local.premiumChipRowCompact}>
                  {profile.dislikes.map((value) => (
                    <PremiumProfileChip
                      key={value}
                      active
                      compact
                      icon="thumbs-down"
                      label={displayExclusionValue(value)}
                      onPress={() => deleteExclusion(value)}
                    />
                  ))}
                </View>
              </PremiumProfileSubBlock>
            ) : null}

          </View>
        </Screen>
      );
    }



    if (activeSection === "intolerances") {
      return (
        <Screen contentContainerStyle={local.detailContent}>
          <PremiumProfileBackLink
            accessory={<GustaroHelp common={content.help.common} topic={activeHelpTopic} />}
            label={content.profileScreen.title}
            onPress={() => setActiveSection(null)}
          />
          <PremiumProfileDetailHeader title={activeTitle} subtitle={activeSubtitle} />

          <View style={local.premiumEditorStack}>
            <PremiumSafetyCard text={editor.safetyHint} />

            <View style={local.premiumChipRow}>
              {visibleAllergyOptions.map((option) => {
                const value = optionValue(option);

                return (
                  <PremiumFeatherChip
                    key={value}
                    active={profile.intolerances.includes(value)}
                    icon="alert-circle"
                    label={optionLabel(option)}
                    onPress={() => toggleIntolerance(value)}
                  />
                );
              })}

              {visibleCustomIntoleranceValues.map((value) => (
                <PremiumFeatherChip
                  key={value}
                  active={profile.intolerances.includes(value)}
                  icon="alert-circle"
                  label={displayIntoleranceValue(value)}
                  onPress={() => toggleIntolerance(value)}
                />
              ))}
            </View>

            <PremiumProfileSubBlock title={editor.addIntoleranceLabel}>
              <PremiumProfileInput
                value={customIntolerance}
                onChangeText={setCustomIntolerance}
                placeholder={editor.addIntolerancePlaceholder}
                onSubmitEditing={addCustomIntolerance}
              />
              <PremiumEditorButton
                icon="plus-circle"
                label={editor.addIntoleranceButton}
                ready={customIntolerance.trim().length > 0}
                onPress={addCustomIntolerance}
              />
            </PremiumProfileSubBlock>

            {profile.intolerances.length > 0 ? (
              <PremiumProfileSubBlock title={editor.deleteActiveIntolerancesLabel} compact>
                <View style={local.premiumChipRowCompact}>
                  {profile.intolerances.map((value) => (
                    <PremiumFeatherChip
                      key={value}
                      active
                      compact
                      icon="slash"
                      label={displayIntoleranceValue(value)}
                      onPress={() => deleteIntolerance(value)}
                    />
                  ))}
                </View>
              </PremiumProfileSubBlock>
            ) : null}
          </View>
        </Screen>
      );
    }

    return (
      <Screen contentContainerStyle={local.detailContent}>
        <PremiumProfileBackLink
          accessory={<GustaroHelp common={content.help.common} topic={activeHelpTopic} />}
          label={content.profileScreen.title}
          onPress={() => setActiveSection(null)}
        />
        <PremiumProfileDetailHeader title={activeTitle} subtitle={activeSubtitle} />
        <ProfileEditor profile={profile} setProfile={setProfile} section={activeSection} hideHeader />
      </Screen>
    );
  }

  return (
    <SafeAreaView style={local.overviewShell}>
      <ScrollView
        contentContainerStyle={local.overviewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={local.heroHeader}>
          <GustaroHelp common={content.help.common} topic={content.help.profile} style={local.overviewHelpButton} />
          <Text style={local.heroTitle}>{content.profileScreen.title}</Text>
          <View style={local.heroAccent}>
            <View style={local.heroLine} />
            <Text style={local.heroStar}>{"\u2605"}</Text>
            <View style={local.heroLine} />
          </View>
        </View>

        <View style={local.singleCard}>
          <ProfileMenuRow
            icon={content.profileScreen.generalIcon}
            iconVariant="general"
            title={content.profileScreen.generalButton}
            detail={formatCompactLocaleLabel(profile.outputLocale)}
            onPress={() => setActiveSection("general")}
            isLast
          />
        </View>

        <View style={local.introBlock}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} style={local.introTitle}>{content.profileEditor.introTitle}</Text>
          <View style={local.introAccent}>
            <View style={local.introLine} />
            <Text style={local.introStar}>{"\u2605"}</Text>
            <View style={local.introLine} />
          </View>
          <Text style={local.introSubtitle}>{content.profileEditor.introSubtitle}</Text>
        </View>

        <View style={local.settingsList}>
          <ProfileMenuRow
            icon={content.profileEditor.preferenceValueIcon}
            iconVariant="preferences"
            title={content.profileScreen.preferencesButton}
            detail={activeStatus(profile.primaryLikes.length, content)}
            onPress={() => setActiveSection("preferences")}
          />
          <ProfileMenuRow
            icon={content.profileEditor.exclusionValueIcon}
            iconVariant="exclusions"
            title={content.profileScreen.exclusionsButton}
            detail={activeStatus(profile.dislikes.length, content)}
            onPress={() => setActiveSection("exclusions")}
          />
          <ProfileMenuRow
            icon={content.profileEditor.intoleranceValueIcon}
            iconVariant="intolerances"
            title={content.profileScreen.intolerancesButton}
            detail={activeStatus(profile.intolerances.length, content)}
            onPress={() => setActiveSection("intolerances")}
            isLast
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}



function PremiumSafetyCard({ text }: { text: string }) {
  return (
    <View style={local.premiumSafetyCard}>
      <View style={local.premiumSafetyIcon}>
        <Feather color="#AA7C1E" name="shield" size={s(22)} />
      </View>
      <Text style={local.premiumSafetyText}>{text}</Text>
    </View>
  );
}

function PremiumFeatherChip({
  active,
  compact,
  icon,
  label,
  onPress
}: {
  active?: boolean;
  compact?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        local.premiumChip,
        active ? local.premiumChipActive : null,
        compact ? local.premiumChipCompact : null,
        pressed ? local.pressedSoft : null
      ]}
    >
      <View style={[local.premiumChipIcon, compact ? local.premiumChipIconCompact : null]}>
        <Feather color="#AA7C1E" name={icon} size={compact ? s(15) : s(17)} />
      </View>
      <Text style={[local.premiumChipText, compact ? local.premiumChipTextCompact : null]}>{label}</Text>
    </Pressable>
  );
}

function PremiumProfileBackLink({
  accessory,
  label,
  onPress
}: {
  accessory?: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const backLink = (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={[local.generalBackLink, accessory ? local.generalBackLinkInline : null]}
    >
      <Text style={local.generalBackText}>{"\u2039"} {label}</Text>
    </Pressable>
  );

  if (!accessory) {
    return backLink;
  }

  return (
    <View style={local.detailUtilityRow}>
      {backLink}
      {accessory}
    </View>
  );
}

function PremiumProfileDetailHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const isLongTitle = title.length > 24;

  return (
    <View style={local.generalHeader}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[local.detailTitle, isLongTitle ? local.detailTitleLong : null]}
      >
        {title}
      </Text>
      <Text style={local.generalSubtitle}>{subtitle}</Text>
    </View>
  );
}

function PremiumProfileSubBlock({
  children,
  compact,
  title
}: {
  children: React.ReactNode;
  compact?: boolean;
  title: string;
}) {
  return (
    <View style={[local.premiumSubBlock, compact ? local.premiumSubBlockCompact : null]}>
      <Text style={local.premiumSubLabel}>{title}</Text>
      {children}
    </View>
  );
}

function PremiumProfileChip({
  active,
  compact,
  icon,
  label,
  onPress
}: {
  active?: boolean;
  compact?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        local.premiumChip,
        active ? local.premiumChipActive : null,
        compact ? local.premiumChipCompact : null,
        pressed ? local.pressedSoft : null
      ]}
    >
      <View style={[local.premiumChipIcon, compact ? local.premiumChipIconCompact : null]}>
        <Feather color="#AA7C1E" name={icon} size={compact ? s(15) : s(17)} />
      </View>
      <Text style={[local.premiumChipText, compact ? local.premiumChipTextCompact : null]}>{label}</Text>
    </Pressable>
  );
}

function PremiumProfileInput({
  onChangeText,
  onSubmitEditing,
  placeholder,
  value
}: {
  onChangeText: (value: string) => void;
  onSubmitEditing: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <TextInput
      placeholderTextColor="#8A8378"
      returnKeyType="done"
      style={local.premiumInput}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      placeholder={placeholder}
    />
  );
}

function PremiumEditorButton({
  disabled,
  icon,
  label,
  onPress,
  ready
}: {
  disabled?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
  ready: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        local.premiumEditorButton,
        ready ? local.premiumEditorButtonReady : null,
        disabled ? local.disabled : null,
        pressed ? local.pressedSoft : null
      ]}
    >
      <Feather color={ready ? "#D7BE83" : "#AA7C1E"} name={icon} size={s(17)} />
      <Text style={[local.premiumEditorButtonText, ready ? local.premiumEditorButtonTextReady : null]}>{label}</Text>
    </Pressable>
  );
}

function PremiumActionRow({
  disabled,
  icon,
  label,
  onPress
}: {
  disabled?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [local.generalActionRow, pressed ? local.pressedSoft : null, disabled ? local.disabled : null]}
    >
      <View style={local.generalActionIcon}>
        <Feather color="#AA7C1E" name={icon} size={s(22)} />
      </View>
      <Text style={local.generalActionText}>{label}</Text>
      <Feather color="#AA7C1E" name="chevron-right" size={s(24)} />
    </Pressable>
  );
}

function ProfileMenuRow({
  icon,
  iconVariant,
  title,
  detail,
  onPress,
  isLast
}: {
  icon: string;
  iconVariant?: "general" | "preferences" | "exclusions" | "intolerances";
  title: string;
  detail: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable style={[local.menuRow, isLast && local.menuRowLast]} onPress={onPress}>
      <View style={local.menuIcon}>
        <ProfileIcon iconVariant={iconVariant} fallback={icon} />
      </View>
      <View style={local.menuTextBlock}>
        <Text numberOfLines={iconVariant === "intolerances" ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.82} style={[local.menuTitle, iconVariant === "intolerances" ? local.menuTitleTwoLine : null]}>{title}</Text>
        <Text style={local.menuDetail}>{detail}</Text>
      </View>
      <Feather color="#AA7C1E" name="chevron-right" size={s(30)} />
    </Pressable>
  );
}

function ProfileIcon({
  fallback,
  iconVariant
}: {
  fallback: string;
  iconVariant?: "general" | "preferences" | "exclusions" | "intolerances";
}) {
  const iconName = iconVariant === "general"
    ? "globe"
    : iconVariant === "preferences"
      ? "heart"
      : iconVariant === "exclusions"
        ? "minus-circle"
        : iconVariant === "intolerances"
          ? "alert-triangle"
          : null;

  if (!iconName) {
    return <Text style={local.menuIconText}>{fallback}</Text>;
  }

  return <Feather color="#AA7C1E" name={iconName} size={s(25)} />;
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

function formatCompactLocaleLabel(locale: string | undefined) {
  const resolvedLocale = resolveOutputLocale(locale) ?? "de-DE";
  const [rawLanguageCode, rawRegionCode] = resolvedLocale.split("-");
  const languageCode = rawLanguageCode ?? "de";

  return rawRegionCode ? `${languageCode} (${rawRegionCode})` : languageCode;
}

function activeStatus(count: number, content: ReturnType<typeof useMobileContent>) {
  return count > 0
    ? formatContent(content.profileScreen.activeStatus, { count })
    : content.profileScreen.emptyStatus;
}

function activeSectionHint(activeSection: ProfileEditorSection, content: ReturnType<typeof useMobileContent>) {
  if (activeSection === "preferences") {
    return content.profileEditor.preferencesHint;
  }

  if (activeSection === "exclusions") {
    return content.profileEditor.exclusionsHint;
  }

  return content.profileEditor.intolerancesHint;
}

function formatLocaleLabel(locale: string, displayLocale: string) {
  const [languageCode, regionCode] = locale.split("-");
  const languageName = getDisplayName("language", languageCode, displayLocale);
  const regionName = getDisplayName("region", regionCode, displayLocale);

  return regionName ? `${languageName} (${regionName})` : languageName;
}

function getDisplayName(type: "language" | "region", code: string | undefined, displayLocale: string) {
  if (!code) {
    return "";
  }

  try {
    if (typeof Intl.DisplayNames === "function") {
      return new Intl.DisplayNames([displayLocale], { type }).of(code) ?? code;
    }
  } catch {
  }

  return code;
}

const local = StyleSheet.create({
  overviewShell: {
    backgroundColor: premiumColors.background,
    flex: 1
  },
  overviewContent: {
    backgroundColor: premiumColors.background,
    flexGrow: 1,
    paddingBottom: s(8),
    paddingHorizontal: s(24),
    paddingTop: s(42)
  },
  heroHeader: {
    alignItems: "flex-start",
    marginBottom: s(26),
    position: "relative"
  },
  overviewHelpButton: {
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 5
  },
  heroTitle: {
    color: premiumColors.olive,
    fontFamily: premiumFont,
    fontSize: fs(56),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(62)
  },
  heroAccent: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: s(12)
  },
  heroLine: {
    backgroundColor: premiumColors.gold,
    height: 1,
    width: s(66)
  },
  heroStar: {
    color: premiumColors.gold,
    fontSize: fs(18),
    lineHeight: fs(18),
    marginHorizontal: s(12)
  },
  singleCard: {
    backgroundColor: premiumColors.surface,
    borderColor: "#E4D4B6",
    borderRadius: s(28),
    borderWidth: 1,
    marginBottom: s(32),
    overflow: "hidden",
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(14) },
    shadowOpacity: 0.08,
    shadowRadius: s(24)
  },
  introBlock: {
    alignItems: "center",
    marginBottom: s(18)
  },
  introTitle: {
    color: premiumColors.olive,
    fontFamily: premiumFont,
    fontSize: fs(21),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(27),
    textAlign: "center"
  },
  introAccent: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: s(10),
    marginTop: s(10)
  },
  introLine: {
    backgroundColor: premiumColors.gold,
    height: 1,
    width: s(48)
  },
  introStar: {
    color: premiumColors.gold,
    fontSize: fs(18),
    lineHeight: fs(18),
    marginHorizontal: s(12)
  },
  introSubtitle: {
    color: premiumColors.textMuted,
    fontSize: fs(15),
    fontWeight: "500",
    lineHeight: fs(21),
    maxWidth: s(306),
    textAlign: "center"
  },
  generalContent: {
    backgroundColor: premiumColors.background,
    paddingBottom: s(210),
    paddingHorizontal: s(28),
    paddingTop: s(26)
  },
  detailContent: {
    paddingBottom: s(210)
  },
  generalBackLink: {
    alignSelf: "flex-start",
    marginBottom: s(30),
    paddingRight: s(14),
    paddingVertical: s(4)
  },
  generalBackLinkInline: {
    marginBottom: 0
  },
  detailUtilityRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: s(30)
  },
  generalBackText: {
    color: premiumColors.olive,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(22)
  },
  generalHeader: {
    marginBottom: s(32)
  },
  detailTitle: {
    color: "#182C1B",
    fontFamily: premiumFont,
    fontSize: fs(35),
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: fs(43)
  },
  detailTitleLong: {
    fontSize: fs(29),
    lineHeight: fs(37)
  },
  generalSubtitle: {
    color: "#6F6A61",
    fontSize: fs(18),
    fontWeight: "400",
    lineHeight: fs(27),
    marginTop: s(12)
  },
  languageCard: {
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(28),
    borderWidth: 1,
    marginBottom: s(20),
    padding: s(22),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(12) },
    shadowOpacity: 0.07,
    shadowRadius: s(22)
  },
  languageLabel: {
    color: premiumColors.olive,
    fontSize: fs(18),
    fontWeight: "800",
    lineHeight: fs(24),
    marginBottom: s(12)
  },
  languageSelect: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "#E4D4B6",
    borderRadius: s(18),
    borderWidth: 1,
    flexDirection: "row",
    minHeight: s(58),
    paddingHorizontal: s(18)
  },
  languageSelectText: {
    color: "#182C1B",
    flex: 1,
    fontSize: fs(19),
    fontWeight: "800",
    lineHeight: fs(25)
  },
  generalRows: {
    gap: s(14)
  },
  generalActionRow: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(22),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(14),
    minHeight: s(62),
    paddingHorizontal: s(16),
    paddingVertical: s(12),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.045,
    shadowRadius: s(14)
  },
  generalActionIcon: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "rgba(228, 212, 182, 0.76)",
    borderRadius: s(17),
    borderWidth: 1,
    height: s(42),
    justifyContent: "center",
    width: s(42)
  },
  generalActionText: {
    color: premiumColors.olive,
    flex: 1,
    fontSize: fs(17),
    fontWeight: "800",
    lineHeight: fs(23)
  },
  pressedSoft: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }]
  },
  disabled: {
    opacity: 0.58
  },
  premiumSafetyCard: {
    alignItems: "flex-start",
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(26),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(14),
    padding: s(20),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(10) },
    shadowOpacity: 0.05,
    shadowRadius: s(18)
  },
  premiumSafetyIcon: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "rgba(228, 212, 182, 0.76)",
    borderRadius: s(18),
    borderWidth: 1,
    height: s(40),
    justifyContent: "center",
    width: s(40)
  },
  premiumSafetyText: {
    color: "#6F6A61",
    flex: 1,
    fontSize: fs(16),
    fontWeight: "400",
    lineHeight: fs(25)
  },
  premiumEditorStack: {
    gap: s(24)
  },
  premiumChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: s(10)
  },
  premiumChipRowCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: s(8)
  },
  premiumChip: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(999),
    borderWidth: 1,
    flexDirection: "row",
    minHeight: s(50),
    paddingLeft: s(8),
    paddingRight: s(15),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(7) },
    shadowOpacity: 0.045,
    shadowRadius: s(12)
  },
  premiumChipActive: {
    backgroundColor: "#F7F1E7",
    borderColor: "#C6A04A"
  },
  premiumChipCompact: {
    minHeight: s(43),
    paddingLeft: s(7),
    paddingRight: s(13)
  },
  premiumChipIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderColor: "rgba(228, 212, 182, 0.7)",
    borderRadius: s(16),
    borderWidth: 1,
    height: s(32),
    justifyContent: "center",
    marginRight: s(9),
    width: s(32)
  },
  premiumChipIconCompact: {
    height: s(27),
    marginRight: s(7),
    width: s(27)
  },
  premiumChipIconText: {
    fontSize: fs(15),
    lineHeight: fs(18)
  },
  premiumChipIconTextCompact: {
    fontSize: fs(13),
    lineHeight: fs(16)
  },
  premiumChipText: {
    color: premiumColors.olive,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21)
  },
  premiumChipTextCompact: {
    fontSize: fs(14),
    lineHeight: fs(19)
  },
  premiumSubBlock: {
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(24),
    borderWidth: 1,
    gap: s(14),
    padding: s(18),
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(10) },
    shadowOpacity: 0.055,
    shadowRadius: s(18)
  },
  premiumSubBlockCompact: {
    paddingVertical: s(16)
  },
  premiumNestedBlock: {
    gap: s(12),
    marginTop: s(6)
  },
  premiumSubLabel: {
    color: premiumColors.olive,
    fontSize: fs(18),
    fontWeight: "800",
    lineHeight: fs(24)
  },
  premiumSectionHint: {
    color: "#6F6A61",
    fontSize: fs(16),
    fontWeight: "400",
    lineHeight: fs(23)
  },
  premiumInput: {
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(20),
    borderWidth: 1,
    color: "#151510",
    fontSize: fs(17),
    fontWeight: "600",
    lineHeight: fs(23),
    minHeight: s(58),
    paddingHorizontal: s(17)
  },
  preferenceValidationError: {
    color: semanticColors.danger,
    fontSize: fs(14),
    fontWeight: "700",
    lineHeight: fs(20)
  },
  premiumEditorButton: {
    alignItems: "center",
    backgroundColor: "#F7F1E7",
    borderColor: "#E4D4B6",
    borderRadius: s(999),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(10),
    justifyContent: "center",
    minHeight: s(56),
    paddingHorizontal: s(18)
  },
  premiumEditorButtonReady: {
    backgroundColor: "#1F3B24",
    borderColor: "#1F3B24",
    shadowColor: "#1F3B24",
    shadowOffset: { width: 0, height: s(9) },
    shadowOpacity: 0.16,
    shadowRadius: s(15)
  },
  premiumEditorButtonIcon: {
    color: "#AA7C1E",
    fontSize: fs(14),
    lineHeight: fs(18)
  },
  premiumEditorButtonIconReady: {
    color: "#D7BE83"
  },
  premiumEditorButtonText: {
    color: premiumColors.olive,
    fontSize: fs(17),
    fontWeight: "800",
    lineHeight: fs(22)
  },
  premiumEditorButtonTextReady: {
    color: "#FFFFFF"
  },
  languageBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(24, 44, 27, 0.28)",
    flex: 1,
    justifyContent: "center",
    padding: s(22)
  },
  languageMenu: {
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(26),
    borderWidth: 1,
    maxWidth: 420,
    padding: s(16),
    shadowColor: "#1F271C",
    shadowOffset: { width: 0, height: s(18) },
    shadowOpacity: 0.12,
    shadowRadius: s(28),
    width: "100%"
  },
  languageMenuTitle: {
    color: "#182C1B",
    fontSize: fs(19),
    fontWeight: "800",
    lineHeight: fs(25),
    marginBottom: s(12)
  },
  languageOption: {
    alignItems: "center",
    backgroundColor: "#FFFDF8",
    borderColor: "#E4D4B6",
    borderRadius: s(18),
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: s(8),
    minHeight: s(58),
    paddingHorizontal: s(14),
    paddingVertical: s(10)
  },
  languageOptionActive: {
    backgroundColor: "#F7F1E7",
    borderColor: "#C6A04A"
  },
  languageOptionTextBlock: {
    flex: 1
  },
  languageOptionText: {
    color: "#151510",
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(22)
  },
  languageOptionCode: {
    color: "#6F6A61",
    fontSize: fs(13),
    fontWeight: "700",
    lineHeight: fs(18),
    marginTop: s(2)
  },
  languageOptionTextActive: {
    color: "#182C1B"
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: spacing.md,
    paddingBottom: spacing.xxs,
    paddingRight: spacing.md,
    paddingTop: spacing.xxs
  },
  backButtonText: {
    color: premiumColors.olive,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  settingsList: {
    backgroundColor: premiumColors.surface,
    borderColor: "#E4D4B6",
    borderRadius: s(28),
    borderWidth: 1,
    marginBottom: s(4),
    overflow: "hidden",
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(14) },
    shadowOpacity: 0.08,
    shadowRadius: s(24)
  },
  menuRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.84)",
    borderBottomColor: "rgba(228, 212, 182, 0.72)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: s(16),
    minHeight: s(78),
    paddingHorizontal: s(16),
    paddingVertical: s(14)
  },
  menuRowLast: {
    borderBottomWidth: 0
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderColor: "rgba(228, 212, 182, 0.62)",
    borderRadius: s(19),
    borderWidth: 1,
    height: s(46),
    justifyContent: "center",
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.08,
    shadowRadius: s(16),
    width: s(46)
  },
  menuIconText: {
    color: "#AA7C1E",
    fontSize: fs(21),
    fontWeight: "400",
    lineHeight: fs(24),
    textAlign: "center"
  },
  menuTextBlock: {
    flex: 1
  },
  menuTitle: {
    color: premiumColors.olive,
    fontSize: fs(18),
    fontWeight: "800",
    lineHeight: fs(22)
  },
  menuTitleTwoLine: {
    fontSize: fs(18),
    lineHeight: fs(22)
  },
  menuDetail: {
    color: premiumColors.textMuted,
    fontSize: fs(15),
    fontWeight: "500",
    lineHeight: fs(20),
    marginTop: s(2)
  },
  menuChevron: {
    color: "#AA7C1E",
    fontSize: fs(36),
    fontWeight: "300",
    lineHeight: fs(38),
    textAlign: "center",
    width: s(26)
  },
  errorText: {
    color: semanticColors.danger,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    textAlign: "center"
  }
});
