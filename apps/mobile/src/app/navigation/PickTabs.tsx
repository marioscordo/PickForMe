import React from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "../../theme/styles";

export function BottomTabs({
  activeTab,
  setActiveTab
}: {
  activeTab: "pick" | "profile";
  setActiveTab: (tab: "pick" | "profile") => void;
}) {
  return (
    <View style={styles.tabBar}>
      <Pressable
        style={[styles.tabButton, activeTab === "pick" && styles.tabButtonActive]}
        onPress={() => setActiveTab("pick")}
      >
        <Text style={[styles.tabButtonText, activeTab === "pick" && styles.tabButtonTextActive]}>
          Speisekarte
        </Text>
      </Pressable>

      <Pressable
        style={[styles.tabButton, activeTab === "profile" && styles.tabButtonActive]}
        onPress={() => setActiveTab("profile")}
      >
        <Text style={[styles.tabButtonText, activeTab === "profile" && styles.tabButtonTextActive]}>
          Profil
        </Text>
      </Pressable>
    </View>
  );
}
