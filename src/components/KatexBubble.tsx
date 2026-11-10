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

  const applyHeight = (n: number) => {
    if (Number.isFinite(n) && n > 20 && n < 200000 && Math.abs(n - lastH.current) >= 1) {
      lastH.current = n;
      setH(n + 8);
    }
  };

  // Force une mesure fiable de la hauteur du contenu, meme si le script de la
  // page n'a pas encore poste (polices, maths, streaming en cours).
  const probe = `(function(){
    try{
      var b=document.body;
      var h=Math.max(b.scrollHeight,b.offsetHeight,b.getBoundingClientRect().height,
        document.documentElement.scrollHeight,document.documentElement.getBoundingClientRect().height);
      if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(String(Math.ceil(h))); }
    }catch(e){}
    true;
  })();`;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url.startsWith("about:") || r.url.startsWith("data:")}
      injectedJavaScript={probe}
      onLoadEnd={() => {
        // Relance la mesure un court instant apres le chargement (polices/maths).
        lastH.current = 0;
      }}
      onMessage={(e) => {
        const n = Number(e.nativeEvent.data);
        applyHeight(n);
      }}
      style={{ width: Math.min(width * 0.86, 680), height: h, backgroundColor: "transparent" }}
    />
  );
}
