const fs = require("fs");
const path = require("path");

const cssPath = "node_modules/katex/dist/katex.min.css";
const fontsDir = "node_modules/katex/dist/fonts";
let css = fs.readFileSync(cssPath, "utf8");

const files = fs.readdirSync(fontsDir).filter((f) => f.endsWith(".woff2"));
let inlined = 0;
for (const f of files) {
  const b64 = fs.readFileSync(path.join(fontsDir, f)).toString("base64");
  const needle = "url(fonts/" + f + ")";
  const dataUrl = "url(data:font/woff2;base64," + b64 + ")";
  if (css.includes(needle)) {
    css = css.split(needle).join(dataUrl);
    inlined += 1;
  }
}

const out =
  "/* Auto-generated from node_modules/katex. Do not edit by hand. */\n" +
  "export const KATEX_CSS = " +
  JSON.stringify(css) +
  ";\n";
fs.writeFileSync("src/components/katexCss.ts", out);
console.log("fonts inlined:", inlined, "css bytes:", css.length, "file kb:", Math.round(out.length / 1024));
