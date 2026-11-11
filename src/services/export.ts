import { Course, CoursePlanSection } from "../types";
import { listLessons, parseIdentity, parsePlan } from "./courses";
import { saveAndShare } from "./files";

export async function exportCourseMarkdown(course: Course): Promise<string> {
  const identity = parseIdentity(course.identityJson);
  const plan = parsePlan(course.planJson);
  const lessons = await listLessons(course.id);
  const lines: string[] = [];
  lines.push(`# ${course.title}`);
  lines.push("");
  lines.push(`Matiere : ${course.subject} — Niveau : ${course.level}`);
  lines.push("");
  lines.push("## Fiche d'identite");
  lines.push(identity.summary);
  lines.push("");
  lines.push("### Notations");
  identity.notations.forEach((n) => lines.push(`- ${n}`));
  lines.push("");
  lines.push("### Definitions");
  identity.definitions.forEach((n) => lines.push(`- ${n}`));
  lines.push("");
  lines.push("## Plan");
  const walk = (s: CoursePlanSection, depth: number) => {
    lines.push(`${"#".repeat(Math.min(depth + 3, 6))} ${s.title} (p.${s.pageStart}–${s.pageEnd})`);
    s.children?.forEach((c) => walk(c, depth + 1));
  };
  plan.forEach((s) => walk(s, 0));
  lines.push("");
  for (const l of lessons) {
    lines.push(`---\n\n${l.content}\n`);
  }
  const md = lines.join("\n");
  return saveAndShare(`${safeName(course.title)}.md`, md, "text/markdown");
}

function safeName(s: string) {
  return s.replace(/[^\wÀ-ÿ-]+/g, "_").slice(0, 60) || "cours";
}
