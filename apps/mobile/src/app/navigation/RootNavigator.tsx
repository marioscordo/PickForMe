import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { LoginScreen } from "../../screens/auth/LoginScreen";
import { ConciergeStartScreen } from "../../screens/home/ConciergeStartScreen";
import { PickScreen } from "../../screens/pick/PickScreen";
import { ProfileScreen, type ProfileSection } from "../../screens/profile/ProfileScreen";
import type { AuthState } from "../../types/auth";
import { styles } from "../../theme/styles";
import { BottomTabs } from "./PickTabs";

type RootTab = "home" | "pick" | "profile";

export function RootNavigator({ auth }: { auth: AuthState }) {
  const [activeTab, setActiveTab] = useState<RootTab>("home");
  const [activeProfileSection, setActiveProfileSection] = useState<ProfileSection | null>(null);
  function openPickFromStart() {
    setActiveProfileSection(null);
    setActiveTab("pick");
  }

  function openProfileFromStart() {
    setActiveProfileSection(null);
    setActiveTab("profile");
  }

  function goHome() {
    setActiveProfileSection(null);
    setActiveTab("home");
  }

  if (auth.status === "anonymous") {
    return <LoginScreen />;
  }

  return (
    <View style={styles.appShell}>
      <View style={[styles.flex, activeTab !== "home" && local.hiddenScreen]}>
        <ConciergeStartScreen
          onOpenProfile={openProfileFromStart}
          onStartRecommendation={openPickFromStart}
        />
      </View>

      <View style={[styles.flex, activeTab !== "pick" && local.hiddenScreen]}>
        <PickScreen
          onGoHome={goHome}
          onOpenProfile={openProfileFromStart}
        />
      </View>

      <View style={[styles.flex, activeTab !== "profile" && local.hiddenScreen]}>
        <ProfileScreen activeSection={activeProfileSection} setActiveSection={setActiveProfileSection} />
      </View>

      {activeTab === "home" ? null : (
        <BottomTabs onGoHome={goHome} />
      )}
    </View>
  );
}

const local = StyleSheet.create({
  hiddenScreen: {
    display: "none"
  }
});
