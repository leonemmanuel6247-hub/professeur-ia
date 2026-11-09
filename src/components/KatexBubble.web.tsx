import React, { useEffect, useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import { buildMessageHtml } from "./richText";

export function KatexBubble({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const [h, setH] = useState(140);

  const html = useMemo(() => buildMessageHtml(content, theme), [content, theme]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { __katexH?: number } | null;
      if (d && typeof d.__katexH === "number") {
        const n = d.__katexH;
        if (n > 30 && n < 6000) setH(n);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const w = Math.min(width * 0.9, 720);
  return (
    <View style={{ width: w, height: h, overflow: "hidden" }}>
      <iframe
        title="message"
        srcDoc={html}
        sandbox="allow-scripts"
        style={{ width: w, height: h, border: "none", background: "transparent", display: "block" }}
      />
    </View>
  );
}