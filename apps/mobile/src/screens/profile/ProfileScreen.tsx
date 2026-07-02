import React from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { OutputLocaleField } from "../../components/profile/OutputLocaleField";
import { ProfileEditor, type ProfileEditorSection } from "../../components/profile/ProfileEditor";
import { Screen } from "../../components/ui/Screen";
import { resolveOutputLocale } from "../../config/outputLocales";
import { formatContent } from "../../content/mobileContent";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";

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

    return (
      <Screen>
        <Text style={styles.title}>{activeTitle}</Text>

        {activeSection === "general" ? (
          <View style={styles.profileDetailSurface}>
            <OutputLocaleField
              value={profile.outputLocale}
              onChange={(outputLocale) =>
                setProfile({
                  ...profile,
                  outputLocale: resolveOutputLocale(outputLocale)
                })
              }
            />
            <Text style={styles.subtitle}>{content.profileScreen.subtitle}</Text>

            <Pressable style={styles.ghostButton} onPress={() => auth.signOut()}>
              <Text style={styles.ghostButtonText}>{content.profileScreen.signOut}</Text>
            </Pressable>
          </View>
        ) : (
          <ProfileEditor profile={profile} setProfile={setProfile} section={activeSection} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>{content.profileScreen.title}</Text>

      <View style={styles.profileSettingsList}>
        <ProfileMenuRow
          icon={content.profileScreen.generalIcon}
          title={content.profileScreen.generalButton}
          detail={formatLocaleLabel(profile.outputLocale, profile.outputLocale)}
          onPress={() => setActiveSection("general")}
        />
      </View>

      <View style={styles.profilePromptBlock}>
        <Text style={styles.h2}>{content.profileEditor.introTitle}</Text>
        <Text style={styles.subtitle}>{content.profileEditor.introSubtitle}</Text>
      </View>

      <View style={styles.profileSettingsList}>
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
        />
      </View>
    </Screen>
  );
}

function ProfileMenuRow({
  icon,
  title,
  detail,
  onPress
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const content = useMobileContent();

  return (
    <Pressable style={styles.profileMenuRow} onPress={onPress}>
      <View style={styles.profileMenuIcon}>
        <Text style={styles.profileMenuIconText}>{icon}</Text>
      </View>
      <View style={styles.profileMenuTextBlock}>
        <Text style={styles.profileMenuTitle}>{title}</Text>
        <Text style={styles.profileMenuDetail}>{detail}</Text>
      </View>
      <Text style={styles.profileMenuChevron}>{content.profileScreen.chevron}</Text>
    </Pressable>
  );
}

function activeStatus(count: number, content: ReturnType<typeof useMobileContent>) {
  return count > 0
    ? formatContent(content.profileScreen.activeStatus, { count })
    : content.profileScreen.emptyStatus;
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
