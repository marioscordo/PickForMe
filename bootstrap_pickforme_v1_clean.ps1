# PickForMe V1 Clean Architecture Bootstrap
# Zweck: Erstellt eine neue, leere PickForMe V1 Monorepo-Basis aus einem leeren Projektordner.
# Ausfuehrung:
#   cd D:\Mario\PickForMe\pickforme-product-v1
#   powershell -ExecutionPolicy Bypass -File .\bootstrap_pickforme_v1_clean.ps1

$ErrorActionPreference = "Stop"

$Root = (Get-Location).Path

function Info($Text) {
  Write-Host "[PickForMe] $Text" -ForegroundColor Cyan
}

function Ok($Text) {
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Warn($Text) {
  Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function wf([string]$RelativePath, [string]$Content) {
  $FullPath = Join-Path $Root $RelativePath
  $Directory = Split-Path $FullPath -Parent
  if (-not (Test-Path $Directory)) {
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  }
  Set-Content -LiteralPath $FullPath -Value $Content -Encoding UTF8
}

Info "Projektordner: $Root"

if (Test-Path (Join-Path $Root "package.json")) {
  $Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $Backup = Join-Path $Root "_backup_before_bootstrap_$Stamp"
  Warn "Bestehende Projektdateien gefunden. Backup wird erstellt: $Backup"
  New-Item -ItemType Directory -Path $Backup -Force | Out-Null
  foreach ($Item in @("package.json", "package-lock.json", "apps", "supabase", "README.md", "tsconfig.base.json")) {
    $Source = Join-Path $Root $Item
    if (Test-Path $Source) {
      Copy-Item $Source $Backup -Recurse -Force
    }
  }
}

Info "Schreibe Root-Konfiguration..."

wf "package.json" @'
{
  "name": "pickforme-product-v1",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/mobile",
    "apps/api"
  ],
  "scripts": {
    "dev:mobile": "npm --workspace apps/mobile run start",
    "dev:api": "npm --workspace apps/api run dev",
    "typecheck": "npm --workspaces --if-present run typecheck"
  },
  "overrides": {
    "expo": "~54.0.35",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "expo-status-bar": "~3.0.9",
    "@react-native-async-storage/async-storage": "2.2.0"
  }
}
'@

wf "tsconfig.base.json" @'
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
'@

wf ".gitignore" @'
node_modules
.expo
.next
dist
build
.env
.env.local
*.log
.DS_Store
'@

wf "README.md" @'
# PickForMe V1

Mobile-first App für Restaurantgäste.

Leitsatz:

> Das Restaurant kenne ich nicht. PickForMe kennt mich.

## Architektur

- Mobile: Expo React Native
- API: Next.js Route Handlers
- Auth: Dev-Modus lokal, später Supabase Auth
- KI: ausschließlich serverseitig
- V1-Safety: Empfehlungen dürfen nur validierte dishIds verwenden

## Entwicklung

```powershell
npm install
npm --workspace apps/mobile run typecheck
npm --workspace apps/api run typecheck
npm run dev:api
npm run dev:mobile
```
'@

Info "Schreibe Mobile-App..."

wf "apps/mobile/package.json" @'
{
  "name": "@pickforme/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "@supabase/supabase-js": "2.87.1",
    "expo": "~54.0.35",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-native": "0.81.5"
  },
  "devDependencies": {
    "@types/react": "19.1.17",
    "typescript": "5.9.3"
  }
}
'@

wf "apps/mobile/app.json" @'
{
  "expo": {
    "name": "PickForMe",
    "slug": "pickforme",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "pickforme",
    "userInterfaceStyle": "light",
    "ios": {
      "bundleIdentifier": "de.scordo.pickforme",
      "supportsTablet": true
    },
    "android": {
      "package": "de.scordo.pickforme"
    },
    "extra": {
      "eas": {
        "projectId": "local-dev"
      }
    }
  }
}
'@

wf "apps/mobile/index.js" @'
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
'@

wf "apps/mobile/tsconfig.json" @'
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true
  },
  "include": [
    "**/*.ts",
    "**/*.tsx"
  ]
}
'@

wf "apps/mobile/.env.example" @'
EXPO_PUBLIC_PICKFORME_API_URL=http://192.168.178.158:3000
EXPO_PUBLIC_PICKFORME_DEV_MODE=true
EXPO_PUBLIC_PICKFORME_DEV_EMAIL=mario.scordo@t-online.de
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder
'@

wf "apps/mobile/.env" @'
EXPO_PUBLIC_PICKFORME_API_URL=http://192.168.178.158:3000
EXPO_PUBLIC_PICKFORME_DEV_MODE=true
EXPO_PUBLIC_PICKFORME_DEV_EMAIL=mario.scordo@t-online.de
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder
'@

wf "apps/mobile/App.tsx" @'
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
'@

wf "apps/mobile/src/config/env.ts" @'
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_PICKFORME_API_URL ?? "http://localhost:3000",
  devMode: process.env.EXPO_PUBLIC_PICKFORME_DEV_MODE !== "false",
  devEmail: process.env.EXPO_PUBLIC_PICKFORME_DEV_EMAIL ?? "mario.scordo@t-online.de",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
};
'@

wf "apps/mobile/src/types/profile.ts" @'
export type Situation = "leicht" | "regional" | "teilen" | "überraschen";

export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  secondaryLikes: string[];
  dislikes: string[];
  intolerances: string[];
  dietStyle: "normal" | "vegetarisch" | "vegan" | "flexitarisch";
};
'@

wf "apps/mobile/src/types/menu.ts" @'
export type Dish = {
  id: string;
  nameOriginal: string;
  descriptionOriginal?: string;
  price?: number;
  category?: string;
  sourceLine: string;
};
'@

wf "apps/mobile/src/types/recommendations.ts" @'
import type { Dish } from "./menu";

export type Recommendation = {
  dishId: string;
  reason: string;
};

export type AnalyzeData = {
  mode: "ai" | "fallback";
  dishes: Dish[];
  recommendations: Recommendation[];
};
'@

wf "apps/mobile/src/types/auth.ts" @'
export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "dev"; email: string }
  | { status: "authenticated"; userId: string; email?: string };
'@

wf "apps/mobile/src/theme/styles.ts" @'
import { StyleSheet } from "react-native";

export const colors = {
  bg: "#F4F7FA",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#D7DEE8",
  primary: "#111827",
  primarySoft: "#E8EDF4",
  danger: "#B91C1C",
  success: "#047857"
};

export const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.bg
  },

  flex: {
    flex: 1
  },

  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 18
  },

  title: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: colors.text,
    marginBottom: 6
  },

  subtitle: {
    fontSize: 18,
    color: colors.muted,
    lineHeight: 25,
    marginBottom: 18
  },

  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    padding: 20,
    marginBottom: 16
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 6
  },

  heroText: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },

  h2: {
    fontSize: 25,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.5
  },

  h3: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 8
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 7
  },

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

  textArea: {
    minHeight: 230,
    maxHeight: 330,
    textAlignVertical: "top",
    lineHeight: 22
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 8
  },

  buttonDisabled: {
    opacity: 0.55
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 17
  },

  ghostButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 20
  },

  ghostButtonText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF"
  },

  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },

  chipText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },

  chipTextActive: {
    color: "#FFFFFF"
  },

  error: {
    color: colors.danger,
    fontWeight: "800",
    marginBottom: 12
  },

  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
    marginBottom: 10
  },

  resultItem: {
    marginTop: 18,
    paddingTop: 14,
    borderTopColor: colors.border,
    borderTopWidth: 1
  },

  resultName: {
    fontSize: 21,
    fontWeight: "900",
    color: colors.text,
    lineHeight: 27
  },

  resultMeta: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 21
  },

  reason: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 23,
    marginTop: 12
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 20
  },

  tabButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: "center"
  },

  tabButtonActive: {
    backgroundColor: colors.primary
  },

  tabButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text
  },

  tabButtonTextActive: {
    color: "#FFFFFF"
  }
});
'@

wf "apps/mobile/src/app/AppRoot.tsx" @'
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
'@

wf "apps/mobile/src/app/providers/AuthProvider.tsx" @'
import React, { createContext, useContext, useMemo, useState } from "react";
import { env } from "../../config/env";
import type { AuthState } from "../../types/auth";

type AuthContextValue = {
  state: AuthState;
  loginDev: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "anonymous" });

  async function loginDev(email: string) {
    const normalized = email.trim().toLowerCase();

    if (!env.devMode) {
      throw new Error("Dev-Login ist deaktiviert.");
    }

    if (normalized !== env.devEmail) {
      throw new Error("Diese lokale V1 ist aktuell nur für Mario freigeschaltet.");
    }

    setState({ status: "dev", email: normalized });
  }

  async function signOut() {
    setState({ status: "anonymous" });
  }

  const value = useMemo(
    () => ({
      state,
      loginDev,
      signOut
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth muss innerhalb von AuthProvider genutzt werden.");
  }

  return value;
}
'@

wf "apps/mobile/src/app/providers/ProfileProvider.tsx" @'
import React, { createContext, useContext, useMemo, useState } from "react";
import type { UserProfile } from "../../types/profile";

const defaultProfile: UserProfile = {
  displayName: "Mario",
  primaryLikes: ["Fleisch", "Regional"],
  secondaryLikes: ["Pasta", "Salat"],
  dislikes: ["Innereien", "Grätenfisch"],
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

  const value = useMemo(
    () => ({
      profile,
      setProfile
    }),
    [profile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);

  if (!value) {
    throw new Error("useProfile muss innerhalb von ProfileProvider genutzt werden.");
  }

  return value;
}
'@

wf "apps/mobile/src/app/navigation/RootNavigator.tsx" @'
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
'@

wf "apps/mobile/src/app/navigation/PickTabs.tsx" @'
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
          PickForMe
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
'@

wf "apps/mobile/src/components/ui/Screen.tsx" @'
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { styles } from "../../theme/styles";

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.screenContent}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
'@

wf "apps/mobile/src/components/ui/Chip.tsx" @'
import React from "react";
import { Pressable, Text } from "react-native";
import { styles } from "../../theme/styles";

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}
'@

wf "apps/mobile/src/components/profile/ProfileEditor.tsx" @'
import React from "react";
import { Text, TextInput, View } from "react-native";
import { Chip } from "../ui/Chip";
import { styles } from "../../theme/styles";
import type { UserProfile } from "../../types/profile";

const OPTIONS = {
  primaryLikes: ["Fleisch", "Pasta", "Salat", "Fisch", "Meeresfrüchte", "Regional"],
  dislikes: ["Innereien", "Grätenfisch", "Koriander"],
  intolerances: ["Laktose", "Gluten", "Nüsse"]
};

export function ProfileEditor({
  profile,
  setProfile
}: {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Mein Profil</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={profile.displayName}
        onChangeText={(displayName) => setProfile({ ...profile, displayName })}
      />

      <Text style={styles.label}>Hauptvorlieben</Text>
      <ChipList
        options={OPTIONS.primaryLikes}
        values={profile.primaryLikes}
        onChange={(primaryLikes) => setProfile({ ...profile, primaryLikes })}
      />

      <Text style={styles.label}>Abneigungen</Text>
      <ChipList
        options={OPTIONS.dislikes}
        values={profile.dislikes}
        onChange={(dislikes) => setProfile({ ...profile, dislikes })}
      />

      <Text style={styles.label}>Unverträglichkeiten</Text>
      <ChipList
        options={OPTIONS.intolerances}
        values={profile.intolerances}
        onChange={(intolerances) => setProfile({ ...profile, intolerances })}
      />
    </View>
  );
}

function ChipList({
  options,
  values,
  onChange
}: {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = values.includes(option);

        return (
          <Chip
            key={option}
            label={option}
            active={active}
            onPress={() => onChange(active ? values.filter((value) => value !== option) : [...values, option])}
          />
        );
      })}
    </View>
  );
}
'@

wf "apps/mobile/src/components/pick/MenuInputCard.tsx" @'
import React from "react";
import { Text, TextInput, View } from "react-native";
import { styles } from "../../theme/styles";

export function MenuInputCard({
  menuText,
  setMenuText
}: {
  menuText: string;
  setMenuText: (value: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Speisekarte</Text>
      <Text style={styles.hint}>
        Kopiere hier den Text der Karte hinein. Foto- und PDF-Erkennung bauen wir danach sauber ein.
      </Text>

      <TextInput
        multiline
        scrollEnabled
        style={[styles.input, styles.textArea]}
        value={menuText}
        onChangeText={setMenuText}
        placeholder={"Beispiel:\nSchäufele mit Kloß und Wirsing 18,90 €\nTagliatelle mit Pilzen 16,50 €\nGroßer Salat mit Hähnchen 14,90 €"}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}
'@

wf "apps/mobile/src/components/pick/SituationSelector.tsx" @'
import React from "react";
import { Text, View } from "react-native";
import { Chip } from "../ui/Chip";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

const SITUATIONS: Situation[] = ["leicht", "regional", "teilen", "überraschen"];

export function SituationSelector({
  situation,
  setSituation
}: {
  situation: Situation;
  setSituation: (situation: Situation) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h3}>Situation</Text>
      <View style={styles.chipRow}>
        {SITUATIONS.map((item) => (
          <Chip key={item} label={item} active={situation === item} onPress={() => setSituation(item)} />
        ))}
      </View>
    </View>
  );
}
'@

wf "apps/mobile/src/components/pick/RecommendationCard.tsx" @'
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { colors, styles } from "../../theme/styles";
import type { Dish } from "../../types/menu";
import type { AnalyzeData, Recommendation } from "../../types/recommendations";

export function RecommendationCard({ result }: { result: AnalyzeData }) {
  const dishesById = useMemo(() => new Map(result.dishes.map((dish) => [dish.id, dish])), [result.dishes]);

  const safeRecommendations = result.recommendations
    .map((rec) => ({ rec, dish: dishesById.get(rec.dishId) }))
    .filter((item): item is { rec: Recommendation; dish: Dish } => Boolean(item.dish));

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.resultMeta}>{result.dishes.length} Speisen erkannt · Modus: {result.mode}</Text>

      {safeRecommendations.map(({ rec, dish }, index) => (
        <View
          key={dish.id}
          style={[
            styles.resultItem,
            index === 0 ? { borderTopWidth: 0, paddingTop: 0 } : { borderTopColor: colors.border }
          ]}
        >
          <Text style={styles.resultName}>
            {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "•"} {dish.nameOriginal}
          </Text>

          <Text style={styles.resultMeta}>
            {typeof dish.price === "number" ? `${dish.price.toFixed(2)} €` : "Preis nicht erkannt"}
            {dish.category ? ` · ${dish.category}` : ""}
          </Text>

          {dish.descriptionOriginal ? <Text style={styles.resultMeta}>{dish.descriptionOriginal}</Text> : null}

          <Text style={styles.reason}>Warum? {rec.reason}</Text>
        </View>
      ))}
    </View>
  );
}
'@

wf "apps/mobile/src/screens/auth/LoginScreen.tsx" @'
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { env } from "../../config/env";
import { Screen } from "../../components/ui/Screen";
import { styles } from "../../theme/styles";

export function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState(env.devEmail);
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");

    try {
      await auth.loginDev(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login fehlgeschlagen.");
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Einloggen</Text>
        <Text style={styles.hint}>
          Lokaler Entwicklungszugang. Der Store-Login wird später sauber über Supabase aktiviert.
        </Text>

        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={env.devEmail}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Weiter</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
'@

wf "apps/mobile/src/screens/pick/PickScreen.tsx" @'
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MenuInputCard } from "../../components/pick/MenuInputCard";
import { RecommendationCard } from "../../components/pick/RecommendationCard";
import { SituationSelector } from "../../components/pick/SituationSelector";
import { Screen } from "../../components/ui/Screen";
import { useAnalyzeMenu } from "../../hooks/useAnalyzeMenu";
import { styles } from "../../theme/styles";
import type { Situation } from "../../types/profile";

export function PickScreen() {
  const [menuText, setMenuText] = useState("");
  const [situation, setSituation] = useState<Situation>("regional");
  const analyze = useAnalyzeMenu();

  return (
    <Screen>
      <Text style={styles.title}>PickForMe {"\u{1F37D}\uFE0F"}</Text>
      <Text style={styles.subtitle}>Das Restaurant kenne ich nicht. PickForMe kennt mich.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Für Mario</Text>
        <Text style={styles.heroText}>
          Speisekarte einfügen, Situation wählen und wenige passende Gerichte bekommen.
        </Text>
      </View>

      <MenuInputCard menuText={menuText} setMenuText={setMenuText} />
      <SituationSelector situation={situation} setSituation={setSituation} />

      {analyze.error ? <Text style={styles.error}>{analyze.error}</Text> : null}

      <Pressable
        style={[styles.button, analyze.loading && styles.buttonDisabled]}
        onPress={() => analyze.run(menuText, situation)}
        disabled={analyze.loading}
      >
        <Text style={styles.buttonText}>{analyze.loading ? "PickForMe prüft..." : "3 passende Gerichte finden"}</Text>
      </Pressable>

      {analyze.result ? <RecommendationCard result={analyze.result} /> : null}
    </Screen>
  );
}
'@

wf "apps/mobile/src/screens/profile/ProfileScreen.tsx" @'
import React from "react";
import { Pressable, Text } from "react-native";
import { useAuth } from "../../app/providers/AuthProvider";
import { useProfile } from "../../app/providers/ProfileProvider";
import { ProfileEditor } from "../../components/profile/ProfileEditor";
import { Screen } from "../../components/ui/Screen";
import { styles } from "../../theme/styles";

export function ProfileScreen() {
  const auth = useAuth();
  const { profile, setProfile } = useProfile();

  return (
    <Screen>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.subtitle}>Deine Vorlieben steuern, was PickForMe empfiehlt.</Text>

      <ProfileEditor profile={profile} setProfile={setProfile} />

      <Pressable style={styles.ghostButton} onPress={() => auth.signOut()}>
        <Text style={styles.ghostButtonText}>Abmelden</Text>
      </Pressable>
    </Screen>
  );
}
'@

wf "apps/mobile/src/hooks/useAnalyzeMenu.ts" @'
import { useState } from "react";
import { analyzeMenu } from "../api/pickformeApi";
import { useProfile } from "../app/providers/ProfileProvider";
import type { AnalyzeData } from "../types/recommendations";
import type { Situation } from "../types/profile";

export function useAnalyzeMenu() {
  const { profile } = useProfile();
  const [result, setResult] = useState<AnalyzeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(menuText: string, situation: Situation) {
    setError("");
    setResult(null);

    if (menuText.trim().length < 20) {
      setError("Bitte zuerst eine Speisekarte einfügen.");
      return;
    }

    setLoading(true);

    try {
      const data = await analyzeMenu({
        menuText,
        situation,
        profile
      });

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return {
    result,
    loading,
    error,
    run
  };
}
'@

wf "apps/mobile/src/api/apiClient.ts" @'
import { getAuthHeaders } from "../services/authService";
import { env } from "../config/env";

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string; details?: unknown } };

export async function apiPost<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as ApiResponse<TResponse>;

  if (!payload.ok) {
    throw new Error(payload.error.message);
  }

  return payload.data;
}
'@

wf "apps/mobile/src/api/pickformeApi.ts" @'
import { apiPost } from "./apiClient";
import type { Situation, UserProfile } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

export function analyzeMenu(args: {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
}) {
  return apiPost<AnalyzeData, typeof args>("/api/analyze-menu", args);
}
'@

wf "apps/mobile/src/services/authService.ts" @'
import { env } from "../config/env";
import { supabase } from "./supabaseClient";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (env.devMode) {
    return {
      "x-pickforme-dev-email": env.devEmail
    };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Du bist nicht eingeloggt.");
  }

  return {
    Authorization: `Bearer ${token}`
  };
}
'@

wf "apps/mobile/src/services/supabaseClient.ts" @'
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});
'@

Info "Schreibe Backend-API..."

wf "apps/api/package.json" @'
{
  "name": "@pickforme/api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.87.1",
    "next": "16.2.9",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@types/node": "24.10.1",
    "@types/react": "19.1.17",
    "typescript": "5.9.3"
  }
}
'@

wf "apps/api/tsconfig.json" @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "dom",
      "dom.iterable",
      "es2022"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
'@

wf "apps/api/next-env.d.ts" @'
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Diese Datei wird von Next.js benötigt.
'@

wf "apps/api/app/api/health/route.ts" @'
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      service: "pickforme-api",
      status: "ok"
    }
  });
}
'@

wf "apps/api/app/api/analyze-menu/route.ts" @'
import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { parseMenu } from "../../../src/menu/parseMenu";
import { recommendDishes } from "../../../src/recommendation/recommendDishes";
import type { AnalyzeMenuRequest } from "../../../src/types/api";

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = (await request.json()) as AnalyzeMenuRequest;

    if (body.sourceKind !== "text") {
      throw new AppError(400, "SOURCE_KIND_UNSUPPORTED", "In V1 wird zuerst Texteingabe unterstützt.");
    }

    if (!body.menuText || body.menuText.trim().length < 20) {
      throw new AppError(400, "MENU_TOO_SHORT", "Bitte zuerst eine Speisekarte einfügen.");
    }

    const dishes = parseMenu(body.menuText);

    if (dishes.length === 0) {
      throw new AppError(400, "NO_DISHES_FOUND", "PickForMe konnte noch keine Gerichte erkennen.");
    }

    const recommendations = recommendDishes({
      dishes,
      profile: body.profile,
      situation: body.situation
    });

    return NextResponse.json({
      ok: true,
      data: {
        mode: "fallback",
        dishes,
        recommendations
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
'@

wf "apps/api/src/types/profile.ts" @'
export type Situation = "leicht" | "regional" | "teilen" | "überraschen";

export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  secondaryLikes: string[];
  dislikes: string[];
  intolerances: string[];
  dietStyle: "normal" | "vegetarisch" | "vegan" | "flexitarisch";
};
'@

wf "apps/api/src/types/menu.ts" @'
export type Dish = {
  id: string;
  nameOriginal: string;
  descriptionOriginal?: string;
  price?: number;
  category?: string;
  sourceLine: string;
};
'@

wf "apps/api/src/types/recommendations.ts" @'
export type Recommendation = {
  dishId: string;
  reason: string;
};
'@

wf "apps/api/src/types/api.ts" @'
import type { Situation, UserProfile } from "./profile";

export type AnalyzeMenuRequest = {
  sourceKind: "text";
  menuText: string;
  situation: Situation;
  profile: UserProfile;
};
'@

wf "apps/api/src/errors/AppError.ts" @'
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
'@

wf "apps/api/src/errors/errorResponse.ts" @'
import { NextResponse } from "next/server";
import { AppError } from "./AppError";

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unbekannter Serverfehler."
      }
    },
    { status: 500 }
  );
}
'@

wf "apps/api/src/auth/requireUser.ts" @'
import { AppError } from "../errors/AppError";
import { getSupabaseAnon } from "../supabase/supabaseAnon";

export async function requireUser(request: Request): Promise<{ id: string; email?: string }> {
  const devEmail = request.headers.get("x-pickforme-dev-email");

  if (devEmail) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(403, "DEV_AUTH_DISABLED", "Dev-Login ist in Production deaktiviert.");
    }

    if (devEmail !== "mario.scordo@t-online.de") {
      throw new AppError(403, "DEV_USER_NOT_ALLOWED", "Dieser Dev-User ist nicht freigeschaltet.");
    }

    return {
      id: "00000000-0000-0000-0000-000000000001",
      email: devEmail
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new AppError(401, "AUTH_REQUIRED", "Nicht eingeloggt.");
  }

  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new AppError(401, "SESSION_INVALID", "Session ungültig oder abgelaufen.");
  }

  return {
    id: data.user.id,
    email: data.user.email || undefined
  };
}
'@

wf "apps/api/src/supabase/supabaseAnon.ts" @'
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../errors/AppError";

let client: SupabaseClient | null = null;

export function getSupabaseAnon() {
  if (client) {
    return client;
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AppError(500, "SUPABASE_ENV_MISSING", "Supabase-Umgebung ist nicht konfiguriert.");
  }

  client = createClient(url, anonKey);
  return client;
}
'@

wf "apps/api/src/menu/parseMenu.ts" @'
import type { Dish } from "../types/menu";

const PRICE_AT_END = /(\d{1,3}(?:[.,]\d{2})?)\s*(?:€|EUR)?\s*$/i;

const SKIP_PATTERNS = [
  /öffnungszeiten/i,
  /alle preise/i,
  /inkl\.?\s*mwst/i,
  /zusatzstoffe/i,
  /allergene/i
];

export function parseMenu(menuText: string): Dish[] {
  const lines = menuText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dishes: Dish[] = [];
  let currentCategory: string | undefined;

  for (const line of lines) {
    if (shouldSkipLine(line)) {
      continue;
    }

    const priceMatch = line.match(PRICE_AT_END);

    if (!priceMatch) {
      if (looksLikeCategory(line)) {
        currentCategory = line;
      }
      continue;
    }

    const priceRaw = priceMatch[1];
    const price = Number(priceRaw.replace(",", "."));
    const withoutPrice = line.replace(PRICE_AT_END, "").trim();

    if (withoutPrice.length < 3 || Number.isNaN(price)) {
      continue;
    }

    const { nameOriginal, descriptionOriginal } = splitNameAndDescription(withoutPrice);

    dishes.push({
      id: `dish_${String(dishes.length + 1).padStart(3, "0")}`,
      nameOriginal,
      descriptionOriginal,
      price,
      category: currentCategory,
      sourceLine: line
    });
  }

  return dishes;
}

function shouldSkipLine(line: string) {
  return SKIP_PATTERNS.some((pattern) => pattern.test(line));
}

function looksLikeCategory(line: string) {
  if (line.length > 32) {
    return false;
  }

  if (PRICE_AT_END.test(line)) {
    return false;
  }

  return /^[\p{L}\s&-]+$/u.test(line);
}

function splitNameAndDescription(value: string) {
  const separators = [" - ", " – ", " mit ", " an "];

  for (const separator of separators) {
    const index = value.toLowerCase().indexOf(separator);

    if (index > 2) {
      return {
        nameOriginal: value.slice(0, index).trim(),
        descriptionOriginal: value.slice(index).trim()
      };
    }
  }

  return {
    nameOriginal: value
  };
}
'@

wf "apps/api/src/recommendation/recommendDishes.ts" @'
import type { Dish } from "../types/menu";
import type { Recommendation } from "../types/recommendations";
import type { Situation, UserProfile } from "../types/profile";

export function recommendDishes({
  dishes,
  profile,
  situation
}: {
  dishes: Dish[];
  profile: UserProfile;
  situation: Situation;
}): Recommendation[] {
  const scored = dishes
    .map((dish) => ({
      dish,
      score: scoreDish(dish, profile, situation)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ dish }) => ({
    dishId: dish.id,
    reason: buildReason(dish, profile, situation)
  }));
}

function scoreDish(dish: Dish, profile: UserProfile, situation: Situation) {
  const text = `${dish.nameOriginal} ${dish.descriptionOriginal ?? ""} ${dish.category ?? ""}`.toLowerCase();
  let score = 0;

  for (const like of [...profile.primaryLikes, ...profile.secondaryLikes]) {
    if (text.includes(like.toLowerCase())) {
      score += profile.primaryLikes.includes(like) ? 6 : 3;
    }
  }

  for (const dislike of profile.dislikes) {
    if (text.includes(dislike.toLowerCase())) {
      score -= 12;
    }
  }

  for (const intolerance of profile.intolerances) {
    if (text.includes(intolerance.toLowerCase())) {
      score -= 20;
    }
  }

  if (situation === "regional" && matchesAny(text, ["regional", "fränkisch", "hausgemacht", "schäufele", "braten"])) {
    score += 5;
  }

  if (situation === "leicht" && matchesAny(text, ["salat", "gemüse", "fisch", "leicht"])) {
    score += 5;
  }

  if (situation === "teilen" && matchesAny(text, ["platte", "variation", "antipasti", "tapas", "zum teilen"])) {
    score += 5;
  }

  if (situation === "überraschen") {
    score += dish.id.endsWith("3") ? 2 : 0;
  }

  return score;
}

function buildReason(dish: Dish, profile: UserProfile, situation: Situation) {
  const text = `${dish.nameOriginal} ${dish.descriptionOriginal ?? ""} ${dish.category ?? ""}`.toLowerCase();
  const matchedLike = profile.primaryLikes.find((like) => text.includes(like.toLowerCase()));

  if (matchedLike) {
    return `Passt zu Marios Vorliebe für ${matchedLike}.`;
  }

  if (situation === "regional") {
    return "Wirkt passend für eine regionale Auswahl aus der Karte.";
  }

  if (situation === "leicht") {
    return "Wirkt passend, wenn es heute etwas leichter sein soll.";
  }

  if (situation === "teilen") {
    return "Wirkt passend, wenn am Tisch geteilt werden soll.";
  }

  return "Interessante Option aus der erkannten Karte.";
}

function matchesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}
'@

Info "Schreibe Supabase-Platzhalter..."

wf "supabase/schema.sql" @'
-- PickForMe V1 Schema
-- Für die Clean Baseline bleibt das Profil lokal.
-- Supabase Auth und persistente Profile werden im nächsten Architekturblock aktiviert.
'@

Ok "PickForMe V1 Clean Architecture Baseline wurde erstellt."
Write-Host ""
Write-Host "Naechste Befehle:" -ForegroundColor White
Write-Host "  npm install" -ForegroundColor White
Write-Host "  npm --workspace apps/mobile run typecheck" -ForegroundColor White
Write-Host "  npm --workspace apps/api run typecheck" -ForegroundColor White
Write-Host ""
Write-Host "Danach erst Backend und Mobile starten." -ForegroundColor White
