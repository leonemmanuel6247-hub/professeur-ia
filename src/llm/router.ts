import { AiProfile } from "../types";
import { getApiKey } from "../services/keys";
import { GeminiProvider } from "./gemini";
import { OpenAICompatProvider } from "./openai";
import { ChatOptions, ChatResult, LlmMessage, LlmProvider, ProviderError } from "./types";
import { addTokens } from "../services/providers";

function isLocalOpenAi(profile: AiProfile): boolean {
  const u = (profile.baseUrl || "").toLowerCase();
  return (
    profile.type === "openai" &&
    (/^https?:\/\/(127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?/i.test(u) ||
      /8090/.test(u) ||
      /nemapi/i.test(profile.name))
  );
}

export async function buildProvider(profile: AiProfile): Promise<LlmProvider> {
  const stored = await getApiKey(profile.id);
  const key = stored || (isLocalOpenAi(profile) ? "nem" : "");
  if (!key) {
    throw new ProviderError("Aucune cle API pour ce profil. Ajoute-la dans Profils IA.", 401);
  }
  if (!profile.model.trim()) {
    throw new ProviderError("Nom du modele manquant. Renseigne-le dans Profils IA.", 400);
  }
  if (profile.type === "gemini") {
    return new GeminiProvider(
      profile.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
      key,
      profile.model,
      profile.supportsVision,
      profile.supportsNativePdf,
      profile.maxContext
    );
  }
  if (!profile.baseUrl.trim()) {
    throw new ProviderError(
      "URL de base manquante. Exemple : https://mon-api.exemple.com/v1",
      400
    );
  }
  return new OpenAICompatProvider(
    profile.baseUrl,
    key,
    profile.model,
    profile.supportsVision,
    profile.supportsNativePdf,
    profile.maxContext
  );
}

export async function chatWithFallback(
  profiles: AiProfile[],
  messages: LlmMessage[],
  options: ChatOptions = {}
): Promise<ChatResult & { profileId: string }> {
  if (!profiles.length) {
    throw new ProviderError("Aucun profil IA configure. Va dans Profils IA.", 0);
  }
  let last: Error | null = null;
  for (const profile of profiles) {
    try {
      const provider = await buildProvider(profile);
      const result = await provider.chat(messages, options);
      await addTokens(profile.id, result.promptTokens + result.completionTokens);
      return { ...result, profileId: profile.id };
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      const retryable = e instanceof ProviderError && e.retryable;
      if (!retryable && e instanceof ProviderError && e.status !== 429 && e.status < 500) {
        if (profiles.length === 1) throw e;
      }
    }
  }
  throw last ?? new ProviderError("Tous les fournisseurs ont echoue.", 0, true);
}
