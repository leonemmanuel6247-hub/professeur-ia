import { getDb } from "../db/database";
import { AppSettings } from "../types";
import { DEFAULT_PROMPTS } from "../prompts/defaults";

const DEFAULTS: AppSettings = {
  theme: "system",
  fontScale: 1,
  horsCoursEnabled: true,
  prompts: { ...DEFAULT_PROMPTS },
  defaultProviderId: "",
  documentsProviderId: "",
  schemasProviderId: "",
};

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const prompts = { ...DEFAULT_PROMPTS };
  try {
    if (map.prompts) Object.assign(prompts, JSON.parse(map.prompts));
  } catch {
    /* keep defaults */
  }
  return {
    theme: (map.theme as AppSettings["theme"]) || DEFAULTS.theme,
    fontScale: map.fontScale ? Number(map.fontScale) : 1,
    horsCoursEnabled: map.horsCoursEnabled !== "0",
    prompts,
    defaultProviderId: map.defaultProviderId || "",
    documentsProviderId: map.documentsProviderId || "",
    schemasProviderId: map.schemasProviderId || "",
  };
}

export async function saveSetting(key: string, value: string) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export async function saveSettings(s: AppSettings) {
  await saveSetting("theme", s.theme);
  await saveSetting("fontScale", String(s.fontScale));
  await saveSetting("horsCoursEnabled", s.horsCoursEnabled ? "1" : "0");
  await saveSetting("prompts", JSON.stringify(s.prompts));
  await saveSetting("defaultProviderId", s.defaultProviderId);
  await saveSetting("documentsProviderId", s.documentsProviderId);
  await saveSetting("schemasProviderId", s.schemasProviderId);
}

export { DEFAULTS as DEFAULT_SETTINGS };
