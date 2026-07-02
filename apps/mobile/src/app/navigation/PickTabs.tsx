import React from "react";
import { Pressable, Text, View } from "react-native";
import { useMobileContent } from "../../content/useMobileContent";
import { styles } from "../../theme/styles";

export function BottomTabs({
  activeTab,
  setActiveTab
}: {
  activeTab: "pick" | "profile";
  setActiveTab: (tab: "pick" | "profile") => void;
}) {
  const content = useMobileContent();

  return (
    <View style={styles.tabBar}>
      <Pressable
        style={[styles.tabButton, activeTab === "pick" && styles.tabButtonActive]}
        onPress={() => setActiveTab("pick")}
      >
        <Text style={[styles.tabButtonText, activeTab === "pick" && styles.tabButtonTextActive]}>
          {content.navigation.menu}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.tabButton, activeTab === "profile" && styles.tabButtonActive]}
        onPress={() => setActiveTab("profile")}
      >
        <Text style={[styles.tabButtonText, activeTab === "profile" && styles.tabButtonTextActive]}>
          {content.navigation.profile}
        </Text>
      </Pressable>
    </View>
  );
}
