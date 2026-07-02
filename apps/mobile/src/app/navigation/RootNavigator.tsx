import React, { useState } from "react";
import { View } from "react-native";
import { LoginScreen } from "../../screens/auth/LoginScreen";
import { PickScreen } from "../../screens/pick/PickScreen";
import { ProfileScreen, type ProfileSection } from "../../screens/profile/ProfileScreen";
import type { AuthState } from "../../types/auth";
import { styles } from "../../theme/styles";
import { BottomTabs } from "./PickTabs";

export function RootNavigator({ auth }: { auth: AuthState }) {
  const [activeTab, setActiveTab] = useState<"pick" | "profile">("pick");
  const [activeProfileSection, setActiveProfileSection] = useState<ProfileSection | null>(null);

  const visibleActiveTab = activeTab === "profile" && activeProfileSection ? null : activeTab;

  function handleTabPress(tab: "pick" | "profile") {
    if (tab === "pick") {
      setActiveProfileSection(null);
      setActiveTab("pick");
      return;
    }

    setActiveProfileSection(null);
    setActiveTab("profile");
  }

  if (auth.status === "anonymous") {
    return <LoginScreen />;
  }

  return (
    <View style={styles.appShell}>
      {activeTab === "pick" ? (
        <PickScreen />
      ) : (
        <ProfileScreen activeSection={activeProfileSection} setActiveSection={setActiveProfileSection} />
      )}

      <BottomTabs activeTab={visibleActiveTab} setActiveTab={handleTabPress} />
    </View>
  );
}
