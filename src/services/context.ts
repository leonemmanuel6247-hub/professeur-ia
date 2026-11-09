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

  let history = [...opts.history];
  const replyBudget = Math.min(4096, Math.floor(opts.maxContext * 0.25));
  const systemBase = fill(passages) + "\n" + bonus + (opts.extraInstruction ? `\n${opts.extraInstruction}` : "");

  const pack = () => {
    const msgs: LlmMessage[] = [
      { role: "system", content: fill(passages) + "\n" + bonus + (opts.extraInstruction ? `\n${opts.extraInstruction}` : "") },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: opts.userText },
    ];
    const tokens = msgs.reduce((s, m) => s + estimateTokens(typeof m.content === "string" ? m.content : ""), 0);
    return { msgs, tokens };
  };

  let packed = pack();

  while (packed.tokens + replyBudget > opts.maxContext && history.length > 2) {
    const keepRecent = 4;
    if (history.length <= keepRecent) break;
    const dropped = history.slice(0, history.length - keepRecent);
    const recent = history.slice(-keepRecent);
    const prevSummary = dropped.find((d) => d.role === "assistant" && d.content.startsWith("[resume"));
    const body = prevSummary
      ? prevSummary.content.replace(/^\[resume[^\]]*\]\s*/, "")
      : "";
    const lines = dropped
      .filter((d) => d !== prevSummary)
      .map((d) => `${d.role === "user" ? "Eleve" : "Prof"}: ${d.content.replace(/\s+/g, " ").slice(0, 160)}`);
    const merged = [...(body ? [body] : []), ...lines].join(" ; ");
    history = [
      {
        role: "assistant",
        content: `[resume des echanges precedents] ${merged.slice(0, 900)}`,
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
  return {
    spec: json ? json[1].trim() : null,
    html: html ? html[1].trim() : null,
  };
}
