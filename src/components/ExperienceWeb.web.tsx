import React, { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { wrapExperienceHtml } from "../experience/libs";
import { SchemaSpec } from "../types";
import { Btn } from "./ui";
import { useAppStore } from "../store/useAppStore";

export function ExperienceWeb({
  html,
  spec,
  onValidated,
}: {
  html: string;
  spec?: SchemaSpec | null;
  onValidated?: (ok: boolean, detail: string) => void;
}) {
  const theme = useAppStore((s) => s.theme);
  const [codeOpen, setCodeOpen] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const wrapped = wrapExperienceHtml(html);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <iframe
        key={frameKey}
        title="experience"
        srcDoc={wrapped}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
        onLoad={() => {
          onValidated?.(true, "Experience chargee (validation native sur APK)");
        }}
      />
      <View style={{ flexDirection: "row", padding: 8, gap: 8 }}>
        <Btn title="Voir le code" variant="ghost" onPress={() => setCodeOpen(true)} style={{ flex: 1 }} />
        <Btn
          title="Arreter"
          variant="danger"
          onPress={() => setFrameKey((k) => k + 1)}
          style={{ flex: 1 }}
        />
      </View>
      <Modal visible={codeOpen} animationType="slide" onRequestClose={() => setCodeOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 48 }}>
          <Btn title="Fermer" onPress={() => setCodeOpen(false)} />
          <ScrollView style={{ padding: 12 }}>
            <Text style={{ fontFamily: "monospace", color: theme.text, fontSize: 12 }}>{html}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}