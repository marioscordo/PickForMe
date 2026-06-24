import React from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { ProfileEditor } from "../../components/profile/ProfileEditor";
import { Screen } from "../../components/ui/Screen";
import { styles } from "../../theme/styles";

export function ProfileScreen({ onGoToMenu }: { onGoToMenu: () => void }) {
  const auth = useAuth();
  const { profile, setProfile } = useProfile();

  return (
    <Screen>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.subtitle}>PickForMe merkt sich, was Dir wichtig ist — ohne Fragebogen.</Text>

      <ProfileEditor profile={profile} setProfile={setProfile} />

      <View style={styles.card}>
        <Text style={styles.h2}>Bereit für die Speisekarte?</Text>
        <Text style={styles.subtitle}>Dein Profil wirkt sofort bei der nächsten Empfehlung.</Text>

        <Pressable style={styles.button} onPress={onGoToMenu}>
          <Text style={styles.buttonText}>🍽️ Zur Speisekarte</Text>
        </Pressable>

        <Pressable style={styles.ghostButton} onPress={() => auth.signOut()}>
          <Text style={styles.ghostButtonText}>Abmelden</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
