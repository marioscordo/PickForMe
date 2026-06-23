import React from "react";
import { Text, TextInput, View } from "react-native";
import { Chip } from "../ui/Chip";
import { styles } from "../../theme/styles";
import type { UserProfile } from "../../types/profile";

const OPTIONS = {
  primaryLikes: ["Fleisch", "Pasta", "Salat", "Fisch", "Meeresfrüchte", "Regional"],
  dislikes: ["Innereien", "Grätenfisch", "Koriander"],
  intolerances: ["Laktose", "Gluten", "Nüsse"]
};

export function ProfileEditor({
  profile,
  setProfile
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Mein Profil</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={profile.displayName}
        onChangeText={(displayName) => setProfile({ ...profile, displayName })}
      />

      <Text style={styles.label}>Hauptvorlieben</Text>
      <ChipList
        options={OPTIONS.primaryLikes}
        values={profile.primaryLikes}
        onChange={(primaryLikes) => setProfile({ ...profile, primaryLikes })}
      />

      <Text style={styles.label}>Abneigungen</Text>
      <ChipList
        options={OPTIONS.dislikes}
        values={profile.dislikes}
        onChange={(dislikes) => setProfile({ ...profile, dislikes })}
      />

      <Text style={styles.label}>Unverträglichkeiten</Text>
      <ChipList
        options={OPTIONS.intolerances}
        values={profile.intolerances}
        onChange={(intolerances) => setProfile({ ...profile, intolerances })}
      />
    </View>
  );
}

function ChipList({
  options,
  values,
  onChange
}: {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = values.includes(option);

        return (
          <Chip
            key={option}
            label={option}
            active={active}
            onPress={() => onChange(active ? values.filter((value) => value !== option) : [...values, option])}
          />
        );
      })}
    </View>
  );
}
