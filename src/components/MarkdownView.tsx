import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAppStore } from "../store/useAppStore";

type Seg =
  | { t: "p"; text: string }
  | { t: "h"; level: number; text: string }
  | { t: "li"; text: string }
  | { t: "code"; text: string }
  | { t: "hors"; text: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "latex"; text: string; display: boolean };

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line.trim());
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function splitBlocks(src: string): Seg[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Seg[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push({ t: "code", text: buf.join("\n") });
      continue;
    }
    if (
      i + 1 < lines.length &&
      lines[i].includes("|") &&
      isTableSep(lines[i + 1])
    ) {
      const head = splitRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push({ t: "table", head, rows });
      continue;
    }
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      out.push({ t: "h", level: hm[1].length, text: hm[2] });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      out.push({ t: "li", text: line.replace(/^\s*[-*]\s+/, "") });
      i += 1;
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !/^\s*[-*]/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push({ t: "p", text: buf.join(" ") });
  }
  return out;
}

function Inline({ text, color, muted, scale }: { text: string; color: string; muted: string; scale: number }) {
  const parts = useMemo(() => {
    const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|`[^`]+`|\[HORS COURS\][^\[]*)/g;
    const acc: { k: string; v: string }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) acc.push({ k: "t", v: text.slice(last, m.index) });
      const raw = m[0];
      if (raw.startsWith("$$")) acc.push({ k: "ld", v: raw.slice(2, -2) });
      else if (raw.startsWith("$")) acc.push({ k: "li", v: raw.slice(1, -1) });
      else if (raw.startsWith("**")) acc.push({ k: "b", v: raw.slice(2, -2) });
      else if (raw.startsWith("`")) acc.push({ k: "c", v: raw.slice(1, -1) });
      else acc.push({ k: "h", v: raw });
      last = m.index + raw.length;
    }
    if (last < text.length) acc.push({ k: "t", v: text.slice(last) });
    return acc;
  }, [text]);

  return (
    <Text style={{ color, fontSize: 15 * scale, lineHeight: 23 * scale }}>
      {parts.map((p, i) => {
        if (p.k === "b")
          return (
            <Text key={i} style={{ fontWeight: "700" }}>
              {p.v}
            </Text>
          );
        if (p.k === "c")
          return (
            <Text key={i} style={{ fontFamily: "monospace", backgroundColor: "#00000018", fontSize: 13 * scale }}>
              {p.v}
            </Text>
          );
        if (p.k === "h")
          return (
            <Text key={i} style={{ color: "#E36414", fontWeight: "700" }}>
              {p.v}
            </Text>
          );
        if (p.k === "ld" || p.k === "li")
          return (
            <Text
              key={i}
              onLongPress={() => {
                Clipboard.setStringAsync(p.v).catch(() => undefined);
              }}
              style={{
                fontFamily: "monospace",
                color: "#1A6B80",
                fontStyle: "italic",
                fontSize: (p.k === "ld" ? 16 : 14) * scale,
              }}
            >
              {p.k === "ld" ? `\n${p.v}\n` : p.v}
            </Text>
          );
        return <Text key={i}>{p.v}</Text>;
      })}
    </Text>
  );
}

function Cell({
  text,
  bold,
  color,
  scale,
  border,
  theme,
}: {
  text: string;
  bold?: boolean;
  color: string;
  scale: number;
  border?: boolean;
  theme: { border: string };
}) {
  return (
    <View
      style={{
        minWidth: 96,
        maxWidth: 220,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRightWidth: border ? 1 : 0,
        borderTopWidth: border ? 0 : 0,
        borderBottomWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Text
        style={{
          color,
          fontWeight: bold ? "700" : "400",
          fontSize: 13 * scale,
          lineHeight: 19 * scale,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export function MarkdownView({ content }: { content: string }) {
  const theme = useAppStore((s) => s.theme);
  const scale = useAppStore((s) => s.settings.fontScale);
  const blocks = useMemo(() => splitBlocks(content), [content]);
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.t === "table")
          return (
            <ScrollView
              key={i}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginVertical: 8 }}
            >
              <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", backgroundColor: theme.surfaceAlt }}>
                  {b.head.map((c, ci) => (
                    <Cell key={ci} text={c} bold color={theme.text} scale={scale} border theme={theme} />
                  ))}
                </View>
                {b.rows.map((row, ri) => (
                  <View
                    key={ri}
                    style={{
                      flexDirection: "row",
                      backgroundColor: ri % 2 ? theme.surfaceAlt + "55" : "transparent",
                    }}
                  >
                    {b.head.map((_, ci) => (
                      <Cell
                        key={ci}
                        text={row[ci] ?? ""}
                        color={theme.text}
                        scale={scale}
                        border
                        theme={theme}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        if (b.t === "h")
          return (
            <Text
              key={i}
              style={{
                color: theme.text,
                fontWeight: "700",
                fontSize: (22 - b.level * 2) * scale,
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              {b.text}
            </Text>
          );
        if (b.t === "code")
          return (
            <Pressable
              key={i}
              onLongPress={() => {
                Clipboard.setStringAsync(b.text).catch(() => undefined);
              }}
              style={{ backgroundColor: theme.surfaceAlt, padding: 10, borderRadius: 8, marginVertical: 8 }}
            >
              <Text style={{ fontFamily: "monospace", color: theme.text, fontSize: 12 * scale }}>{b.text}</Text>
            </Pressable>
          );
        if (b.t === "li")
          return (
            <View key={i} style={{ flexDirection: "row", marginBottom: 4, paddingLeft: 4 }}>
              <Text style={{ color: theme.primary, marginRight: 8 }}>•</Text>
              <View style={{ flex: 1 }}>
                <Inline text={b.text} color={theme.text} muted={theme.textMuted} scale={scale} />
              </View>
            </View>
          );
        return (
          <View key={i} style={{ marginBottom: 8 }}>
            <Inline text={b.text} color={theme.text} muted={theme.textMuted} scale={scale} />
          </View>
        );
      })}
    </View>
  );
}
