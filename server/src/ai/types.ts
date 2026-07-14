import type { z } from "zod";

/** Every distinct LLM call site in the app. One entry per claude.ts export today, plus the two identify call sites in identify/llmFallback.ts. */
export type Workload =
  | "identify_image"
  | "identify_screen"
  | "identify_url"
  | "report"
  | "insight_long_term"
  | "insight_version"
  | "insight_scam"
  | "insight_best_in_category";

/** Provider-agnostic mirror of Anthropic.Tool / Bedrock Converse toolConfig - name + description + JSON schema. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type LLMContentPart =
  | { type: "text"; text: string }
  | {
      type: "image";
      mediaType: ImageMediaType;
      /** Raw base64, no data: prefix. */
      data: string;
    };

/** Provider-agnostic mirror of Anthropic.MessageParam. content is a plain string for text-only turns, or parts for image+text. */
export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMContentPart[];
}

export interface LLMToolCallRequest<T> {
  workload: Workload;
  schema: z.ZodType<T>;
  tool: ToolSpec;
  messages: LLMMessage[];
  system?: string;
  maxTokens: number;
  maxAttempts?: number;
  /** Applied to the raw tool input before coercion/validation, e.g. to fill in optional-field defaults. */
  normalize?: (raw: unknown) => unknown;
  /**
   * Post-validation quality gate. Called with the schema-valid result; return
   * a corrective instruction string to spend one more attempt asking the
   * model to reconsider (e.g. "you weren't confident but strong evidence X/Y
   * is present"), or null/undefined to accept the result as-is. Never fires
   * on the final attempt - a schema-valid result is always returned rather
   * than thrown away.
   */
  retryHint?: (data: T) => string | null | undefined;
}

export interface LLMCallMeta {
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  attempts: number;
}

export interface LLMResult<T> {
  data: T;
  meta: LLMCallMeta;
}

export interface LLMProvider {
  readonly name: string;
  supports(workload: Workload): boolean;
  callTool<T>(req: LLMToolCallRequest<T>): Promise<LLMResult<T>>;
}
