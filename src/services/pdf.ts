import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const MAX_BYTES = 40 * 1024 * 1024;
const isWeb = Platform.OS === "web";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(blob);
  });
}

export async function fileSize(uri: string): Promise<number> {
  if (isWeb) {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      return blob.size;
    } catch {
      return 0;
    }
  }
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && "size" in info ? Number(info.size) || 0 : 0;
}

export async function assertSize(uri: string) {
  const size = await fileSize(uri);
  if (size > MAX_BYTES) {
    throw new Error(
      `Fichier trop volumineux (${(size / 1024 / 1024).toFixed(1)} Mo). Limite : 40 Mo.`
    );
  }
}

export async function readAsBase64(uri: string): Promise<string> {
  if (isWeb) {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blobToBase64(blob);
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function guessMime(name: string, fallback = "application/octet-stream"): Promise<string> {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return fallback;
}

function base64ToBinary(base64: string): string {
  try {
    if (typeof globalThis.atob === "function") return globalThis.atob(base64);
  } catch {
    /* fall through */
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = chars.indexOf(clean[i]);
    const c2 = chars.indexOf(clean[i + 1]);
    const c3 = chars.indexOf(clean[i + 2]);
    const c4 = chars.indexOf(clean[i + 3]);
    out += String.fromCharCode((c1 << 2) | (c2 >> 4));
    if (c3 !== -1 && clean[i + 2] !== undefined) out += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
    if (c4 !== -1 && clean[i + 3] !== undefined) out += String.fromCharCode(((c3 & 3) << 6) | c4);
  }
  return out;
}

export function extractPdfTextHeuristic(base64: string): string {
  try {
    const raw = base64ToBinary(base64);
    if (!raw) return "";
    const chunks: string[] = [];
    const re = /\((?:\\.|[^\\)]){2,}\)|<([0-9A-Fa-f\s]{8,})>/g;
    let m: RegExpExecArray | null;
    const limit = Math.min(raw.length, 8_000_000);
    while ((m = re.exec(raw)) && m.index < limit) {
      let inner: string;
      if (m[1] !== undefined) {
        const hex = m[1].replace(/\s/g, "");
        if (hex.length % 2 !== 0) continue;
        let dec = "";
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.slice(i, i + 2), 16);
          if (code >= 32 || code === 10) dec += String.fromCharCode(code);
        }
        inner = dec;
      } else {
        inner = m[0].slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, " ").replace(/\\([()\\])/g, "$1");
      }
      if (/[\p{L}]{2,}/u.test(inner)) chunks.push(inner);
      if (chunks.length > 1500) break;
    }
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export function splitIntoPages(text: string): string[] {
  if (!text.trim()) return [];
  const byForm = text.split("\f").map((s) => s.trim()).filter(Boolean);
  if (byForm.length > 1) return byForm;
  const lines = text.split(/\n+/);
  const pages: string[] = [];
  let buf: string[] = [];
  let chars = 0;
  for (const line of lines) {
    buf.push(line);
    chars += line.length;
    if (chars > 1800) {
      pages.push(buf.join("\n"));
      buf = [];
      chars = 0;
    }
  }
  if (buf.length) pages.push(buf.join("\n"));
  return pages.length ? pages : [text];
}

export function chunkText(text: string, size = 900): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const w of words) {
    cur.push(w);
    n += w.length + 1;
    if (n >= size) {
      out.push(cur.join(" "));
      cur = [];
      n = 0;
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
