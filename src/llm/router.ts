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

const FINISH_RE = /<\s*\/?\s*FIN\s*>/i;
const MAX_CONTINUATIONS = 20;

function stripFinish(text: string): string {
  return text.replace(/[ \t]*<\s*\/?\s*FIN\s*>[ \t]*/gi, "").replace(/[ \t]*<\s*\/?\s*(?:F|FI|FIN?)?\s*$/i, "");
}

/**
 * Appelle l'IA et REJOUE tant que la balise de fin <FIN> n'est pas presente.
 * Certains chatbots-API ferment le flux pendant une pause de reflexion : le
 * texte s'arrete alors en plein milieu. On relance en demandant la suite tant
 * que le marqueur n'apparait pas, pour ne jamais considerer une pause comme
 * une fin. Le texte accumule est renvoye au token pres via onToken.
 */
export async function chatUntilFinished(
  profiles: AiProfile[],
  messages: LlmMessage[],
  options: ChatOptions = {}
): Promise<ChatResult & { profileId: string }> {
  const baseMessages = [...messages];
  let acc = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let profileId = "";

  for (let round = 0; round < MAX_CONTINUATIONS; round++) {
    const history: LlmMessage[] = acc
      ? [
          ...baseMessages,
          { role: "assistant", content: acc },
          {
            role: "user",
            content:
              "Continue EXACTEMENT la ou tu t'es arrete, sans rien repeter et sans recommencer. " +
              "Rappel : tu ne dois ecrire la balise de fin <FIN> que lorsque toute ta reponse est totalement terminee.",
          },
        ]
      : baseMessages;

    const res = await chatWithFallback(profiles, history, options);
    profileId = profileId || res.profileId;
    promptTokens += res.promptTokens;
    completionTokens += res.completionTokens;

    const piece = stripFinish(res.text);
    if (piece.trim()) {
      acc = acc ? acc + piece : stripFinish(res.text);
    }
    // On teste la balise sur le texte BRUT de ce tour (sinon elle est deja
    // retiree) : c'est elle qui signale une vraie fin, pas la fermeture du flux.
    const finished = FINISH_RE.test(res.text);

    if (finished) {
      return { text: stripFinish(acc).trim(), promptTokens, completionTokens, profileId };
    }
    if (!piece.trim()) {
      // Le fournisseur n'a rien renvoye de plus : inutile de relancer encore.
      break;
    }
  }
  return { text: stripFinish(acc).trim(), promptTokens, completionTokens, profileId };
}
