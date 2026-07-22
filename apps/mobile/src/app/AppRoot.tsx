import React from "react";
import { AuthProvider, useAuth } from "./providers/AuthProvider";
import { ProfileProvider } from "./providers/ProfileProvider";
import { WinePreferenceProvider } from "./providers/WinePreferenceProvider";
import { RootNavigator } from "./navigation/RootNavigator";

export function AppRoot() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <WinePreferenceProvider>
          <Root />
        </WinePreferenceProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

function Root() {
  const auth = useAuth();

  if (auth.state.status === "loading") {
    return null;
  }

  return <RootNavigator auth={auth.state} />;
}
