import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { Btn, Empty, H1, P, Screen } from "../components/ui";
import { RootStackParamList } from "../navigation";
import { getCourse, parseIdentity } from "../services/courses";
import { recordResult } from "../services/mastery";
import { useAppStore } from "../store/useAppStore";
import { spacing } from "../theme";

export function FlashcardsScreen() {
  const theme = useAppStore((s) => s.theme);
  const route = useRoute<RouteProp<RootStackParamList, "Flashcards">>();
  const [cards, setCards] = useState<{ q: string; a: string }[]>([]);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);

  React.useEffect(() => {
    (async () => {
      const c = await getCourse(route.params.courseId);
      if (!c) return;
      const id = parseIdentity(c.identityJson);
      const next: { q: string; a: string }[] = [];
      id.definitions.forEach((d) => next.push({ q: "Definition", a: d }));
      id.formulas.forEach((d) => next.push({ q: "Formule", a: d }));
      id.theorems.forEach((d) => next.push({ q: "Theoreme", a: d }));
      id.notations.forEach((d) => next.push({ q: "Notation", a: d }));
      setCards(next);
    })();
  }, [route.params.courseId]);

  const card = cards[i];
  const progress = useMemo(() => (cards.length ? `${i + 1}/${cards.length}` : "0/0"), [i, cards.length]);

  return (
    <Screen>
      <View style={{ padding: spacing.lg, flex: 1 }}>
        <H1>Cartes memoire</H1>
        <P muted>{progress}</P>
        {!card ? (
          <Empty title="Pas de cartes" subtitle="Importe un cours pour generer des cartes depuis la fiche d'identite." />
        ) : (
          <Pressable
            onPress={() => setFlip((f) => !f)}
            accessibilityRole="button"
            style={{
              flex: 1,
              marginVertical: 24,
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 24,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.textMuted, marginBottom: 12 }}>{flip ? "Reponse" : card.q}</Text>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "600" }}>{flip ? card.a : "Appuie pour retourner"}</Text>
          </Pressable>
        )}
        {card ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn
              title="Rate"
              variant="danger"
              style={{ flex: 1 }}
              onPress={async () => {
                await recordResult(route.params.courseId, card.a.slice(0, 80), false);
                setFlip(false);
                setI((x) => (x + 1) % Math.max(1, cards.length));
              }}
            />
            <Btn
              title="OK"
              style={{ flex: 1 }}
              onPress={async () => {
                await recordResult(route.params.courseId, card.a.slice(0, 80), true);
                setFlip(false);
                setI((x) => (x + 1) % Math.max(1, cards.length));
              }}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
