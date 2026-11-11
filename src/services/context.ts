import { Course, CourseIdentity } from "../types";
import { estimateTokens } from "../llm/types";
import { LlmMessage } from "../llm/types";
import { parseIdentity, searchChunks } from "./courses";
import { listMastery } from "./courses";

export async function buildProfessorMessages(opts: {
  systemTpl: string;
  course: Course;
  userText: string;
  history: { role: "user" | "assistant"; content: string }[];
  maxContext: number;
  horsCours: boolean;
  extraInstruction?: string;
}): Promise<LlmMessage[]> {
  const identity: CourseIdentity = parseIdentity(opts.course.identityJson);
  const identityEmpty =
    !identity.summary &&
    !identity.notations.length &&
    !identity.definitions.length &&
    !identity.theorems.length &&
    !identity.formulas.length;
  const fiche = identityEmpty
    ? `Fiche d'identite non disponible. Titre du cours : "${opts.course.title}"${opts.course.subject ? `, matiere : ${opts.course.subject}` : ""}${opts.course.level ? `, niveau : ${opts.course.level}` : ""}. Appuie-toi sur les extraits ci-dessous.`
    : JSON.stringify(identity, null, 2);
  const kMax = 5;
  let k = kMax;
  const query = opts.userText || identity.summary || opts.course.title;
  let chunks = await searchChunks(opts.course.id, query, k);
  let passages = chunks.map((c, i) => `[extrait ${i + 1}]\n${c.text}`).join("\n\n");
  if (!passages) {
    passages =
      "(Aucun extrait specifique trouve. Si le cours n'a pas ete importe ou est vide, demande a l'eleve de fournir le texte ou de le coller.)";
  }
  const mastery = await listMastery(opts.course.id);
  const masteryTxt = mastery.length
    ? mastery.map((m) => `${m.notion}: ${(m.score * 100).toFixed(0)}%`).join(", ")
    : "debutant";

  const fill = (pass: string) =>
    opts.systemTpl
      .split("{fiche_identite}")
      .join(fiche)
      .split("{passages}")
      .join(pass)
      .split("{maitrise_notions}")
      .join(masteryTxt);

  const bonus = opts.horsCours
    ? "Les bonus [HORS COURS] sont autorises, toujours etiquetes."
    : "N'ajoute AUCUN contenu hors cours.";
  const schemaRule =
    "SCHEMA: si tu dessines, INTERDIT de decrire la figure en texte. Apres le texte pedagogique, un bloc ```json court PUIS un bloc ```html avec un VRAI <svg> ou <canvas> (line/circle/path/rect). Un HTML sans svg/canvas est refuse.";

  let history = compressHistory(opts.history);
  const replyBudget = Math.min(4096, Math.floor(opts.maxContext * 0.3));
  const systemBase = fill(passages) + "\n" + bonus + "\n" + schemaRule + (opts.extraInstruction ? `\n${opts.extraInstruction}` : "");

  const pack = () => {
    const mapped = history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    }));
    // Evite un doublon : si l'historique se termine deja par ce message eleve,
    // on ne le re-ajoute pas une seconde fois.
    const last = mapped[mapped.length - 1];
    const already = last && last.role === "user" && last.content.trim() === opts.userText.trim();
    const msgs: LlmMessage[] = [
      {
        role: "system",
        content:
          fill(passages) +
          "\n" +
          bonus +
          "\n" +
          schemaRule +
          (opts.extraInstruction ? `\n${opts.extraInstruction}` : ""),
      },
      ...mapped,
      ...(already ? [] : [{ role: "user" as const, content: opts.userText }]),
    ];
    const tokens = msgs.reduce((s, m) => s + estimateTokens(typeof m.content === "string" ? m.content : ""), 0);
    return { msgs, tokens };
  };

  let packed = pack();

  while (packed.tokens + replyBudget > opts.maxContext && history.length > 2) {
    const keepRecent = 2;
    if (history.length <= keepRecent) break;
    const dropped = history.slice(0, history.length - keepRecent);
    const recent = history.slice(-keepRecent);
    const prevSummary = dropped.find((d) => d.role === "assistant" && d.content.startsWith("[resume"));
    const body = prevSummary
      ? prevSummary.content.replace(/^\[resume[^\]]*\]\s*/, "")
      : "";
    const lines = dropped
      .filter((d) => d !== prevSummary)
      .map((d) => `${d.role === "user" ? "Eleve" : "Prof"}: ${compactText(d.content, 120)}`);
    const merged = [...(body ? [body] : []), ...lines].join(" ; ");
    history = [
      {
        role: "assistant",
        content: `[resume des echanges precedents] ${merged.slice(0, 700)}`,
      },
      ...recent,
    ];
    packed = pack();
  }

  while (packed.tokens + replyBudget > opts.maxContext && k > 1) {
    k -= 1;
    chunks = chunks.slice(0, k);
    passages = chunks.map((c, i) => `[extrait ${i + 1}]\n${c.text}`).join("\n\n");
    packed = pack();
  }

  while (packed.tokens + replyBudget > opts.maxContext && chunks.length) {
    chunks = chunks.map((c) => ({ ...c, text: c.text.slice(0, 400) }));
    passages = chunks.map((c, i) => `[extrait ${i + 1}]\n${c.text}`).join("\n\n");
    packed = pack();
  }

  void systemBase;
  return packed.msgs;
}

const CODEFENCE_RE = /(`{3,}|'{3,})[ \t]*([a-zA-Z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)(?:\1|$)/g;

function stripFenceNoise(s: string): string {
  return s
    .replace(/^[ \t]*(`{3,}|'{3,})[ \t]*/gm, "")
    .replace(/^[ \t]*(html|svg|json|javascript|js|xml)[ \t]*$/gim, "")
    .trim();
}

function looksLikeSvgHtml(s: string): boolean {
  return /<(svg|canvas|div|table|figure|math|iframe)\b/i.test(s) || /<\/(svg|canvas|div)>/i.test(s);
}

function looksLikeSchemaSpec(s: string): boolean {
  return /"(objets|titre|titres?|elements?|points?|formes?|steps?)"\s*:/.test(s) && /\{[\s\S]*\}/.test(s);
}

function safeJsonParse(s: string): unknown | null {
  const trimmed = s.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function extractSchemaBlocks(text: string): { spec: string | null; html: string | null } {
  const src = text || "";
  let spec: string | null = null;
  let html: string | null = null;

  CODEFENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODEFENCE_RE.exec(src)) !== null) {
    let lang = (m[2] || "").toLowerCase();
    const body = m[3] || "";
    if (!lang) {
      const firstWord = (body.match(/^[ \t]*([a-zA-Z0-9_-]+)[ \t]*\r?\n/) || [])[1];
      if (firstWord) lang = firstWord.toLowerCase();
    }
    const clean = stripFenceNoise(body);
    if (!clean) continue;
    const isHtmlBlock =
      lang === "html" || lang === "svg" || lang === "xml" || looksLikeSvgHtml(clean);
    if (isHtmlBlock && !html) {
      html = clean;
      continue;
    }
    if ((lang === "json" || lang === "" || looksLikeSchemaSpec(clean)) && !spec) {
      if (safeJsonParse(clean)) spec = clean;
    }
  }

  if (!spec) {
    const start = src.search(/\{\s*"(?:objets|titre|titres?|elements?)"\s*:/);
    if (start >= 0) {
      let depth = 0;
      let end = -1;
      let inStr = false;
      let esc = false;
      for (let i = start; i < src.length; i += 1) {
        const ch = src[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end > start) {
        const candidate = src.slice(start, end + 1);
        if (safeJsonParse(candidate)) spec = candidate;
      }
    }
  }

  if (!html) {
    const firstDraw = src.search(/<(?:svg|canvas)\b/i);
    if (firstDraw >= 0) {
      const lower = src.toLowerCase();
      const closeIdx = Math.max(lower.lastIndexOf("</svg>"), lower.lastIndexOf("</canvas>"));
      let end = src.length;
      if (closeIdx >= firstDraw) {
        const tag = lower.lastIndexOf("</canvas>") > lower.lastIndexOf("</svg>") ? "</canvas>" : "</svg>";
        end = closeIdx + tag.length;
      }
      let chunk = src.slice(firstDraw, end);
      const blankBreak = chunk.search(/\n[ \t]*\n(?=[A-Za-zÀ-ÿ])/);
      if (blankBreak > 0) {
        const head = chunk.slice(0, blankBreak);
        if (/<\/(?:svg|canvas)>/i.test(head)) chunk = head;
      }
      html = stripFenceNoise(chunk);
    }
  }

  return { spec, html };
}

const SCHEMA_LANGS = ["html", "svg", "json", "xml"];

/**
 * Le modele termine sa reponse par un marqueur <FIN> (demande dans le prompt
 * systeme). Ce marqueur n'est qu'un indicateur : il est retire AVANT l'affichage,
 * le stockage et l'envoi a l'historique, pour ne jamais polluer l'interface.
 */
export function stripFinishMarker(text: string): string {
  return (text || "")
    .replace(/[ \t]*<\s*\/?\s*FIN\s*>[ \t]*/gi, "")
    // Marqueur partiel en cours de reception (ex. "<FI", "</FI") en toute fin de
    // texte : on le masque pour eviter un artefact visuel pendant le streaming.
    .replace(/[ \t]*<\s*\/?\s*(?:F|FI|FIN?)?\s*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function stripSchemaFromText(text: string): string {
  const t = stripFinishMarker(text || "");
  const { spec, html } = extractSchemaBlocks(t);
  let out = t;

  if (html) out = out.split(html).join("");
  if (spec) out = out.split(spec).join("");

  const FENCE_RE = /(`{3,}|'{3,})[ \t]*([a-zA-Z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)(?:\1|$)/g;
  out = out.replace(FENCE_RE, (whole: string, _fence: string, lang: string, body: string) => {
    let l = (lang || "").toLowerCase();
    if (!l) {
      const w = ((body || "").match(/^[ \t]*([a-zA-Z0-9_-]+)[ \t]*\r?\n/) || [])[1];
      if (w) l = w.toLowerCase();
    }
    if (SCHEMA_LANGS.includes(l)) return "";
    const bodyClean = (body || "").replace(/^[ \t]*(?:html|svg|json|xml)[ \t]*$/gim, "");
    if (/<(?:svg|canvas)\b/i.test(bodyClean)) return "";
    return whole;
  });

  out = out.replace(/^[ \t]*(?:html|svg|json|javascript|js|xml)[ \t]*$/gim, "");
  out = out.replace(/^[ \t]*copy[ \t]*$/gim, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function compactText(text: string, max = 280): string {
  const clean = stripSchemaFromText(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}

export function compressHistory(
  history: { role: "user" | "assistant"; content: string }[]
): { role: "user" | "assistant"; content: string }[] {
  const cleaned = history
    .filter((h) => h.role === "user" || h.role === "assistant")
    .map((h) => ({
      role: h.role,
      content: h.role === "assistant" ? compactText(h.content, 900) : compactText(h.content, 500),
    }))
    .filter((h) => h.content.length > 0);

  let result: { role: "user" | "assistant"; content: string }[];
  if (cleaned.length <= 6) {
    result = cleaned;
  } else {
    const dropped = cleaned.slice(0, cleaned.length - 4);
    const recent = cleaned.slice(-4);
    const lines = dropped.map((d) => `${d.role === "user" ? "Eleve" : "Prof"}: ${compactText(d.content, 140)}`);
    result = [
      {
        role: "assistant",
        content: `[resume des echanges precedents] ${lines.join(" ; ").slice(0, 800)}`,
      },
      ...recent,
    ];
  }
  // Beaucoup d'API exigent un historique qui commence par un message "user".
  while (result.length && result[0].role !== "user") result.shift();
  return result;
}
