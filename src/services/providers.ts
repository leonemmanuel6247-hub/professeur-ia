import { getDb, uid } from "../db/database";
import { AiProfile, ProviderRole, ProviderType } from "../types";
import { deleteApiKey } from "./keys";

function rowToProfile(r: Record<string, unknown>): AiProfile {
  return {
    id: String(r.id),
    name: String(r.name),
    type: r.type as ProviderType,
    baseUrl: String(r.base_url),
    model: String(r.model),
    supportsVision: Boolean(r.supports_vision),
    supportsNativePdf: Boolean(r.supports_native_pdf),
    maxContext: Number(r.max_context),
    role: r.role as ProviderRole,
    order: Number(r.sort_order),
    tokensToday: Number(r.tokens_today),
    tokensDay: String(r.tokens_day),
  };
}

export async function listProfiles(): Promise<AiProfile[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM providers ORDER BY sort_order ASC, name ASC"
  );
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const p = rowToProfile(r);
    if (p.tokensDay !== today) {
      p.tokensToday = 0;
      p.tokensDay = today;
    }
    return p;
  });
}

export async function upsertProfile(p: AiProfile) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO providers (id, name, type, base_url, model, supports_vision, supports_native_pdf, max_context, role, sort_order, tokens_today, tokens_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, type=excluded.type, base_url=excluded.base_url, model=excluded.model,
       supports_vision=excluded.supports_vision, supports_native_pdf=excluded.supports_native_pdf,
       max_context=excluded.max_context, role=excluded.role, sort_order=excluded.sort_order`,
    [
      p.id,
      p.name,
      p.type,
      p.baseUrl,
      p.model,
      p.supportsVision ? 1 : 0,
      p.supportsNativePdf ? 1 : 0,
      p.maxContext,
      p.role,
      p.order,
      p.tokensToday,
      p.tokensDay,
    ]
  );
}

export async function createProfile(partial: Partial<AiProfile>): Promise<AiProfile> {
  const p: AiProfile = {
    id: await uid("prv"),
    name: partial.name || "Nouveau profil",
    type: partial.type || "openai",
    baseUrl: partial.baseUrl !== undefined ? partial.baseUrl : defaultBase(partial.type || "openai"),
    model: partial.model !== undefined ? partial.model : partial.type === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini",
    supportsVision: partial.supportsVision ?? true,
    supportsNativePdf: partial.supportsNativePdf ?? partial.type === "gemini",
    maxContext: partial.maxContext ?? 128000,
    role: partial.role || "default",
    order: partial.order ?? 0,
    tokensToday: 0,
    tokensDay: new Date().toISOString().slice(0, 10),
  };
  await upsertProfile(p);
  return p;
}

export function defaultBase(type: ProviderType): string {
  return type === "gemini"
    ? "https://generativelanguage.googleapis.com/v1beta"
    : "https://api.openai.com/v1";
}

export const PRESETS: { label: string; type: ProviderType; baseUrl: string; model: string }[] = [
  { label: "OpenAI", type: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", type: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { label: "Groq", type: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "NVIDIA NIM", type: "openai", baseUrl: "https://integrate.api.nvidia.com/v1", model: "meta/llama-3.1-70b-instruct" },
  { label: "Gemini", type: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash" },
];

export async function deleteProfile(id: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM providers WHERE id = ?", [id]);
  await deleteApiKey(id);
}

export async function addTokens(profileId: string, n: number) {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.getFirstAsync<{ tokens_today: number; tokens_day: string }>(
    "SELECT tokens_today, tokens_day FROM providers WHERE id = ?",
    [profileId]
  );
  const current = row && row.tokens_day === today ? row.tokens_today : 0;
  await db.runAsync("UPDATE providers SET tokens_today = ?, tokens_day = ? WHERE id = ?", [
    current + n,
    today,
    profileId,
  ]);
}

export function orderedForRole(all: AiProfile[], role: ProviderRole, fallbackId: string): AiProfile[] {
  const preferred = all.filter((p) => p.role === role || p.id === fallbackId);
  const rest = all.filter((p) => !preferred.includes(p));
  const first = preferred.sort((a, b) => a.order - b.order);
  return [...first, ...rest.sort((a, b) => a.order - b.order)];
}
