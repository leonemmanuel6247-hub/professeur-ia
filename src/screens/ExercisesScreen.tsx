import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { Btn, Card, Chip, H1, H2, P, Screen } from "../components/ui";
import { MarkdownView } from "../components/MarkdownView";
import { RootStackParamList } from "../navigation";
import { useAppStore } from "../store/useAppStore";
import { ExerciseRow } from "../types";
import { getCourse, listExercises, saveExercise, searchChunks } from "../services/courses";
import { chatWithFallback } from "../llm/router";
import { orderedForRole } from "../services/providers";
import { fillPrompt } from "../prompts/defaults";
import { uid } from "../db/database";
import { recordResult } from "../services/mastery";
import { spacing } from "../theme";

export function ExercisesScreen() {
  const theme = useAppStore((s) => s.theme);
  const route = useRoute<RouteProp<RootStackParamList, "Exercises">>();
  const profiles = useAppStore((s) => s.profiles);
  const settings = useAppStore((s) => s.settings);
  const [items, setItems] = useState<ExerciseRow[]>([]);
  const [n, setN] = useState(3);
  const [diff, setDiff] = useState(2);
  const [kind, setKind] = useState<ExerciseRow["kind"]>("calcul");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [showSol, setShowSol] = useState(false);
  const [answer, setAnswer] = useState("");

  const courseId = route.params.courseId;

  const reload = async () => setItems(await listExercises(courseId));
  useEffect(() => {
    reload();
  }, [courseId]);

  const generate = async () => {
    setBusy(true);
    try {
      const course = await getCourse(courseId);
      if (!course) throw new Error("Cours introuvable");
      const chunks = await searchChunks(courseId, course.title, 5);
      const prompt = fillPrompt(settings.prompts.exercice, {
        n: String(n),
        kind,
        difficulty: String(diff),
        fiche_identite: course.identityJson,
        passages: chunks.map((c) => c.text).join("\n"),
      });
      const ordered = orderedForRole(profiles, "default", settings.defaultProviderId);
      const res = await chatWithFallback(ordered, [{ role: "user", content: prompt }]);
      const json = extractJson(res.text);
      const list = (json?.exercises as Record<string, unknown>[]) || [];
      for (const e of list) {
        await saveExercise({
          id: await uid("ex"),
          courseId,
          sectionId: route.params.sectionId || "",
          prompt: String(e.prompt || ""),
          difficulty: Number(e.difficulty || diff),
          kind: (e.kind as ExerciseRow["kind"]) || kind,
          hintsJson: JSON.stringify(e.hints || []),
          solution: String(e.solution || ""),
          result: "",
        });
      }
      await reload();
    } catch (e) {
      Alert.alert("Exercices", e instanceof Error ? e.message : "echec");
    } finally {
      setBusy(false);
    }
  };

  const current = items.find((x) => x.id === openId);
  const hints: string[] = current ? JSON.parse(current.hintsJson || "[]") : [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40 }}>
        <H1>Exercices</H1>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {[1, 2, 3, 5].map((x) => (
            <Chip key={x} label={`${x} exo`} active={n === x} onPress={() => setN(x)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {[1, 2, 3, 4].map((x) => (
            <Chip key={x} label={`niv ${x}`} active={diff === x} onPress={() => setDiff(x)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {(["calcul", "demonstration", "qcm", "probleme"] as const).map((k) => (
            <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
        <Btn title="Generer" onPress={generate} loading={busy} />

        {current ? (
          <Card>
            <H2>Enonce</H2>
            <MarkdownView content={current.prompt} />
            {hintLevel > 0
              ? hints.slice(0, hintLevel).map((h, i) => (
                  <P key={i} muted>
                    Indice {i + 1} : {h}
                  </P>
                ))
              : null}
            {hintLevel < 3 ? (
              <Btn title={`Indice ${hintLevel + 1}/3`} variant="ghost" onPress={() => setHintLevel((x) => x + 1)} />
            ) : null}
            <Text style={{ color: theme.textMuted, marginTop: 8 }}>Ta solution</Text>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              multiline
              style={{
                minHeight: 80,
                backgroundColor: theme.input,
                color: theme.text,
                borderRadius: 8,
                padding: 8,
                marginVertical: 8,
              }}
            />
            <Btn
              title="Corriger ma reponse"
              variant="accent"
              onPress={async () => {
                try {
                  const course = await getCourse(courseId);
                  const chunks = await searchChunks(courseId, current.prompt, 4);
                  const prompt = fillPrompt(settings.prompts.correction, {
                    enonce: current.prompt,
                    solution: answer,
                    passages: chunks.map((c) => c.text).join("\n"),
                  });
                  const ordered = orderedForRole(profiles, "default", settings.defaultProviderId);
                  const res = await chatWithFallback(ordered, [{ role: "user", content: prompt }]);
                  Alert.alert("Correction", res.text.slice(0, 800));
                  const ok = /juste|correct|bonne reponse/i.test(res.text) && !/erreur/i.test(res.text);
                  await recordResult(courseId, (course?.title || "notion") + " / exo", ok);
                  await saveExercise({ ...current, result: ok ? "ok" : "ko" });
                } catch (e) {
                  Alert.alert("Correction", e instanceof Error ? e.message : "echec");
                }
              }}
            />
            <Btn title={showSol ? "Cacher le corrige" : "Voir le corrige"} variant="ghost" onPress={() => setShowSol((s) => !s)} />
            {showSol ? <MarkdownView content={current.solution} /> : null}
            <Btn title="Retour liste" variant="ghost" onPress={() => setOpenId(null)} />
          </Card>
        ) : (
          items.map((it) => (
            <Card key={it.id} style={{ marginBottom: 8 }}>
              <Text style={{ color: theme.text }} numberOfLines={3}>
                {it.prompt}
              </Text>
              <P muted>
                {it.kind} · niv {it.difficulty} {it.result ? `· ${it.result}` : ""}
              </P>
              <Btn
                title="Ouvrir"
                onPress={() => {
                  setOpenId(it.id);
                  setHintLevel(0);
                  setShowSol(false);
                  setAnswer("");
                }}
              />
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0) return null;
  try {
    return JSON.parse(raw.slice(a, b + 1));
  } catch {
    return null;
  }
}
