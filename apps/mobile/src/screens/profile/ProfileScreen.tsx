import React from "react";
import { Pressable, Text } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { ProfileEditor } from "../../components/profile/ProfileEditor";
import { Screen } from "../../components/ui/Screen";
import { styles } from "../../theme/styles";

export function ProfileScreen() {
  const auth = useAuth();
  const { profile, setProfile } = useProfile();

  return (
    <Screen>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.subtitle}>Deine Vorlieben steuern, was PickForMe empfiehlt.</Text>

      <ProfileEditor profile={profile} setProfile={setProfile} />

      <Pressable style={styles.ghostButton} onPress={() => auth.signOut()}>
        <Text style={styles.ghostButtonText}>Abmelden</Text>
      </Pressable>
    </Screen>
  );
}
