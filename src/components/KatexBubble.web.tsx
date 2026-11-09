import React, { useEffect, useId, useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import { buildMessageHtml } from "./richText";

export function KatexBubble({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const id = useId();
  const [h, setH] = useState(80);

  const html = useMemo(() => buildMessageHtml(content, theme, id), [content, theme, id]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { __katexH?: number; __katexId?: string } | null;
      if (!d || d.__katexId !== id) return;
      const n = d.__katexH;
      if (typeof n === "number" && n > 30 && n < 30000) setH(n + 8);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [id]);

  const w = Math.min(width * 0.86, 680);
  return (
    <View style={{ width: w, minHeight: h, height: h }}>
      <iframe
        title={`message-${id}`}
        srcDoc={html}
        sandbox="allow-scripts"
        style={{ width: w, height: h, border: "none", background: "transparent", display: "block" }}
      />
    </View>
  );
}
