import katex from "katex";
import { KATEX_CSS } from "./katexCss";
import { ThemeColors } from "../theme";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: "html",
      trust: false,
    });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

function inlineFmt(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[HORS COURS\]/g, '<span class="hors">HORS COURS</span>');
}

function mdToTables(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l.trim());
  const cells = (l: string) => {
    let x = l.trim();
    if (x.startsWith("|")) x = x.slice(1);
    if (x.endsWith("|")) x = x.slice(0, -1);
    return x.split("|").map((c) => c.trim());
  };
  while (i < lines.length) {
    if (i + 1 < lines.length && lines[i].includes("|") && isSep(lines[i + 1])) {
      const head = cells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      let html = '<table><thead><tr>';
      for (const h of head) html += `<th>${inlineFmt(escapeHtml(h))}</th>`;
      html += "</tr></thead><tbody>";
      for (const r of rows) {
        html += "<tr>";
        for (let c = 0; c < head.length; c += 1) html += `<td>${inlineFmt(escapeHtml(r[c] ?? ""))}</td>`;
        html += "</tr>";
      }
      html += "</tbody></table>";
      out.push(html);
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return out;
}

export function markdownToHtml(md: string): string {
  const codeBlocks: string[] = [];
  let src = md.replace(/\r/g, "");
  src = src.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "");
    codeBlocks.push(`<pre>${escapeHtml(inner)}</pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  let lines = mdToTables(src.split("\n"));
  src = lines.join("\n");

  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => `\u0000MATHB${renderTex(tex.trim(), true)}\u0000`);
  src = src.replace(/\$([^$\n]+?)\$/g, (_m, tex) => renderTex(tex.trim(), false));
  src = src.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex) => renderTex(tex.trim(), false));
  src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex) => `\u0000MATHB${renderTex(tex.trim(), true)}\u0000`);

  const out: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw;
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    const code = line.match(/^\u0000CODE(\d+)\u0000$/);
    if (code) {
      out.push(codeBlocks[Number(code[1])]);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length, 4);
      out.push(`<h${lvl}>${inlineFmt(h[2])}</h${lvl}>`);
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      out.push(`<li>${inlineFmt(li[1])}</li>`);
      continue;
    }
    out.push(`<p>${inlineFmt(line)}</p>`);
  }

  let html = out.join("\n");
  html = html.replace(/\u0000MATHB([\s\S]*?)\u0000/g, (_m, inner) => `<div class="math-block">${inner}</div>`);
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  return html;
}

export function buildMessageHtml(content: string, theme: ThemeColors, bubbleId = ""): string {
  const body = markdownToHtml(content);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;"/>
<style>${KATEX_CSS}</style>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:visible}
body{padding:2px 2px 10px;color:${theme.text};font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.65;word-wrap:break-word}
h1,h2,h3,h4{margin:12px 0 6px;line-height:1.25}
h1{font-size:20px}h2{font-size:18px}h3{font-size:16px}h4{font-size:15px}
p{margin:6px 0}
pre,code{font-family:ui-monospace,SFMono-Regular,monospace;background:${theme.surfaceAlt};border-radius:4px}
code{padding:1px 4px;font-size:13px}
pre{padding:8px;overflow:auto;white-space:pre-wrap}
.hors{background:${theme.horsCoursBg};color:${theme.horsCours};padding:2px 6px;border-radius:4px;font-weight:700}
ul{padding-left:20px;margin:6px 0}
li{margin:2px 0}
.math-block{margin:8px 0;overflow-x:auto;text-align:center}
.katex{font-size:1.02em}
.katex-display{overflow-x:auto;overflow-y:hidden;padding:2px 0}
table{border-collapse:collapse;margin:8px 0;width:100%;display:block;overflow-x:auto}
th,td{border:1px solid ${theme.border};padding:6px 8px;font-size:14px;text-align:left}
th{background:${theme.surfaceAlt};font-weight:700}
a{pointer-events:none;color:${theme.primary}}
</style></head><body>${body}
<script>
(function(){
  var last=-1;
  function measure(){
    try{
      var b=document.body;
      var h=Math.max(b.scrollHeight,b.offsetHeight,b.getBoundingClientRect().height,
        document.documentElement.scrollHeight,document.documentElement.getBoundingClientRect().height);
      return Math.ceil(h);
    }catch(e){ return 0; }
  }
  function send(){
    try{
      var h=measure();
      if(h<1) return;
      if(Math.abs(h-last)<1) return;
      last=h;
      if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(String(h)); }
      else if(window.parent){ window.parent.postMessage({__katexH:h,__katexId:${JSON.stringify(bubbleId)}}, "*"); }
    }catch(e){}
  }
  if(window.ResizeObserver){ try{ new ResizeObserver(function(){ send(); }).observe(document.body); }catch(e){} }
  if(window.MutationObserver){ try{ new MutationObserver(function(){ send(); }).observe(document.body,{childList:true,subtree:true,characterData:true}); }catch(e){} }
  window.addEventListener("load",send);
  document.fonts && document.fonts.ready && document.fonts.ready.then(send);
  [0,30,80,150,250,400,600,900,1200,1600,2200,3000].forEach(function(t){ setTimeout(send,t); });
  // Surveillance continue : garantit que la hauteur reste synchronisee (streaming, polices, maths).
  var ticks=0;
  var iv=setInterval(function(){ send(); if(++ticks>120) clearInterval(iv); },120);
})();
</script>
</body></html>`;
}
