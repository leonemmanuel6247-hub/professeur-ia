import {
  ChatOptions,
  ChatResult,
  LlmMessage,
  LlmProvider,
  ProviderError,
  estimateTokens,
} from "./types";

function partsToOpenAi(content: LlmMessage["content"], supportsNativePdf: boolean) {
  if (typeof content === "string") return content;
  return content.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if (p.type === "image_url") return { type: "image_url", image_url: p.image_url };
    const dataUrl = `data:${p.mimeType};base64,${p.dataBase64}`;
    if (supportsNativePdf) {
      return {
        type: "file",
        file: { filename: p.fileName ?? "document.pdf", file_data: dataUrl },
      };
    }
    return { type: "image_url", image_url: { url: dataUrl } };
  });
}

export class OpenAICompatProvider implements LlmProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    public supportsVision: boolean,
    public supportsNativePdf: boolean,
    public maxContext: number
  ) {}

  async chat(messages: LlmMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model: this.model,
      stream: true,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens,
      messages: messages.map((m) => ({
        role: m.role,
        content: partsToOpenAi(m.content, this.supportsNativePdf),
      })),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "reseau";
      if (options.abortSignal?.aborted) throw new ProviderError("Generation arretee", 0, false);
      throw new ProviderError(`Reseau indisponible : ${msg}`, 0, true);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(humanError(res.status, errText), res.status, retryable);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const raw = await res.text().catch(() => "");
      const parsed = parseOpenAiBody(raw);
      if (!parsed) throw new ProviderError("Reponse fournisseur illisible.", 0, true);
      options.onToken?.(parsed.text);
      return {
        text: parsed.text,
        promptTokens: parsed.promptTokens || estimateTokens(JSON.stringify(messages)),
        completionTokens: parsed.completionTokens || estimateTokens(parsed.text),
      };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const piece = json.choices?.[0]?.delta?.content ?? "";
          if (piece) {
            text += piece;
            options.onToken?.(piece);
          }
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens ?? promptTokens;
            completionTokens = json.usage.completion_tokens ?? completionTokens;
          }
        } catch {
          /* ignore malformed sse */
        }
      }
    }

    return {
      text,
      promptTokens: promptTokens || estimateTokens(JSON.stringify(messages)),
      completionTokens: completionTokens || estimateTokens(text),
    };
  }
}

function parseOpenAiBody(raw: string): { text: string; promptTokens: number; completionTokens: number } | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("data:") && !trimmed.startsWith("event:")) {
    try {
      const json = JSON.parse(trimmed) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: json.choices?.[0]?.message?.content ?? "",
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      };
    } catch {
      return null;
    }
  }
  let text = "";
  let promptTokens = 0;
  let completionTokens = 0;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data) as {
        choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const piece = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (piece) text += piece;
      if (json.usage) {
        promptTokens = json.usage.prompt_tokens ?? promptTokens;
        completionTokens = json.usage.completion_tokens ?? completionTokens;
      }
    } catch {
      /* skip malformed */
    }
  }
  return text || promptTokens || completionTokens ? { text, promptTokens, completionTokens } : null;
}

function humanError(status: number, body: string): string {
  if (status === 401) return "Cle API invalide. Verifie la cle dans Profils IA.";
  if (status === 403) return "Acces refuse par le fournisseur (403).";
  if (status === 429) return "Quota depasse (429). Rotation vers une autre cle.";
  if (status >= 500) return `Fournisseur indisponible (${status}).`;
  const short = body.replace(/\s+/g, " ").slice(0, 180);
  return `Erreur fournisseur ${status}${short ? ` : ${short}` : ""}`;
}
