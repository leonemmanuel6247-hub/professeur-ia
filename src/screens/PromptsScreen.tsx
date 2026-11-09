import React from "react";
import { Alert, ScrollView } from "react-native";
import { Btn, Card, Field, H1, H2, Screen } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_PROMPTS } from "../prompts/defaults";
import { spacing } from "../theme";

const LABELS: Record<string, string> = {
  professeur: "Professeur (systeme)",
  ingestion: "Ingestion / analyse",
  lecon: "Lecon",
  exercice: "Exercices",
  correction: "Correction",
  schema: "Schema / Zone Experience",
};

export function PromptsScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 48 }}>
        <H1>Prompts</H1>
        {Object.keys(LABELS).map((k) => (
          <Card key={k}>
            <H2>{LABELS[k]}</H2>
            <Field
              label="Texte"
              value={settings.prompts[k] || ""}
              onChangeText={(t) =>
                setSettings({ ...settings, prompts: { ...settings.prompts, [k]: t } })
              }
              multiline
            />
            <Btn
              title="Retablir par defaut"
              variant="ghost"
              onPress={() =>
                setSettings({
                  ...settings,
                  prompts: { ...settings.prompts, [k]: DEFAULT_PROMPTS[k] },
                })
              }
            />
          </Card>
        ))}
        <Btn
          title="Tout retablir"
          variant="danger"
          onPress={() =>
            Alert.alert("Prompts", "Retablir tous les textes par defaut ?", [
              { text: "Annuler", style: "cancel" },
              {
                text: "Oui",
                onPress: () => setSettings({ ...settings, prompts: { ...DEFAULT_PROMPTS } }),
              },
            ])
          }
        />
      </ScrollView>
    </Screen>
  );
}
