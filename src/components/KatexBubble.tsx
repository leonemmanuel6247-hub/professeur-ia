import React, { useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { useAppStore } from "../store/useAppStore";
import { buildMessageHtml } from "./richText";

export function KatexBubble({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const html = useMemo(() => buildMessageHtml(content, theme), [content, theme]);
  const [h, setH] = useState(80);
  const lastH = useRef(0);
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
        if (Number.isFinite(n) && n > 30 && n < 100000 && Math.abs(n - lastH.current) >= 2) {
          lastH.current = n;
          setH(n + 8);
        }
      }}
      style={{ width: Math.min(width * 0.86, 680), height: h, backgroundColor: "transparent" }}
    />
  );
}
