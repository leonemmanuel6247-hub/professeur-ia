import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Card, Empty, H1, H2, P, ProgressBar, Screen } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { listMastery } from "../services/courses";
import { dueToday, fragile } from "../services/mastery";
import { MasteryRow } from "../types";
import { spacing } from "../theme";

export function ProgressScreen() {
  const theme = useAppStore((s) => s.theme);
  const courses = useAppStore((s) => s.courses);
  const [rows, setRows] = useState<MasteryRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      listMastery().then(setRows);
    }, [])
  );

  const due = dueToday(rows);
  const weak = fragile(rows);
  const streak = studyStreak(rows);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.lg, gap: 12, paddingBottom: 40 }}>
        <H1>Progres</H1>
        <Card>
          <H2>Serie d'etude</H2>
          <P>{streak} jour(s) avec au moins une notion revue.</P>
        </Card>
        <H2>Par cours</H2>
        {courses.length === 0 ? <Empty title="Pas encore de cours" /> : null}
        {courses.map((c) => (
          <Card key={c.id} style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.text, fontWeight: "700" }}>{c.title}</Text>
            <View style={{ marginTop: 8 }}>
              <ProgressBar value={c.progress} />
            </View>
            <P muted>{Math.round(c.progress * 100)} %</P>
          </Card>
        ))}
        <H2>A reviser aujourd'hui</H2>
        {due.length === 0 ? <P muted>Rien de prevu. Bravo.</P> : null}
        {due.map((m) => (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.text }}>{m.notion}</Text>
            <P muted>maitrise {(m.score * 100).toFixed(0)} %</P>
            <ProgressBar value={m.score} />
          </Card>
        ))}
        <H2>Notions fragiles</H2>
        {weak.map((m) => (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.text }}>{m.notion}</Text>
            <ProgressBar value={m.score} />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

function studyStreak(rows: MasteryRow[]): number {
  if (!rows.length) return 0;
  const days = new Set(
    rows.map((r) => new Date(r.nextReview - r.intervalDays * 86400000).toISOString().slice(0, 10))
  );
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) n += 1;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
