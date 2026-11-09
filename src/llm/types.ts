export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmContentPart[];
}

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; mimeType: string; dataBase64: string; fileName?: string };

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onToken?: (chunk: string) => void;
}

export interface ChatResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LlmProvider {
  chat(messages: LlmMessage[], options?: ChatOptions): Promise<ChatResult>;
  supportsVision: boolean;
  supportsNativePdf: boolean;
  maxContext: number;
}

export class ProviderError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
