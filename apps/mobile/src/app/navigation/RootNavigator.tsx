import React, { useState } from "react";
import { View } from "react-native";
import { LoginScreen } from "../../screens/auth/LoginScreen";
import { PickScreen } from "../../screens/pick/PickScreen";
import { ProfileScreen } from "../../screens/profile/ProfileScreen";
import type { AuthState } from "../../types/auth";
import { styles } from "../../theme/styles";
import { BottomTabs } from "./PickTabs";

export function RootNavigator({ auth }: { auth: AuthState }) {
  const [activeTab, setActiveTab] = useState<"pick" | "profile">("pick");

  if (auth.status === "anonymous") {
    return <LoginScreen />;
  }

  return (
    <View style={styles.appShell}>
      {activeTab === "pick" ? <PickScreen /> : <ProfileScreen />}
      <BottomTabs activeTab={activeTab} setActiveTab={setActiveTab} />
    </View>
  );
}
