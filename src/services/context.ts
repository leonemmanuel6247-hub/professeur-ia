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
    const msgs: LlmMessage[] = [
      { role: "system", content: fill(passages) + "\n" + bonus + "\n" + schemaRule + (opts.extraInstruction ? `\n${opts.extraInstruction}` : "") },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: opts.userText },
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

export function extractSchemaBlocks(text: string): { spec: string | null; html: string | null } {
  const json = text.match(/```json\s*([\s\S]*?)```/i);
  const html = text.match(/```html\s*([\s\S]*?)```/i);
  let spec = json ? json[1].trim() : null;
  if (!spec) {
    const bare = text.match(/\{\s*"titre"[\s\S]*?"objets"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
    if (bare) spec = bare[0].trim();
  }
  return {
    spec,
    html: html ? html[1].trim() : null,
  };
}

export function stripSchemaFromText(text: string): string {
  let t = text || "";
  t = t.replace(/```json\s*[\s\S]*?```/gi, "");
  t = t.replace(/```html\s*[\s\S]*?```/gi, "");
  t = t.replace(/```[a-z]*\s*[\s\S]*?```/gi, (block) => {
    const inner = block.replace(/^```[a-z]*/i, "").replace(/```$/, "").trim();
    if (/^\{[\s\S]*"objets"\s*:/.test(inner) || /"titre"\s*:[\s\S]*"objets"\s*:/.test(inner)) {
      return "";
    }
    return block;
  });
  t = t.replace(/\{[\s\S]*?"objets"\s*:\s*\[[\s\S]*?\]\s*,[\s\S]*?\}\s*\}?/g, (m) => {
    const trimmed = m.trim();
    if (/"titre"\s*:/.test(trimmed) || /"objets"\s*:/.test(trimmed)) return "";
    return m;
  });
  t = t.replace(/\{\s*"titre"[\s\S]*?"objets"[\s\S]*?\}\s*\}?/g, "").trim();
  return t.trim();
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

  if (cleaned.length <= 6) return cleaned;
  const dropped = cleaned.slice(0, cleaned.length - 4);
  const recent = cleaned.slice(-4);
  const lines = dropped.map((d) => `${d.role === "user" ? "Eleve" : "Prof"}: ${compactText(d.content, 140)}`);
  return [
    {
      role: "assistant",
      content: `[resume des echanges precedents] ${lines.join(" ; ").slice(0, 800)}`,
    },
    ...recent,
  ];
}
