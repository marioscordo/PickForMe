# PickForMe V1 Clean Mobile Baseline
# Run this script from: D:\Mario\PickForMe\pickforme-product-v1

$ErrorActionPreference = "Stop"

$root = Get-Location
if (!(Test-Path "apps/mobile/package.json") -or !(Test-Path "apps/api/package.json")) {
  throw "Bitte im Projekt-Root ausfuehren: D:\Mario\PickForMe\pickforme-product-v1"
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $root "_baseline_backup_$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$filesToBackup = @(
  "apps/mobile/App.tsx",
  "apps/mobile/src/api.ts",
  "apps/mobile/src/styles.ts",
  "apps/api/lib/auth.ts",
  "apps/mobile/package.json",
  "apps/mobile/index.js"
)

foreach ($file in $filesToBackup) {
  if (Test-Path $file) {
    $dest = Join-Path $backupDir $file
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item $file $dest -Force
  }
}

$dirs = @(
  "apps/mobile/src/app/navigation",
  "apps/mobile/src/app/providers",
  "apps/mobile/src/screens/auth",
  "apps/mobile/src/screens/pick",
  "apps/mobile/src/screens/profile",
  "apps/mobile/src/components/ui",
  "apps/mobile/src/components/pick",
  "apps/mobile/src/components/profile",
  "apps/mobile/src/hooks",
  "apps/mobile/src/api",
  "apps/mobile/src/services",
  "apps/mobile/src/config",
  "apps/mobile/src/types",
  "apps/mobile/src/theme"
)

foreach ($dir in $dirs) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

# Ensure Expo entrypoint is stable
$pkgPath = "apps/mobile/package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$pkg.main = "index.js"
$pkg | ConvertTo-Json -Depth 20 | Set-Content $pkgPath -Encoding UTF8

@'
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
'@ | Set-Content "apps/mobile/index.js" -Encoding UTF8

@'
import React from "react";
import { StatusBar } from "expo-status-bar";
import { AppRoot } from "./src/app/AppRoot";

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <AppRoot />
    </>
  );
}
'@ | Set-Content "apps/mobile/App.tsx" -Encoding UTF8

@'
import React from "react";
import { AuthProvider } from "./providers/AuthProvider";
import { ProfileProvider } from "./providers/ProfileProvider";
import { RootNavigator } from "./navigation/RootNavigator";

export function AppRoot() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </AuthProvider>
  );
}
'@ | Set-Content "apps/mobile/src/app/AppRoot.tsx" -Encoding UTF8

@'
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { DEV_EMAIL, env } from "../../config/env";
import type { AuthState } from "../../types/auth";

type AuthContextValue = {
  auth: AuthState;
  loginDev: (email: string) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!mounted) return;

      if (user) {
        setAuth({ status: "authenticated", userId: user.id, email: user.email || undefined });
        return;
      }

      setAuth({ status: "anonymous" });
    }

    void loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        setAuth({ status: "authenticated", userId: user.id, email: user.email || undefined });
      } else {
        setAuth({ status: "anonymous" });
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function loginDev(email: string) {
    const normalized = email.trim().toLowerCase();

    if (!env.devMode || normalized !== DEV_EMAIL) {
      throw new Error("Diese lokale V1 ist aktuell nur fuer Mario freigeschaltet.");
    }

    setAuth({ status: "dev", email: DEV_EMAIL });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuth({ status: "anonymous" });
  }

  const value = useMemo(() => ({ auth, loginDev, signOut }), [auth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
'@ | Set-Content "apps/mobile/src/app/providers/AuthProvider.tsx" -Encoding UTF8

@'
import React, { createContext, useContext, useMemo, useState } from "react";
import type { UserProfile } from "../../types/profile";

const defaultProfile: UserProfile = {
  displayName: "Mario",
  primaryLikes: ["Fleisch", "Regional"],
  secondaryLikes: ["Pasta", "Salat"],
  dislikes: ["Innereien", "Graetenfisch"],
  intolerances: [],
  dietStyle: "normal"
};

type ProfileContextValue = {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const value = useMemo(() => ({ profile, setProfile }), [profile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
'@ | Set-Content "apps/mobile/src/app/providers/ProfileProvider.tsx" -Encoding UTF8

@'
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { LoginScreen } from "../../screens/auth/LoginScreen";
import { PickScreen } from "../../screens/pick/PickScreen";
import { ProfileScreen } from "../../screens/profile/ProfileScreen";
import { BottomTabs } from "./BottomTabs";
import { useAuth } from "../providers/AuthProvider";
import { colors } from "../../theme/colors";

export function RootNavigator() {
  const { auth } = useAuth();
  const [activeTab, setActiveTab] = useState<"pick" | "profile">("pick");

  if (auth.status === "loading") {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>PickForMe startet...</Text>
      </View>
    );
  }

  if (auth.status === "anonymous") {
    return <LoginScreen />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>{activeTab === "pick" ? <PickScreen /> : <ProfileScreen />}</View>
      <BottomTabs activeTab={activeTab} setActiveTab={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    flex: 1
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg
  },
  loadingText: {
    marginTop: 12,
    color: colors.muted,
    fontWeight: "700"
  }
});
'@ | Set-Content "apps/mobile/src/app/navigation/RootNavigator.tsx" -Encoding UTF8

@'
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";

type Tab = "pick" | "profile";

export function BottomTabs({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (tab: Tab) => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TabButton label="PickForMe" active={activeTab === "pick"} onPress={() => setActiveTab("pick")} />
        <TabButton label="Profil" active={activeTab === "profile"} onPress={() => setActiveTab("profile")} />
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.button, active && styles.buttonActive]} onPress={onPress}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18
  },
  bar: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    padding: 5
  },
  button: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: "center"
  },
  buttonActive: {
    backgroundColor: colors.primary
  },
  text: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text
  },
  textActive: {
    color: "#FFFFFF"
  }
});
'@ | Set-Content "apps/mobile/src/app/navigation/BottomTabs.tsx" -Encoding UTF8

@'
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { DEV_EMAIL } from "../../config/env";
import { colors } from "../../theme/colors";

export function LoginScreen() {
  const { loginDev } = useAuth();
  const [email, setEmail] = useState(DEV_EMAIL);
  const [error, setError] = useState("");

  function handleLogin() {
    try {
      setError("");
      loginDev(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login fehlgeschlagen.");
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\uD83C\uDF7D\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <Card>
        <Text style={styles.h2}>Einloggen</Text>
        <Text style={styles.hint}>Lokaler Entwicklungszugang fuer Mario. Store-Login folgt sauber ueber Supabase.</Text>

        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={DEV_EMAIL}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Weiter" onPress={handleLogin} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 38, fontWeight: "900", letterSpacing: -1.2, color: colors.text, marginBottom: 6 },
  subtitle: { fontSize: 18, color: colors.muted, lineHeight: 25, marginBottom: 18 },
  h2: { fontSize: 25, fontWeight: "900", color: colors.text, marginBottom: 12 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: 7 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
    color: colors.text
  },
  error: { color: colors.danger, fontWeight: "800", marginBottom: 12 }
});
'@ | Set-Content "apps/mobile/src/screens/auth/LoginScreen.tsx" -Encoding UTF8

@'
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { colors } from "../../theme/colors";

export function PickScreen() {
  const { menuText, setMenuText, situation, setSituation, result, loading, error, run } = useAnalyzeMenu();

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\uD83C\uDF7D\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Fuer Mario</Text>
        <Text style={styles.heroText}>Speisekarte einfuegen, Situation waehlen und wenige passende Gerichte bekommen.</Text>
      </View>

      <Card>
        <MenuInputCard menuText={menuText} setMenuText={setMenuText} />
        <SituationSelector situation={situation} setSituation={setSituation} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={loading ? "PickForMe prueft..." : "3 passende Gerichte finden"} onPress={run} disabled={loading} />
      </Card>

      {result ? <RecommendationCard result={result} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 38, fontWeight: "900", letterSpacing: -1.2, color: colors.text, marginBottom: 6 },
  subtitle: { fontSize: 18, color: colors.muted, lineHeight: 25, marginBottom: 18 },
  heroCard: { backgroundColor: colors.primary, borderRadius: 28, padding: 20, marginBottom: 16 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "900", marginBottom: 6 },
  heroText: { color: "#CBD5E1", fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontWeight: "800", marginTop: 4, marginBottom: 12 }
});
'@ | Set-Content "apps/mobile/src/screens/pick/PickScreen.tsx" -Encoding UTF8

@'
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { ProfileEditor } from "../../components/profile/ProfileEditor";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../theme/colors";

export function ProfileScreen() {
  const { profile, setProfile } = useProfile();
  const { signOut } = useAuth();

  return (
    <Screen>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.subtitle}>Deine Vorlieben steuern, was PickForMe empfiehlt.</Text>

      <Card>
        <Text style={styles.h2}>Mein Profil</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={profile.displayName}
          onChangeText={(displayName) => setProfile({ ...profile, displayName })}
        />

        <ProfileEditor profile={profile} setProfile={setProfile} />
      </Card>

      <Button label="Abmelden" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 38, fontWeight: "900", letterSpacing: -1.2, color: colors.text, marginBottom: 6 },
  subtitle: { fontSize: 18, color: colors.muted, lineHeight: 25, marginBottom: 18 },
  h2: { fontSize: 25, fontWeight: "900", color: colors.text, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: 7 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
    color: colors.text
  }
});
'@ | Set-Content "apps/mobile/src/screens/profile/ProfileScreen.tsx" -Encoding UTF8

@'
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../theme/colors";

export function Button({
  label,
  onPress,
  disabled = false,
  variant = "primary"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      style={[styles.button, variant === "secondary" && styles.secondary, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.text, variant === "secondary" && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 8
  },
  secondary: {
    backgroundColor: colors.primarySoft
  },
  disabled: {
    opacity: 0.55
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 17
  },
  secondaryText: {
    color: colors.text
  }
});
'@ | Set-Content "apps/mobile/src/components/ui/Button.tsx" -Encoding UTF8

@'
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  }
});
'@ | Set-Content "apps/mobile/src/components/ui/Card.tsx" -Encoding UTF8

@'
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../theme/colors";

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.active]} onPress={onPress}>
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF"
  },
  active: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  text: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },
  textActive: {
    color: "#FFFFFF"
  }
});
'@ | Set-Content "apps/mobile/src/components/ui/Chip.tsx" -Encoding UTF8

@'
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 18
  }
});
'@ | Set-Content "apps/mobile/src/components/ui/Screen.tsx" -Encoding UTF8

@'
import React from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { colors } from "../../theme/colors";

export function MenuInputCard({ menuText, setMenuText }: { menuText: string; setMenuText: (value: string) => void }) {
  return (
    <>
      <Text style={styles.h2}>Speisekarte</Text>
      <Text style={styles.hint}>Kopiere hier den Text der Karte hinein. Foto- und PDF-Erkennung bauen wir danach sauber ein.</Text>

      <TextInput
        multiline
        scrollEnabled
        style={styles.textArea}
        value={menuText}
        onChangeText={setMenuText}
        placeholder={"Beispiel:\nSchaeufele mit Kloss und Wirsing 18,90 EUR\nTagliatelle mit Pilzen 16,50 EUR\nGrosser Salat mit Haehnchen 14,90 EUR"}
        placeholderTextColor="#94A3B8"
      />
    </>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 25, fontWeight: "900", color: colors.text, marginBottom: 12 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: -4, marginBottom: 10 },
  textArea: {
    minHeight: 230,
    maxHeight: 330,
    textAlignVertical: "top",
    lineHeight: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
    color: colors.text
  }
});
'@ | Set-Content "apps/mobile/src/components/pick/MenuInputCard.tsx" -Encoding UTF8

@'
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SITUATIONS } from "../../config/constants";
import type { Situation } from "../../types/menu";
import { Chip } from "../ui/Chip";
import { colors } from "../../theme/colors";

export function SituationSelector({ situation, setSituation }: { situation: Situation; setSituation: (value: Situation) => void }) {
  return (
    <>
      <Text style={styles.h3}>Situation</Text>
      <View style={styles.row}>
        {SITUATIONS.map((item) => (
          <Chip key={item} label={item} active={situation === item} onPress={() => setSituation(item)} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  h3: { fontSize: 17, fontWeight: "900", color: colors.text, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }
});
'@ | Set-Content "apps/mobile/src/components/pick/SituationSelector.tsx" -Encoding UTF8

@'
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { AnalyzeData, Dish } from "../../types/recommendations";
import { colors } from "../../theme/colors";
import { Card } from "../ui/Card";

export function RecommendationCard({ result }: { result: AnalyzeData }) {
  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);

  const safeRecommendations = result.recommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: { dishId: string; reason: string }; dish: Dish } => Boolean(item.dish));

  return (
    <Card>
      <Text style={styles.h2}>PickForMe {"\uD83C\uDF7D\uFE0F"}</Text>
      <Text style={styles.meta}>{result.dishes.length} Speisen erkannt · Modus: {result.mode}</Text>

      {safeRecommendations.map(({ rec, dish }, index) => (
        <View key={dish.id} style={styles.item}>
          <Text style={styles.name}>{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "•"} {dish.nameOriginal}</Text>
          <Text style={styles.meta}>{dish.price ? `${dish.price.toFixed(2)} €` : "Preis nicht erkannt"}{dish.category ? ` · ${dish.category}` : ""}</Text>
          {dish.descriptionOriginal ? <Text style={styles.meta}>{dish.descriptionOriginal}</Text> : null}
          <Text style={styles.reason}>Warum? {rec.reason}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 25, fontWeight: "900", color: colors.text, marginBottom: 6 },
  item: { marginTop: 18, paddingTop: 14, borderTopColor: colors.border, borderTopWidth: 1 },
  name: { fontSize: 21, fontWeight: "900", color: colors.text, lineHeight: 27 },
  meta: { fontSize: 15, color: colors.muted, marginTop: 4, lineHeight: 21 },
  reason: { fontSize: 16, color: colors.text, lineHeight: 23, marginTop: 12 }
});
'@ | Set-Content "apps/mobile/src/components/pick/RecommendationCard.tsx" -Encoding UTF8

@'
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DISLIKES, INTOLERANCES, PRIMARY_LIKES } from "../../config/constants";
import type { UserProfile } from "../../types/profile";
import { colors } from "../../theme/colors";
import { Chip } from "../ui/Chip";

export function ProfileEditor({ profile, setProfile }: { profile: UserProfile; setProfile: (profile: UserProfile) => void }) {
  return (
    <>
      <ChipGroup
        title="Hauptvorlieben"
        options={PRIMARY_LIKES}
        selected={profile.primaryLikes}
        onChange={(primaryLikes) => setProfile({ ...profile, primaryLikes })}
      />
      <ChipGroup
        title="Abneigungen"
        options={DISLIKES}
        selected={profile.dislikes}
        onChange={(dislikes) => setProfile({ ...profile, dislikes })}
      />
      <ChipGroup
        title="Unvertraeglichkeiten"
        options={INTOLERANCES}
        selected={profile.intolerances}
        onChange={(intolerances) => setProfile({ ...profile, intolerances })}
      />
    </>
  );
}

function ChipGroup({ title, options, selected, onChange }: { title: string; options: string[]; selected: string[]; onChange: (items: string[]) => void }) {
  return (
    <>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.row}>
        {options.map((item) => {
          const active = selected.includes(item);
          return <Chip key={item} label={item} active={active} onPress={() => onChange(active ? selected.filter((x) => x !== item) : [...selected, item])} />;
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: 7, marginTop: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }
});
'@ | Set-Content "apps/mobile/src/components/profile/ProfileEditor.tsx" -Encoding UTF8

@'
import { useState } from "react";
import { useAuth } from "../app/providers/AuthProvider";
import { useProfile } from "../app/providers/ProfileProvider";
import { analyzeMenu } from "../api/pickformeApi";
import type { Situation } from "../types/menu";
import type { AnalyzeData } from "../types/recommendations";

export function useAnalyzeMenu() {
  const { auth } = useAuth();
  const { profile } = useProfile();
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("regional");
  const [result, setResult] = useState<AnalyzeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setError("");
    setResult(null);

    if (menuText.trim().length < 20) {
      setError("Bitte zuerst eine Speisekarte einfuegen.");
      return;
    }

    setLoading(true);

    try {
      const data = await analyzeMenu({ menuText, situation, profile, auth });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return { menuText, setMenuText, situation, setSituation, result, loading, error, run };
}
'@ | Set-Content "apps/mobile/src/hooks/useAnalyzeMenu.ts" -Encoding UTF8

@'
import { apiPost } from "./apiClient";
import type { AuthState } from "../types/auth";
import type { Situation } from "../types/menu";
import type { UserProfile } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

export function analyzeMenu(args: {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
  auth: AuthState;
}) {
  return apiPost<AnalyzeData, {
    sourceKind: "text";
    menuText: string;
    situation: Situation;
    profile: UserProfile;
  }>("/api/analyze-menu", {
    sourceKind: "text",
    menuText: args.menuText,
    situation: args.situation,
    profile: args.profile
  }, args.auth);
}
'@ | Set-Content "apps/mobile/src/api/pickformeApi.ts" -Encoding UTF8

@'
import { buildAuthHeaders } from "../services/authService";
import { env } from "../config/env";
import type { AuthState } from "../types/auth";

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: string; details?: unknown } };

export async function apiPost<TResponse, TBody>(path: string, body: TBody, auth: AuthState): Promise<TResponse> {
  const authHeaders = await buildAuthHeaders(auth);

  const response = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as ApiResponse<TResponse>;

  if (!payload.ok) {
    throw new Error(payload.error.message);
  }

  return payload.data;
}
'@ | Set-Content "apps/mobile/src/api/apiClient.ts" -Encoding UTF8

@'
import { supabase } from "../supabase";
import { DEV_EMAIL, env } from "../config/env";
import type { AuthState } from "../types/auth";

export async function buildAuthHeaders(auth: AuthState): Promise<Record<string, string>> {
  if (auth.status === "dev") {
    return { "x-pickforme-dev-email": auth.email };
  }

  if (env.devMode && auth.status === "anonymous") {
    return { "x-pickforme-dev-email": DEV_EMAIL };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Du bist nicht eingeloggt.");
  }

  return { Authorization: `Bearer ${token}` };
}
'@ | Set-Content "apps/mobile/src/services/authService.ts" -Encoding UTF8

@'
export const DEV_EMAIL = "mario.scordo@t-online.de";

export const env = {
  apiUrl: process.env.EXPO_PUBLIC_PICKFORME_API_URL || "http://localhost:3000",
  devMode: process.env.EXPO_PUBLIC_PICKFORME_DEV_MODE !== "false"
};
'@ | Set-Content "apps/mobile/src/config/env.ts" -Encoding UTF8

@'
import type { Situation } from "../types/menu";

export const SITUATIONS: Situation[] = ["leicht", "regional", "teilen", "ueberraschen"];

export const PRIMARY_LIKES = ["Fleisch", "Pasta", "Salat", "Fisch", "Meeresfruechte", "Regional"];
export const DISLIKES = ["Innereien", "Graetenfisch", "Koriander"];
export const INTOLERANCES = ["Laktose", "Gluten", "Nuesse"];
'@ | Set-Content "apps/mobile/src/config/constants.ts" -Encoding UTF8

@'
export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "dev"; email: string }
  | { status: "authenticated"; userId: string; email?: string };
'@ | Set-Content "apps/mobile/src/types/auth.ts" -Encoding UTF8

@'
export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  secondaryLikes: string[];
  dislikes: string[];
  intolerances: string[];
  dietStyle: "normal" | "vegetarian" | "vegan";
};
'@ | Set-Content "apps/mobile/src/types/profile.ts" -Encoding UTF8

@'
export type Situation = "leicht" | "regional" | "teilen" | "ueberraschen";
'@ | Set-Content "apps/mobile/src/types/menu.ts" -Encoding UTF8

@'
export type Dish = {
  id: string;
  nameOriginal: string;
  descriptionOriginal?: string;
  price?: number;
  currency?: string;
  category?: string;
  allergens: string[];
  tags: string[];
};

export type Recommendation = {
  dishId: string;
  reason: string;
};

export type AnalyzeData = {
  analysisId: string | null;
  detectedLanguage: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  mode: "openai" | "fallback";
  debug: string[];
};
'@ | Set-Content "apps/mobile/src/types/recommendations.ts" -Encoding UTF8

@'
export const colors = {
  bg: "#F4F7FA",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#D7DEE8",
  primary: "#111827",
  primarySoft: "#E8EDF4",
  danger: "#B91C1C"
};
'@ | Set-Content "apps/mobile/src/theme/colors.ts" -Encoding UTF8

# Keep legacy api.ts and styles.ts as compatibility facades, in case old imports remain somewhere.
@'
export { analyzeMenu } from "./api/pickformeApi";
'@ | Set-Content "apps/mobile/src/api.ts" -Encoding UTF8

@'
import { StyleSheet } from "react-native";
import { colors } from "./theme/colors";

export { colors };

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flexGrow: 1, backgroundColor: colors.bg, paddingHorizontal: 18, paddingTop: 54, paddingBottom: 44 }
});
'@ | Set-Content "apps/mobile/src/styles.ts" -Encoding UTF8

# Backend dev auth baseline
@'
import { supabaseAnon } from "./supabase";

const DEV_EMAIL = "mario.scordo@t-online.de";

export async function requireUser(request: Request): Promise<{ id: string; email?: string }> {
  const devEmail = request.headers.get("x-pickforme-dev-email");

  if (devEmail === DEV_EMAIL && process.env.NODE_ENV !== "production") {
    return {
      id: "00000000-0000-0000-0000-000000000001",
      email: DEV_EMAIL
    };
  }

  if (devEmail && process.env.NODE_ENV === "production") {
    throw new Error("Dev login disabled.");
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Error("Nicht eingeloggt.");
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Session ungueltig oder abgelaufen.");
  }

  return {
    id: data.user.id,
    email: data.user.email || undefined
  };
}
'@ | Set-Content "apps/api/lib/auth.ts" -Encoding UTF8

Write-Host "PickForMe Mobile V1 Clean Baseline wurde geschrieben." -ForegroundColor Green
Write-Host "Backup: $backupDir" -ForegroundColor Yellow
Write-Host "Naechster Schritt: npm --workspace apps/mobile run typecheck" -ForegroundColor Cyan
