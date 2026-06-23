import React from "react";
import { AuthProvider, useAuth } from "./providers/AuthProvider";
import { ProfileProvider } from "./providers/ProfileProvider";
import { RootNavigator } from "./navigation/RootNavigator";

export function AppRoot() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <Root />
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
