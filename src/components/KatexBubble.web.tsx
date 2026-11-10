import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import { buildMessageHtml } from "./richText";

export function KatexBubble({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const id = useId();
  const [h, setH] = useState(60);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const html = useMemo(() => buildMessageHtml(content, theme, id), [content, theme, id]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { __katexH?: number; __katexId?: string } | null;
      if (!d || d.__katexId !== id) return;
      const n = d.__katexH;
      if (typeof n === "number" && n > 20 && n < 100000) setH(n + 6);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [id]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      try {
        const doc = el.contentDocument;
        if (!doc) return;
        const n = Math.max(
          doc.body?.scrollHeight || 0,
          doc.documentElement?.scrollHeight || 0
        );
        if (n > 20 && n < 100000) setH(n + 6);
      } catch {
        /* cross-origin ignore */
      }
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    if (ro && el.contentDocument?.body) ro.observe(el.contentDocument.body);
    const timers = [80, 250, 600, 1200].map((t) => setTimeout(measure, t));
    return () => {
      ro?.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [html]);

  const w = Math.min(width * 0.86, 680);
  return (
    <View style={{ width: w, minHeight: h }}>
      <iframe
        ref={frameRef}
        title={`message-${id}`}
        srcDoc={html}
        sandbox="allow-scripts"
        scrolling="no"
        style={{
          width: w,
          height: h,
          border: "none",
          background: "transparent",
          display: "block",
          overflow: "hidden",
        }}
      />
    </View>
  );
}
