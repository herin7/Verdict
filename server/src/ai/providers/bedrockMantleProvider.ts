import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { z } from "zod";
import { config } from "../../config.js";
import { coerceToSchema } from "../../coerce.js";
import { clampMaxTokens, estimateCost } from "./bedrockShared.js";
import type {
  ImageMediaType,
  LLMContentPart,
  LLMMessage,
  LLMProvider,
  LLMResult,
  LLMToolCallRequest,
  ToolSpec,
  Workload,
} from "../types.js";

/**
 * Bedrock Mantle: AWS's OpenAI-Chat-Completions-compatible endpoint for
 * Bedrock models (https://bedrock-mantle.{region}.api.aws/v1), authenticated
 * with a plain bearer API key generated in the Bedrock console - no AWS
 * SDK/SigV4/IAM credentials involved, unlike bedrockProvider.ts's Converse
 * API path. AWS's own docs recommend using Mantle over Converse "whenever
 * possible". Model id is supplied entirely via BEDROCK_MODEL_MAP env (same
 * map bedrockProvider.ts reads) - nothing GLM-specific is hardcoded here, so
 * pointing this provider at a different Mantle-supported model id is a
 * config change.
 *
 * Mantle supports client-side tool calling (the model returns tool_calls,
 * the caller executes and replies) but not server-side tool calling
 * (AWS-hosted built-in tools) - irrelevant here since this app always
 * executes its own tools locally, which is exactly the client-side shape.
 */

let client: OpenAI | undefined;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.bedrockMantleApiKey, baseURL: config.bedrockMantleBaseUrl });
  }
  return client;
}

function imageDataUrl(mediaType: ImageMediaType, data: string): string {
  return `data:${mediaType};base64,${data}`;
}

function toMantleContentPart(part: LLMContentPart): OpenAI.Chat.Completions.ChatCompletionContentPart {
  if (part.type === "text") return { type: "text", text: part.text };
  return { type: "image_url", image_url: { url: imageDataUrl(part.mediaType, part.data) } };
}

/** OpenAI's assistant-message content is text-only (no image parts) - only user turns can carry images. */
function toMantleText(content: string | LLMContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is Extract<LLMContentPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function toMantleMessage(m: LLMMessage): ChatCompletionMessageParam {
  if (m.role === "assistant") {
    return { role: "assistant", content: toMantleText(m.content) };
  }
  return {
    role: "user",
    content: typeof m.content === "string" ? m.content : m.content.map(toMantleContentPart),
  };
}

type FunctionToolCall = OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall;

/** This provider only ever offers function tools (never custom/freeform tools), so every tool_calls entry is this variant - narrow away the union the SDK types the field as. */
function isFunctionToolCall(tc: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): tc is FunctionToolCall {
  return tc.type === "function";
}

function toMantleTool(tool: ToolSpec): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

/**
 * Every assistant tool_calls entry must get a matching role:"tool" message
 * (by tool_call_id) in the very next turn, or the next request is rejected -
 * same bookkeeping requirement as the Anthropic/Converse adapters, just in
 * OpenAI's message shape.
 */
function rejectAllToolCalls(
  toolCalls: FunctionToolCall[],
  primaryId: string,
  primaryMessage: string
): ChatCompletionMessageParam[] {
  return toolCalls.map((tc) => ({
    role: "tool" as const,
    tool_call_id: tc.id,
    content: tc.id === primaryId ? primaryMessage : "Superseded by another tool call in the same turn - ignore this one.",
  }));
}

function acknowledgeToolCalls(toolCalls: FunctionToolCall[], note: string): ChatCompletionMessageParam[] {
  return [
    ...toolCalls.map((tc) => ({
      role: "tool" as const,
      tool_call_id: tc.id,
      content: "Received - take one more careful look before finalizing.",
    })),
    { role: "user" as const, content: note },
  ];
}

interface MantleCallResult<T> {
  data: T;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
}

async function callToolWithValidation<T>(
  modelId: string,
  schema: z.ZodType<T>,
  tool: ToolSpec,
  initialMessages: ChatCompletionMessageParam[],
  opts: {
    maxTokens: number;
    system?: string;
    maxAttempts?: number;
    normalize?: (raw: unknown) => unknown;
    retryHint?: (data: T) => string | null | undefined;
  }
): Promise<MantleCallResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const mantleTool = toMantleTool(tool);
  let messages: ChatCompletionMessageParam[] = opts.system
    ? [{ role: "system", content: opts.system }, ...initialMessages]
    : [...initialMessages];
  let lastError = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await getClient().chat.completions.create({
      model: modelId,
      messages,
      tools: [mantleTool],
      // A specific named tool is more precise than Converse's toolChoice:{any:{}}
      // (which only forces "some" tool) - Chat Completions supports forcing an
      // exact function name directly, and this app only ever offers one tool.
      tool_choice: { type: "function", function: { name: tool.name } },
      max_tokens: clampMaxTokens(modelId, opts.maxTokens),
    });

    totalInputTokens += response.usage?.prompt_tokens ?? 0;
    totalOutputTokens += response.usage?.completion_tokens ?? 0;

    const choice = response.choices[0];
    const message = choice?.message;
    const toolCalls = (message?.tool_calls ?? []).filter(isFunctionToolCall);

    if (choice?.finish_reason === "length") {
      lastError = "response was cut off before finishing (length)";
      messages = [
        ...messages,
        { role: "assistant", content: message?.content ?? null, tool_calls: message?.tool_calls },
        ...(toolCalls.length > 0
          ? rejectAllToolCalls(
              toolCalls,
              "",
              "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget."
            )
          : [
              {
                role: "user" as const,
                content:
                  "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget.",
              },
            ]),
      ];
      continue;
    }

    const toolCall = toolCalls.find((tc) => tc.function?.name === tool.name);
    if (!toolCall) {
      lastError = "no matching tool_calls entry in response";
      messages = [
        ...messages,
        { role: "assistant", content: message?.content ?? null, tool_calls: message?.tool_calls },
        { role: "user", content: `You must call the ${tool.name} tool with its full arguments.` },
      ];
      continue;
    }

    let rawInput: unknown;
    try {
      rawInput = JSON.parse(toolCall.function.arguments);
    } catch {
      lastError = "tool call arguments were not valid JSON";
      messages = [
        ...messages,
        { role: "assistant", content: message?.content ?? null, tool_calls: message?.tool_calls },
        ...rejectAllToolCalls(
          toolCalls,
          toolCall.id,
          `Your call to ${tool.name} had arguments that weren't valid JSON. Call ${tool.name} again with well-formed JSON arguments.`
        ),
      ];
      continue;
    }

    const normalized = opts.normalize ? opts.normalize(rawInput) : rawInput;
    const coerced = coerceToSchema(schema, normalized);
    const result = schema.safeParse(coerced);
    if (result.success) {
      const correction = attempt < maxAttempts ? opts.retryHint?.(result.data) : null;
      if (correction) {
        console.warn(`[bedrock-mantle] ${tool.name} attempt ${attempt} passed validation but retryHint requested another look`);
        messages = [
          ...messages,
          { role: "assistant", content: message?.content ?? null, tool_calls: message?.tool_calls },
          ...acknowledgeToolCalls(toolCalls, correction),
        ];
        continue;
      }
      return { data: result.data, attempts: attempt, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    }

    lastError = result.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");

    if (attempt === maxAttempts) break;

    console.warn(`[bedrock-mantle] ${tool.name} attempt ${attempt} failed validation, retrying:\n${lastError}`);

    messages = [
      ...messages,
      { role: "assistant", content: message?.content ?? null, tool_calls: message?.tool_calls },
      ...rejectAllToolCalls(
        toolCalls,
        toolCall.id,
        `Your call to ${tool.name} was rejected - these fields were missing or the wrong type:\n${lastError}\n\nCall ${tool.name} again with a complete, valid set of arguments. Do not omit any required field.`
      ),
    ];
  }

  throw new Error(
    `Bedrock Mantle model ${modelId} failed to produce a valid ${tool.name} call after ${maxAttempts} attempts:\n${lastError}`
  );
}

export const bedrockMantleProvider: LLMProvider = {
  name: "bedrock-mantle",

  supports(workload: Workload): boolean {
    return config.bedrockMantleEnabled && Boolean(config.bedrockModelMap[workload]);
  },

  async callTool<T>(req: LLMToolCallRequest<T>): Promise<LLMResult<T>> {
    if (!config.bedrockMantleEnabled) {
      throw new Error("Bedrock Mantle provider is disabled (set BEDROCK_MANTLE_API_KEY and BEDROCK_REGION to enable it)");
    }
    const modelId = config.bedrockModelMap[req.workload];
    if (!modelId) {
      throw new Error(
        `No Bedrock model mapped for workload "${req.workload}" (set it in BEDROCK_MODEL_MAP)`
      );
    }

    const start = Date.now();
    const { data, attempts, inputTokens, outputTokens } = await callToolWithValidation(
      modelId,
      req.schema,
      req.tool,
      req.messages.map(toMantleMessage),
      {
        maxTokens: req.maxTokens,
        system: req.system,
        maxAttempts: req.maxAttempts,
        normalize: req.normalize,
        retryHint: req.retryHint,
      }
    );

    return {
      data,
      meta: {
        provider: "bedrock-mantle",
        model: modelId,
        latencyMs: Date.now() - start,
        inputTokens,
        outputTokens,
        costUsd: estimateCost(modelId, inputTokens, outputTokens),
        attempts,
      },
    };
  },
};
