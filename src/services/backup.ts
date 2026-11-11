import { getDb, isFtsAvailable } from "../db/database";
import { listProfiles } from "./providers";
import { saveAndShare } from "./files";

export async function exportBackup(): Promise<string> {
  const db = await getDb();
  const tables = [
    "providers",
    "courses",
    "pages",
    "chunks",
    "lessons",
    "conversations",
    "messages",
    "exercises",
    "mastery",
    "experiences",
    "settings",
  ];
  const data: Record<string, unknown[]> = {};
  for (const t of tables) {
    data[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  }
  const json = JSON.stringify({ version: 1, exportedAt: Date.now(), data }, null, 2);
  return saveAndShare("professeur-ia-sauvegarde.json", json, "application/json");
}

export async function shareBackup() {
  return exportBackup();
}

export async function restoreBackup(jsonText: string) {
  const parsed = JSON.parse(jsonText) as { data: Record<string, Record<string, unknown>[]>; version: number };
  const db = await getDb();
  const order = [
    "providers",
    "courses",
    "pages",
    "chunks",
    "lessons",
    "conversations",
    "messages",
    "exercises",
    "mastery",
    "experiences",
    "settings",
  ];
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  for (const t of [...order].reverse()) {
    await db.execAsync(`DELETE FROM ${t}`);
  }
  for (const t of order) {
    const rows = parsed.data[t] || [];
    for (const row of rows) {
      const keys = Object.keys(row);
      const placeholders = keys.map(() => "?").join(",");
      await db.runAsync(
        `INSERT INTO ${t} (${keys.join(",")}) VALUES (${placeholders})`,
        keys.map((k) => row[k] as string | number)
      );
    }
  }
  await db.execAsync("PRAGMA foreign_keys = ON;");
  if (isFtsAvailable()) {
    try {
      await db.execAsync("DELETE FROM chunks_fts");
      const chunks = parsed.data.chunks || [];
      for (const c of chunks) {
        await db.runAsync("INSERT INTO chunks_fts (text, chunk_id, course_id) VALUES (?, ?, ?)", [
          String(c.text ?? ""),
          String(c.id ?? ""),
          String(c.course_id ?? ""),
        ]);
      }
    } catch {
      /* fts optional */
    }
  }
}

export async function exportErrorLogText(lines: { createdAt: number; message: string }[]): Promise<string> {
  const profiles = await listProfiles();
  const header = `Professeur IA — journal d'erreurs\n${new Date().toISOString()}\nProfils (sans cles) : ${profiles
    .map((p) => `${p.name}/${p.model}`)
    .join(", ")}\n\n`;
  const body = lines
    .map((l) => `${new Date(l.createdAt).toISOString()}  ${l.message.replace(/sk-[A-Za-z0-9._-]+/g, "sk-****")}`)
    .join("\n");
  return saveAndShare("professeur-ia-erreurs.txt", header + body, "text/plain");
}
