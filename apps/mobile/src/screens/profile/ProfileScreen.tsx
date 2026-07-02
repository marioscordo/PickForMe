import React from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { OutputLocaleField } from "../../components/profile/OutputLocaleField";
import { ProfileEditor } from "../../components/profile/ProfileEditor";
import { Screen } from "../../components/ui/Screen";
import { resolveOutputLocale } from "../../config/outputLocales";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";

export function ProfileScreen({ onGoToMenu }: { onGoToMenu: () => void }) {
  const content = useMobileContent();
  const auth = useAuth();
  const { profile, setProfile } = useProfile();

  return (
    <Screen>
      <Text style={styles.title}>{content.profileScreen.title}</Text>
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

      <ProfileEditor profile={profile} setProfile={setProfile} />

      <View style={styles.card}>
        <Text style={styles.h2}>{content.profileScreen.readyTitle}</Text>
        <Text style={styles.subtitle}>{content.profileScreen.readySubtitle}</Text>

        <Pressable style={styles.button} onPress={onGoToMenu}>
          <Text style={styles.buttonText}>{content.profileScreen.goToMenu}</Text>
        </Pressable>

        <Pressable style={styles.ghostButton} onPress={() => auth.signOut()}>
          <Text style={styles.ghostButtonText}>{content.profileScreen.signOut}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
