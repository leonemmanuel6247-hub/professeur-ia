import {
  ChatOptions,
  ChatResult,
  LlmContentPart,
  LlmMessage,
  LlmProvider,
  ProviderError,
  estimateTokens,
} from "./types";
import { Platform } from "react-native";

const API_REVISION = "2026-05-20";

type InteractionContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "document"; data: string; mime_type: string };

function toInputContent(content: LlmMessage["content"]): InteractionContent[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  const out: InteractionContent[] = [];
  for (const p of content as LlmContentPart[]) {
    if (p.type === "text") out.push({ type: "text", text: p.text });
    else if (p.type === "image_url") {
      const url = p.image_url.url;
      const m = url.match(/^data:([^;]+);base64,(.+)$/);
      if (m) out.push({ type: "image", data: m[2], mime_type: m[1] });
      else out.push({ type: "text", text: `[image] ${url}` });
    } else if (p.mimeType === "application/pdf") {
      out.push({ type: "document", data: p.dataBase64, mime_type: "application/pdf" });
    } else {
      out.push({ type: "image", data: p.dataBase64, mime_type: p.mimeType });
    }
  }
  return out;
}

interface InteractionStep {
  type?: string;
  content?: { type?: string; text?: string }[];
}

interface InteractionResponse {
  id?: string;
  status?: string;
  steps?: InteractionStep[];
  output_text?: string;
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
  errors?: { code?: string; message?: string }[];
}

function extractText(resp: InteractionResponse): string {
  if (typeof resp.output_text === "string" && resp.output_text) return resp.output_text;
  const parts: string[] = [];
  for (const step of resp.steps || []) {
    if (step.type && step.type !== "model_output") continue;
    for (const c of step.content || []) {
      if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  if (!parts.length) {
    for (const step of resp.steps || []) {
      for (const c of step.content || []) {
        if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
      }
    }
  }
  return parts.join("");
}

export class GeminiProvider implements LlmProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    public supportsVision: boolean,
    public supportsNativePdf: boolean,
    public maxContext: number
  ) {}

  async chat(messages: LlmMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const system = messages.filter((m) => m.role === "system");
    const rest = messages.filter((m) => m.role !== "system");
    const systemText = system
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join("\n");

    const root = this.baseUrl.replace(/\/$/, "");
    const url = /\/interactions$/.test(root)
      ? root
      : `${root.replace(/\/models\/.*$/, "")}/interactions`;

    const GEMINI_TIMEOUT_MS = 120_000;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, GEMINI_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    if (options.abortSignal) {
      if (options.abortSignal.aborted) controller.abort();
      else options.abortSignal.addEventListener("abort", onAbort);
    }
    const cleanup = () => {
      clearTimeout(timer);
      options.abortSignal?.removeEventListener("abort", onAbort);
    };

    const input: InteractionContent[] = [];
    for (const m of rest) {
      const blocks = toInputContent(m.content);
      if (m.role === "assistant") {
        for (const b of blocks) {
          if (b.type === "text") input.push({ type: "text", text: `[reponse precedente]\n${b.text}` });
        }
      } else {
        input.push(...blocks);
      }
    }

    const model = this.model.replace(/^models\//, "");

    const body = {
      model,
      input,
      system_instruction: systemText || undefined,
      generation_config: {
        temperature: options.temperature ?? 0.3,
        max_output_tokens: options.maxTokens,
      },
      store: false,
    };

    let res: Response;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      };
      if (Platform.OS !== "web") headers["Api-Revision"] = API_REVISION;
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      cleanup();
      if (timedOut) {
        throw new ProviderError(
          "Gemini n'a pas repondu dans les 2 minutes. Reessaie ou reduis la taille du document.",
          0,
          true
        );
      }
      if (options.abortSignal?.aborted) throw new ProviderError("Generation arretee", 0, false);
      const msg = e instanceof Error ? e.message : "reseau";
      throw new ProviderError(`Reseau indisponible : ${msg}`, 0, true);
    }

    cleanup();

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(humanError(res.status, errText), res.status, retryable);
    }

    const json = (await res.json().catch(() => null)) as InteractionResponse | null;
    if (!json) {
      throw new ProviderError("Reponse Gemini illisible.", 0, true);
    }
    if (json.status === "failed") {
      const msg = json.errors?.map((x) => x.message).filter(Boolean).join("; ") || "echec Gemini";
      throw new ProviderError(`Gemini a echoue : ${msg}`, 400, false);
    }

    const text = extractText(json);
    options.onToken?.(text);

    return {
      text,
      promptTokens: json.usage?.total_input_tokens ?? estimateTokens(JSON.stringify(messages)),
      completionTokens: json.usage?.total_output_tokens ?? estimateTokens(text),
    };
  }
}

function humanError(status: number, body: string): string {
  if (status === 400 && /API_KEY/i.test(body)) return "Cle Gemini invalide.";
  if (status === 401 || status === 403) return "Cle Gemini refusee. Verifie x-goog-api-key.";
  if (status === 404) return "Modele Gemini introuvable. Verifie le nom du modele.";
  if (status === 429) return "Quota Gemini depasse (429). Rotation vers une autre cle.";
  if (status >= 500) return `Gemini indisponible (${status}).`;
  const short = body.replace(/\s+/g, " ").slice(0, 180);
  return `Erreur Gemini ${status}${short ? ` : ${short}` : ""}`;
}