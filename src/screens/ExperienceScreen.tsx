import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { Btn, Card, Empty, H1, P, Screen } from "../components/ui";
import { ExperienceWeb } from "../components/ExperienceWeb";
import { useAppStore } from "../store/useAppStore";
import { listExperiences, saveExperience } from "../services/courses";
import { ExperienceRow, SchemaSpec } from "../types";
import { chatWithFallback } from "../llm/router";
import { orderedForRole } from "../services/providers";
import { fillPrompt } from "../prompts/defaults";
import { spacing } from "../theme";

export function ExperienceScreen() {
  const theme = useAppStore((s) => s.theme);
  const active = useAppStore((s) => s.activeExperience);
  const setActive = useAppStore((s) => s.setActiveExperience);
  const courseId = useAppStore((s) => s.activeCourseId);
  const profiles = useAppStore((s) => s.profiles);
  const settings = useAppStore((s) => s.settings);
  const [list, setList] = useState<ExperienceRow[]>([]);
  const [status, setStatus] = useState("");
  const attemptsRef = useRef<Record<string, number>>({});

  const reload = async () => setList(await listExperiences(courseId || undefined));

  useEffect(() => {
    reload();
  }, [courseId, active?.id]);

  const regen = async (row: ExperienceRow, attempt = 1) => {
    if (!profiles.length) {
      Alert.alert("Profil IA", "Configure un profil schemas.");
      return;
    }
    try {
      const ordered = orderedForRole(profiles, "schemas", settings.schemasProviderId || settings.defaultProviderId);
      const prompt = fillPrompt(settings.prompts.schema, {
        sujet: row.title + "\nSpec:\n" + row.specJson,
        fiche_identite: "",
      });
      const res = await chatWithFallback(ordered, [{ role: "user", content: prompt }]);
      const htmlMatch = res.text.match(/```html\s*([\s\S]*?)```/i);
      const html = htmlMatch ? htmlMatch[1] : res.text;
      const next = { ...row, html, status: "pending" as const };
      await saveExperience(next);
      setActive(next);
      setStatus(`Regeneration ${attempt}`);
    } catch (e) {
      Alert.alert("Schema", e instanceof Error ? e.message : "echec");
    }
  };

  const current = active;
  let spec: SchemaSpec | null = null;
  try {
    if (current) spec = JSON.parse(current.specJson) as SchemaSpec;
  } catch {
    spec = null;
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, paddingTop: spacing.lg, flex: 1 }}>
        <H1>Zone Experience</H1>
        <P muted>{status || "Schemas hors-ligne, WebView isolee."}</P>
        {current ? (
          <View style={{ flex: 1, marginTop: 8 }}>
            <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 6 }}>{current.title}</Text>
            <ExperienceWeb
              html={current.html}
              spec={spec}
              onValidated={async (ok, detail) => {
                setStatus(detail);
                if (!ok && current.status !== "failed") {
                  const tries = attemptsRef.current[current.id] || 0;
                  if (tries < 2) {
                    attemptsRef.current[current.id] = tries + 1;
                    await regen(current, tries + 1);
                  } else {
                    const failed = { ...current, status: "failed" as const };
                    await saveExperience(failed);
                    setActive(failed);
                    Alert.alert("Schema non valide", "Le schema n'a pas pu etre valide. Voir le code.");
                  }
                } else if (ok) {
                  attemptsRef.current[current.id] = 0;
                  const valid = { ...current, status: "valid" as const };
                  await saveExperience(valid);
                  setActive(valid);
                }
              }}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Btn title="Regenerer" variant="ghost" onPress={() => regen(current)} style={{ flex: 1 }} />
              <Btn title="Liste" variant="ghost" onPress={() => setActive(null)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={<Empty title="Aucun schema" subtitle="Demande « Montre-moi un schema » dans le chat." />}
            renderItem={({ item }) => (
              <Card style={{ marginTop: 10 }}>
                <Text style={{ color: theme.text, fontWeight: "700" }}>{item.title}</Text>
                <Text style={{ color: theme.textMuted }}>{item.status}</Text>
                <Btn title="Ouvrir" onPress={() => setActive(item)} style={{ marginTop: 8 }} />
              </Card>
            )}
          />
        )}
      </View>
    </Screen>
  );
}
