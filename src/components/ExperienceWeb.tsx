import React, { useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { wrapExperienceHtml, VALIDATOR_JS } from "../experience/libs";
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
  const ref = useRef<WebView>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(true);
  const wrapped = wrapExperienceHtml(html);
  const ids = spec?.objets?.map((o) => o.id) ?? [];

  const injectIds = `
    window.__piaExpectedIds = ${JSON.stringify(ids)};
    true;
  `;

  const renderWeb = () => (
    <WebView
      ref={ref}
      originWhitelist={["*"]}
      source={{ html: wrapped }}
      javaScriptEnabled
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(req) => req.url.startsWith("about:") || req.url.startsWith("data:")}
      onLoadEnd={() => {
        setBusy(false);
        ref.current?.injectJavaScript(injectIds + VALIDATOR_JS);
      }}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data) as {
            type: string;
            missing?: string[];
            errors?: string[];
          };
          if (data.type === "validate") {
            const ok = !(data.missing?.length || data.errors?.length);
            onValidated?.(
              ok,
              ok
                ? "Schema valide"
                : `Manquants: ${(data.missing || []).join(", ")} ${data.errors?.join("; ") || ""}`
            );
          }
        } catch {
          /* ignore */
        }
      }}
      style={{ flex: 1, backgroundColor: theme.bg }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {busy ? (
        <View style={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}
      {renderWeb()}
      <View style={{ flexDirection: "row", padding: 8, gap: 8 }}>
        <Btn title="Plein ecran" variant="ghost" onPress={() => setFull(true)} style={{ flex: 1 }} />
        <Btn title="Voir le code" variant="ghost" onPress={() => setCodeOpen(true)} style={{ flex: 1 }} />
        <Btn
          title="Arreter"
          variant="danger"
          onPress={() => ref.current?.injectJavaScript("window.stop && window.stop(); true;")}
          style={{ flex: 1 }}
        />
      </View>
      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 48, paddingBottom: 24 }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingBottom: 8 }}>
            <Btn title="Fermer" onPress={() => setFull(false)} style={{ flex: 1 }} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 8 }}>{renderWeb()}</View>
        </View>
      </Modal>
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
