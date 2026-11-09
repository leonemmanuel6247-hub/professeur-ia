import React from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Btn, Card, Chip, H1, H2, P, Screen } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { RootStackParamList } from "../navigation";
import { go } from "../nav";
import { restoreBackup, shareBackup } from "../services/backup";
import { spacing } from "../theme";

export function SettingsScreen() {
  const theme = useAppStore((s) => s.theme);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const nav = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.lg, gap: 12, paddingBottom: 48 }}>
        <H1>Reglages</H1>
        <Card>
          <H2>Theme</H2>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
            {(["system", "light", "dark"] as const).map((t) => (
              <Chip
                key={t}
                label={t}
                active={settings.theme === t}
                onPress={() => setSettings({ ...settings, theme: t })}
              />
            ))}
          </View>
        </Card>
        <Card>
          <H2>Taille de police</H2>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
            {[0.9, 1, 1.15, 1.3].map((v) => (
              <Chip
                key={v}
                label={`${Math.round(v * 100)}%`}
                active={settings.fontScale === v}
                onPress={() => setSettings({ ...settings, fontScale: v })}
              />
            ))}
          </View>
        </Card>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <H2>Bonus Hors cours</H2>
              <P muted>Methodes rapides etiquetees, desactivables.</P>
            </View>
            <Switch
              value={settings.horsCoursEnabled}
              onValueChange={(v) => setSettings({ ...settings, horsCoursEnabled: v })}
            />
          </View>
        </Card>
        <Btn title="Profils IA" onPress={() => go(nav, "Profiles")} />
        <Btn title="Prompts (modifiables)" variant="ghost" onPress={() => go(nav, "Prompts")} />
        <Card>
          <H2>Sauvegarde</H2>
          <P muted>JSON local, sans les cles API (elles restent dans le coffre).</P>
          <View style={{ gap: 8, marginTop: 8 }}>
            <Btn
              title="Exporter la sauvegarde"
              onPress={async () => {
                try {
                  await shareBackup();
                } catch (e) {
                  Alert.alert("Sauvegarde", e instanceof Error ? e.message : "echec");
                }
              }}
            />
            <Btn
              title="Restaurer"
              variant="ghost"
              onPress={async () => {
                const picked = await DocumentPicker.getDocumentAsync({ type: "application/json" });
                if (picked.canceled || !picked.assets?.[0]) return;
                try {
                  const txt = await FileSystem.readAsStringAsync(picked.assets[0].uri);
                  await restoreBackup(txt);
                  Alert.alert("Restauration", "Donnees restaurees. Relance l'app si besoin.");
                } catch (e) {
                  Alert.alert("Restauration", e instanceof Error ? e.message : "fichier invalide");
                }
              }}
            />
          </View>
        </Card>
        <Btn title="A propos" variant="ghost" onPress={() => go(nav, "About")} />
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Android 8+ · Donnees locales · Aucune telemetrie
        </Text>
      </ScrollView>
    </Screen>
  );
}
