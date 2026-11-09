import React, { useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { useAppStore } from "../store/useAppStore";
import { buildMessageHtml } from "./richText";

export function KatexBubble({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const html = useMemo(() => buildMessageHtml(content, theme), [content, theme]);
  const [h, setH] = useState(140);
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      scrollEnabled={false}
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url.startsWith("about:") || r.url.startsWith("data:")}
      onMessage={(e) => {
        const n = Number(e.nativeEvent.data);
        if (n > 40 && n < 8000) setH(n);
      }}
      style={{ width: Math.min(width * 0.9, 720), height: h, backgroundColor: "transparent" }}
    />
  );
}