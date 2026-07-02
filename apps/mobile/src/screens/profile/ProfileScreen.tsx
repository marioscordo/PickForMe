import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { OutputLocaleField } from "../../components/profile/OutputLocaleField";
import { ProfileEditor, type ProfileEditorSection } from "../../components/profile/ProfileEditor";
import { ActionButton } from "../../components/ui/ActionButton";
import { Screen } from "../../components/ui/Screen";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { resolveOutputLocale } from "../../config/outputLocales";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { radius, semanticColors, spacing, typography } from "../../theme/tokens";

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

  const profileSections: { id: ProfileEditorSection; label: string }[] = [
    { id: "preferences", label: content.profileScreen.preferencesButton },
    { id: "exclusions", label: content.profileScreen.exclusionsButton },
    { id: "intolerances", label: content.profileScreen.intolerancesButton }
  ];
  const exceptions = profile.exceptions ?? [];

  if (activeSection) {
    const activeTitle =
      activeSection === "general"
        ? content.profileScreen.generalButton
        : profileSections.find((section) => section.id === activeSection)?.label ?? content.profileScreen.title;

    const activeSubtitle = activeSection === "general" ? content.profileScreen.subtitle : activeSectionHint(activeSection, content);

    return (
      <Screen>
        <ScreenHeader title={activeTitle} subtitle={activeSubtitle} />
        {activeSection === "general" ? (
          <View style={local.detailStack}>
            <OutputLocaleField
              value={profile.outputLocale}
              onChange={(outputLocale) =>
                setProfile({
                  ...profile,
                  outputLocale: resolveOutputLocale(outputLocale)
                })
              }
            />

            <ActionButton label={content.profileScreen.signOut} variant="secondary" onPress={() => auth.signOut()} />
          </View>
        ) : (
          <ProfileEditor profile={profile} setProfile={setProfile} section={activeSection} hideHeader />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={content.profileScreen.title} />

      <View style={local.settingsList}>
        <ProfileMenuRow
          icon={content.profileScreen.generalIcon}
          title={content.profileScreen.generalButton}
          detail={formatLocaleLabel(profile.outputLocale, profile.outputLocale)}
          onPress={() => setActiveSection("general")}
          isLast
        />
      </View>

      <SectionHeader title={content.profileEditor.introTitle} subtitle={content.profileEditor.introSubtitle} />

      <View style={local.settingsList}>
        <ProfileMenuRow
          icon={content.profileEditor.preferenceValueIcon}
          title={content.profileScreen.preferencesButton}
          detail={activeStatus(profile.primaryLikes.length, content)}
          onPress={() => setActiveSection("preferences")}
        />
        <ProfileMenuRow
          icon={content.profileEditor.exclusionValueIcon}
          title={content.profileScreen.exclusionsButton}
          detail={activeStatus(profile.dislikes.length + exceptions.length, content)}
          onPress={() => setActiveSection("exclusions")}
        />
        <ProfileMenuRow
          icon={content.profileEditor.intoleranceValueIcon}
          title={content.profileScreen.intolerancesButton}
          detail={activeStatus(profile.intolerances.length, content)}
          onPress={() => setActiveSection("intolerances")}
          isLast
        />
      </View>
    </Screen>
  );
}

function ProfileMenuRow({
  icon,
  title,
  detail,
  onPress,
  isLast
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const content = useMobileContent();

  return (
    <Pressable style={[local.menuRow, isLast && local.menuRowLast]} onPress={onPress}>
      <View style={local.menuIcon}>
        <Text style={local.menuIconText}>{icon}</Text>
      </View>
      <View style={local.menuTextBlock}>
        <Text style={local.menuTitle}>{title}</Text>
        <Text style={local.menuDetail}>{detail}</Text>
      </View>
      <Text style={local.menuChevron}>{content.profileScreen.chevron}</Text>
    </Pressable>
  );
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

function formatLocaleLabel(locale: string | undefined, displayLocale: string | undefined) {
  const resolvedLocale = resolveOutputLocale(locale);
  const resolvedDisplayLocale = resolveOutputLocale(displayLocale);
  const [languageCode, regionCode] = resolvedLocale.split("-");
  const languageName = getDisplayName("language", languageCode, resolvedDisplayLocale);
  const regionName = getDisplayName("region", regionCode, resolvedDisplayLocale);

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
  detailStack: {
    gap: spacing.lg
  },
  settingsList: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: spacing.xxl,
    overflow: "hidden"
  },
  menuRow: {
    alignItems: "center",
    backgroundColor: semanticColors.surface,
    borderBottomColor: semanticColors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  menuRowLast: {
    borderBottomWidth: 0
  },
  menuIcon: {
    alignItems: "center",
    backgroundColor: semanticColors.accentSoft,
    borderRadius: radius.sm,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  menuIconText: {
    fontSize: 18
  },
  menuTextBlock: {
    flex: 1
  },
  menuTitle: {
    color: semanticColors.text,
    fontSize: typography.sectionTitle.fontSize,
    fontWeight: typography.sectionTitle.fontWeight,
    lineHeight: typography.sectionTitle.lineHeight
  },
  menuDetail: {
    color: semanticColors.textMuted,
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    marginTop: spacing.xxs
  },
  menuChevron: {
    color: semanticColors.textMuted,
    fontSize: 24,
    fontWeight: "700"
  }
});
