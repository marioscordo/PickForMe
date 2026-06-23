const fs = require("fs");

function write(path, content) {
  fs.writeFileSync(path, content.replace(/\n/g, "\r\n"), "utf8");
}

write("apps/mobile/src/components/ui/Screen.tsx", `import React, { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { styles } from "../../theme/styles";

export function Screen({
  children,
  scrollToTopKey
}: {
  children: React.ReactNode;
  scrollToTopKey?: string | number;
}) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollToTopKey]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.screenContent}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
`);

write("apps/mobile/src/components/pick/MenuInputCard.tsx", `import React from "react";
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
        Text der Speisekarte einfügen. Lange Karten bleiben im Feld scrollbar, damit der Button erreichbar bleibt.
      </Text>

      <TextInput
        multiline
        scrollEnabled
        style={[styles.input, styles.textArea]}
        value={menuText}
        onChangeText={setMenuText}
        placeholder={"Beispiel:\\nSchäufele mit Kloß und Wirsing 18,90 €\\nTagliatelle mit Pilzen 16,50 €\\nGroßer Salat mit Hähnchen 14,90 €"}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}
`);

write("apps/mobile/src/app/navigation/PickTabs.tsx", `import React from "react";
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
          Speisekarte
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
`);
