import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ConfirmEmailScreen } from "../../screens/auth/ConfirmEmailScreen";
import { LoginScreen } from "../../screens/auth/LoginScreen";
import { RegisterScreen } from "../../screens/auth/RegisterScreen";
import { ConciergeStartScreen } from "../../screens/home/ConciergeStartScreen";
import { PickScreen } from "../../screens/pick/PickScreen";
import { ProfileScreen, type ProfileSection } from "../../screens/profile/ProfileScreen";
import type { AuthState } from "../../types/auth";
import { styles } from "../../theme/styles";
import { BottomTabs } from "./PickTabs";

type RootTab = "home" | "pick" | "profile";
type AuthScreen = "login" | "register" | "confirm-email";

export function RootNavigator({ auth }: { auth: AuthState }) {
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [activeTab, setActiveTab] = useState<RootTab>("home");
  const [activeProfileSection, setActiveProfileSection] = useState<ProfileSection | null>(null);
  const [profileReturnToPick, setProfileReturnToPick] = useState(false);
  const [pickReturnToMoodKey, setPickReturnToMoodKey] = useState(0);

  useEffect(() => {
    if (auth.status !== "anonymous") {
      setAuthScreen("login");
      setConfirmationEmail("");
    }
  }, [auth.status]);

  function openPickFromStart() {
    setActiveProfileSection(null);
    setProfileReturnToPick(false);
    setActiveTab("pick");
  }

  function openProfileFromStart() {
    setActiveProfileSection(null);
    setProfileReturnToPick(false);
    setActiveTab("profile");
  }

  function openPreferencesFromPick() {
    setActiveProfileSection("preferences");
    setProfileReturnToPick(true);
    setActiveTab("profile");
  }

  function returnToPickFromProfile() {
    setActiveProfileSection(null);
    setProfileReturnToPick(false);
    setActiveTab("pick");
    setPickReturnToMoodKey((current) => current + 1);
  }

  function goHome() {
    setActiveProfileSection(null);
    setProfileReturnToPick(false);
    setActiveTab("home");
  }

  if (auth.status === "anonymous") {
    if (authScreen === "register") {
      return (
        <RegisterScreen
          onBackToLogin={() => setAuthScreen("login")}
          onConfirmEmail={(email) => {
            setConfirmationEmail(email);
            setAuthScreen("confirm-email");
          }}
        />
      );
    }

    if (authScreen === "confirm-email") {
      return (
        <ConfirmEmailScreen
          email={confirmationEmail}
          onBackToLogin={() => setAuthScreen("login")}
        />
      );
    }

    return <LoginScreen onCreateAccount={() => setAuthScreen("register")} />;
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
          onOpenProfilePreferences={openPreferencesFromPick}
          returnToMoodKey={pickReturnToMoodKey}
        />
      </View>

      <View style={[styles.flex, activeTab !== "profile" && local.hiddenScreen]}>
        <ProfileScreen
          activeSection={activeProfileSection}
          onReturnToPick={returnToPickFromProfile}
          returnToPickOnBack={profileReturnToPick}
          setActiveSection={setActiveProfileSection}
        />
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
