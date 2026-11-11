import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { Btn, Card, H2, P, ProgressBar, Screen } from "../components/ui";
import { useAppStore } from "../store/useAppStore";
import { ingestFromCamera, ingestFromLibrary, ingestPickedFiles } from "../services/ingest";
import { orderedForRole } from "../services/providers";
import type { RootStackParamList } from "../nav-types";
import { spacing } from "../theme";
import { logError } from "../db/database";

export function ImportScreen() {
  const theme = useAppStore((s) => s.theme);
  const profiles = useAppStore((s) => s.profiles);
  const settings = useAppStore((s) => s.settings);
  const refresh = useAppStore((s) => s.refresh);
  const setActive = useAppStore((s) => s.setActiveCourse);
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const [step, setStep] = useState("");
  const [ratio, setRatio] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const run = async (fn: typeof ingestPickedFiles) => {
    setError("");
    setDone("");
    if (!profiles.length) {
      setError("Aucun profil IA. Configure d'abord une cle dans Profils IA.");
      return;
    }
    setBusy(true);
    setRatio(0);
    try {
      const ordered = orderedForRole(profiles, "documents", settings.documentsProviderId || settings.defaultProviderId);
      const res = await fn(ordered, settings.prompts.ingestion, (s, r) => {
        setStep(s);
        setRatio(r);
      });
      await refresh();
      const created = res.courses ?? [res.course];
      setActive(res.course.id);
      if (res.chunkCount === 0) {
        setError(
          "Le document a ete importe mais aucun texte n'a pu etre lu. Essaie un PDF avec texte, ou active l'option Vision/PDF sur un profil IA dans Profils IA."
        );
      } else if (created.length > 1) {
        setDone(
          `${created.length} troncons crees (${res.pageCount} pages, ${res.chunkCount} extraits)${
            res.usedVision ? " (vision)" : ""
          }. Ouvre la bibliotheque pour les parcourir.`
        );
      } else {
        setDone(
          `${res.pageCount} page(s), ${res.chunkCount} extrait(s)${res.usedVision ? " (vision)" : ""}. Ouvre la fiche du cours.`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      await logError(msg).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12 }}>
        <P muted>PDF, images, ou photo d'une page. Limite 40 Mo. Le fichier reste sur le telephone.</P>
        <Btn title="Choisir un PDF ou des images" onPress={() => run(ingestPickedFiles)} loading={busy} disabled={busy} />
        <Btn title="Photographer une page" variant="accent" onPress={() => run(ingestFromCamera)} disabled={busy} />
        <Btn title="Galerie photos" variant="ghost" onPress={() => run(ingestFromLibrary)} disabled={busy} />
        {busy ? (
          <Card>
            <H2>{step || "Traitement..."}</H2>
            <View style={{ marginTop: 12 }}>
              <ProgressBar value={ratio} />
            </View>
            <Text style={{ color: theme.textMuted, marginTop: 8 }}>{Math.round(ratio * 100)} %</Text>
          </Card>
        ) : null}
        {error ? (
          <Card>
            <H2>Import impossible</H2>
            <Text style={{ color: theme.danger, marginTop: 6 }}>{error}</Text>
            <Btn title="Ouvrir Profils IA" variant="ghost" onPress={() => nav.navigate("Profiles")} style={{ marginTop: 10 }} />
          </Card>
        ) : null}
        {done ? (
          <Card>
            <H2>Import termine</H2>
            <Text style={{ color: theme.success, marginTop: 6 }}>{done}</Text>
          </Card>
        ) : null}
        <Card>
          <H2>Pipeline</H2>
          <P muted>
            1. Detection texte / scan{"\n"}
            2. Extraction (natif, ou via tout profil avec Vision/PDF natif active){"\n"}
            3. Decoupage pages / chapitres{"\n"}
            4. Fiche d'identite + plan a valider
          </P>
        </Card>
      </ScrollView>
    </Screen>
  );
}
