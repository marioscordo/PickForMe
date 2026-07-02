import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LoginScreen } from "../../screens/auth/LoginScreen";
import { PickScreen } from "../../screens/pick/PickScreen";
import { ProfileScreen, type ProfileSection } from "../../screens/profile/ProfileScreen";
import type { AuthState } from "../../types/auth";
import { styles } from "../../theme/styles";
import { BottomTabs } from "./PickTabs";

export function RootNavigator({ auth }: { auth: AuthState }) {
  const [activeTab, setActiveTab] = useState<"pick" | "profile">("pick");
  const [activeProfileSection, setActiveProfileSection] = useState<ProfileSection | null>(null);
  const [pickResetSignal, setPickResetSignal] = useState(0);
  const [pickResultVisible, setPickResultVisible] = useState(false);

  const visibleActiveTab =
    activeTab === "profile" && activeProfileSection
      ? null
      : activeTab === "pick" && pickResultVisible
        ? null
        : activeTab;

  const handlePickResultVisibleChange = useCallback((visible: boolean) => {
    setPickResultVisible(visible);
  }, []);

  function handleTabPress(tab: "pick" | "profile") {
    if (tab === "pick") {
      setActiveProfileSection(null);
      if (activeTab === "pick" && pickResultVisible) {
        setPickResetSignal((current) => current + 1);
      }
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
      <View style={[styles.flex, activeTab !== "pick" && local.hiddenScreen]}>
        <PickScreen
          resetSignal={pickResetSignal}
          onResultVisibleChange={handlePickResultVisibleChange}
        />
      </View>

      <View style={[styles.flex, activeTab !== "profile" && local.hiddenScreen]}>
        <ProfileScreen activeSection={activeProfileSection} setActiveSection={setActiveProfileSection} />
      </View>

      <BottomTabs activeTab={visibleActiveTab} setActiveTab={handleTabPress} />
    </View>
  );
}

const local = StyleSheet.create({
  hiddenScreen: {
    display: "none"
  }
});
