import { uid } from "../db/database";
import { MasteryRow } from "../types";
import { listMastery, upsertMastery } from "./courses";

const ALPHA = 0.3;
const FACTOR = 2.5;

export async function recordResult(courseId: string, notion: string, success: boolean) {
  const all = await listMastery(courseId);
  let row = all.find((m) => m.notion === notion);
  const r = success ? 1 : 0;
  if (!row) {
    row = {
      id: await uid("mst"),
      courseId,
      notion,
      score: 0,
      nextReview: Date.now(),
      intervalDays: 1,
    };
  }
  row.score = row.score + ALPHA * (r - row.score);
  if (success) {
    row.intervalDays = Math.max(1, row.intervalDays * FACTOR);
  } else {
    row.intervalDays = 1;
  }
  row.nextReview = Date.now() + row.intervalDays * 24 * 3600 * 1000;
  await upsertMastery(row);
  return row;
}

export function dueToday(rows: MasteryRow[]): MasteryRow[] {
  const now = Date.now();
  return rows.filter((m) => m.nextReview <= now).sort((a, b) => a.score - b.score);
}

export function fragile(rows: MasteryRow[]): MasteryRow[] {
  return [...rows].sort((a, b) => a.score - b.score).slice(0, 8);
}
