import React, { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import Constants from "expo-constants";
import { Btn, Card, H1, H2, P, Screen } from "../components/ui";
import { getErrorLog } from "../db/database";
import { exportErrorLogText } from "../services/backup";
import { spacing } from "../theme";
import { useAppStore } from "../store/useAppStore";

export function AboutScreen() {
  const theme = useAppStore((s) => s.theme);
  const [logs, setLogs] = useState<{ createdAt: number; message: string }[]>([]);
  useEffect(() => {
    getErrorLog().then(setLogs);
  }, []);
  const version = Constants.expoConfig?.version || "1.0.0";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        <H1>Professeur IA</H1>
        <P>Version {version} — professeur scientifique hors-ligne autant que possible.</P>
        <P muted>
          Tes documents restent sur l'appareil. Les extraits necessaires partent uniquement vers le
          fournisseur IA que tu as choisi. Aucune telemetrie.
        </P>
        <Card>
          <H2>Journal d'erreurs (sans cles)</H2>
          {logs.length === 0 ? <P muted>Aucune erreur enregistree.</P> : null}
          {logs.slice(0, 20).map((l, i) => (
            <Text key={i} style={{ color: theme.textMuted, fontSize: 12, marginBottom: 6 }}>
              {new Date(l.createdAt).toLocaleString("fr-FR")} — {l.message}
            </Text>
          ))}
          <Btn
            title="Exporter le journal"
            variant="ghost"
            onPress={() => exportErrorLogText(logs)}
            style={{ marginTop: 8 }}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
