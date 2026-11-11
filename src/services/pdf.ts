import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { PDFDocument } from "pdf-lib";

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

function base64ToBytes(base64: string): Uint8Array {
  const clean = (base64 || "").replace(/^data:[^,]*,/, "");
  const binary = base64ToBinary(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  try {
    if (typeof globalThis.btoa === "function") {
      let bin = "";
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode(...bytes.subarray(i, i + step));
      }
      return globalThis.btoa(bin);
    }
  } catch {
    /* fall through */
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    out += chars[b1 >> 2];
    out += chars[((b1 & 3) << 4) | ((b2 ?? 0) >> 4)];
    out += b2 === undefined ? "=" : chars[((b2 & 15) << 2) | ((b3 ?? 0) >> 6)];
    out += b3 === undefined ? "=" : chars[b3 & 63];
  }
  return out;
}



/**
 * Nombre de pages d'un PDF (via pdf-lib). Retourne 0 si le fichier n'est pas un
 * PDF exploitable.
 */
export async function countPdfPages(base64: string): Promise<number> {
  try {
    const bytes = base64ToBytes(base64);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

/**
 * Decoupe un PDF en tranches de `chunkSize` pages (par defaut 10). Retourne un
 * tableau ordonne de documents PDF (chacun encode en base64). Le dernier troncon
 * peut contenir moins de pages (le reste).
 *
 * Si le PDF compte `chunkSize` pages ou moins, un seul troncon (le document
 * entier) est retourne : aucun decoupage inutile.
 */
export async function splitPdfIntoChunks(
  base64: string,
  chunkSize = 10
): Promise<{ index: number; pageStart: number; pageEnd: number; dataBase64: string }[]> {
  const src = await PDFDocument.load(base64ToBytes(base64), { ignoreEncryption: true });
  const total = src.getPageCount();
  if (total <= chunkSize) {
    return [{ index: 0, pageStart: 1, pageEnd: total, dataBase64: base64 }];
  }
  const out: { index: number; pageStart: number; pageEnd: number; dataBase64: string }[] = [];
  for (let start = 0, i = 0; start < total; start += chunkSize, i++) {
    const end = Math.min(start + chunkSize, total);
    const dst = await PDFDocument.create();
    const copied = await dst.copyPages(src, Array.from({ length: end - start }, (_, k) => start + k));
    for (const p of copied) dst.addPage(p);
    const bytes = await dst.save();
    out.push({
      index: i,
      pageStart: start + 1,
      pageEnd: end,
      dataBase64: bytesToBase64(bytes),
    });
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
