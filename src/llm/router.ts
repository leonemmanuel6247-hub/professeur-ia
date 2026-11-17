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

export const FINISH_RE = /<\s*\/?\s*FIN\s*>/i;
// Attente entre deux tentatives quand la reponse est vide ou que l'API transitoire
// echoue (pause du chatbot, reseau, 429, 5xx). Croissante mais plafonnee : la
// generation N'EST JAMAIS ABANDONNEE — seule la balise <FIN> (ou le bouton Stop)
// termine la boucle.
const RETRY_DELAY_BASE_MS = 2000;
const RETRY_DELAY_MAX_MS = 10000;

/**
 * Consigne ajoutee aux prompts : la reponse ne se termine que par le marqueur
 * <FIN>, ecrit uniquement quand tout le contenu est vraiment produit.
 */
export const FINISH_INSTRUCTION =
  "FIN DE REPONSE : quand ta reponse est VRAIMENT terminee, ecris le marqueur <FIN> seul sur la toute derniere ligne, apres tout le reste. N'ecris ce marqueur QUE lorsque tu as fini, jamais avant.";

function stripFinish(text: string): string {
  return (text || "")
    .replace(/[ \t]*<\s*\/?\s*FIN\s*>[ \t]*/gi, "")
    .replace(/[ \t]*<\s*\/?\s*(?:FIN?|FI|F)\s*$/i, "");
}

/**
 * Appelle l'IA et ATTEND la reponse eperdument : la boucle ne s'arrete QUE
 * lorsque la balise de fin <FIN> est recue (ou sur le bouton Stop).
 * - Reponse incomplete / vide / pause du chatbot : on REJOUE en demandant la
 *   suite, sans limite de tours.
 * - Erreur transitoire (reseau, corps vide, 429, 5xx) : on ATTEND puis on
 *   retente, sans limite — la mission est d'attendre, pas d'abandonner.
 * - Erreur de configuration (cle invalide, modele introuvable : 4xx sauf 429) :
 *   remontee immediate pour que l'utilisateur le voie.
 * Les morceaux sont streamés a l'ecran au fil des tours via options.onToken,
 * et le texte final est rendu sans le marqueur.
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
  let failures = 0; // reponses vides / erreurs transitoires consecutives

  // Boucle infinie volontaire : seule la balise <FIN> (ou le Stop) en sort.
  while (true) {
    // Le bouton Stop est verifie a CHAQUE tour, meme entre deux appels reseau :
    // l'utilisateur garde la main a tout instant.
    if (options.abortSignal?.aborted) throw new ProviderError("Generation arretee", 0, false);
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

    let res: (ChatResult & { profileId: string }) | null = null;
    try {
      res = await chatWithFallback(profiles, history, options);
    } catch (e) {
      if (options.abortSignal?.aborted) throw e;
      if (e instanceof ProviderError && e.status >= 400 && e.status !== 429) throw e;
      // Erreur transitoire (reseau, corps vide, "illisible", 429, 5xx) : ce
      // n'est PAS une fin de reponse. On attend et on retente, indefiniment.
      failures += 1;
    }

    if (!res) {
      await retryDelay(failures, options.abortSignal);
      continue;
    }

    profileId = profileId || res.profileId;
    promptTokens += res.promptTokens;
    completionTokens += res.completionTokens;

    // On teste la balise sur le texte BRUT de ce tour (sinon elle est deja
    // retiree) : c'est elle — et elle seule — qui signale une vraie fin, pas
    // la fermeture du flux ni une reponse vide.
    const finished = FINISH_RE.test(res.text);
    const piece = stripFinish(res.text);
    if (piece.trim()) {
      failures = 0;
      acc += piece;
      if (finished) {
        return { text: acc.trim(), promptTokens, completionTokens, profileId };
      }
    } else if (finished) {
      return { text: acc.trim(), promptTokens, completionTokens, profileId };
    } else {
      // Reponse vide sans balise (pause du chatbot, flux ferme sans contenu) :
      // ce n'est pas une fin — on attend puis on rejoue, indefiniment.
      failures += 1;
      await retryDelay(failures, options.abortSignal);
    }
  }
}

async function retryDelay(failures: number, abortSignal?: AbortSignal): Promise<void> {
  const ms = Math.min(RETRY_DELAY_BASE_MS * Math.max(1, failures), RETRY_DELAY_MAX_MS);
  await new Promise((r) => setTimeout(r, ms));
  if (abortSignal?.aborted) throw new ProviderError("Generation arretee", 0, false);
}
