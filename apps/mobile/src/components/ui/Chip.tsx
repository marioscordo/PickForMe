import React from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "../../theme/styles";

export function Chip({
  label,
  icon,
  active,
  onPress
}: {
  label: string;
  icon?: string;
  active: boolean;
  onPress: () => void;
}) {
  const hasIcon = Boolean(icon);

  return (
    <Pressable
      style={[
        styles.chip,
        hasIcon && styles.profileChip,
        active && styles.chipActive,
        hasIcon && active && styles.profileChipActive
      ]}
      onPress={onPress}
    >
      {icon ? (
        <View style={[styles.chipIcon, active && styles.chipIconActive]}>
          <Text style={styles.chipIconText}>{icon}</Text>
        </View>
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive, hasIcon && active && styles.profileChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
