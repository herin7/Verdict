import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
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
 * Model selection (see server/src/config.ts BEDROCK_MODEL_MAP, set per deployment):
 *
 * - Text-only workloads (report, insight_*, identify_url): GLM/Kimi are the
 *   preferred primary per product decision, and both are live on Bedrock
 *   Converse with tool use today (moonshotai.kimi-k2.5, zai.glm-4.7 /
 *   zai.glm-4.7-flash / zai.glm-5). Kimi K2.5 tests more reliably eager to
 *   call tools; GLM 4.7 Flash is the cheap option for lower-stakes workloads.
 * - Vision workload (identify_image only - identify_screen/url are text):
 *   GLM has no vision. Prefer a vision-capable id in BEDROCK_MODEL_MAP
 *   (e.g. amazon.nova-lite-v1:0) for that workload.
 *
 * Actual model IDs are supplied entirely via BEDROCK_MODEL_MAP env (workload
 * -> modelId) - nothing is hardcoded here, so swapping models is a config
 * change, not a code change.
 */

let client: BedrockRuntimeClient | undefined;
function getClient(): BedrockRuntimeClient {
  if (!client) client = new BedrockRuntimeClient({ region: config.bedrockRegion });
  return client;
}

function imageFormat(mediaType: ImageMediaType) {
  switch (mediaType) {
    case "image/jpeg":
      return "jpeg" as const;
    case "image/png":
      return "png" as const;
    case "image/webp":
      return "webp" as const;
    case "image/gif":
      return "gif" as const;
  }
}

function toBedrockContentPart(part: LLMContentPart): ContentBlock {
  if (part.type === "text") return { text: part.text };
  return {
    image: {
      format: imageFormat(part.mediaType),
      source: { bytes: Buffer.from(part.data, "base64") },
    },
  };
}

function toBedrockMessage(m: LLMMessage): Message {
  return {
    role: m.role,
    content: typeof m.content === "string" ? [{ text: m.content }] : m.content.map(toBedrockContentPart),
  };
}

function toBedrockTool(tool: ToolSpec): Tool {
  return {
    toolSpec: {
      name: tool.name,
      description: tool.description,
      // Cast: Converse's ToolInputSchema.json is typed as a recursive
      // DocumentType, but a plain JSON-Schema object always satisfies it.
      inputSchema: { json: tool.inputSchema as unknown as DocumentType },
    },
  };
}

/**
 * Every toolUse block in an assistant turn must get a matching toolResult in
 * the very next message or the next Converse call is rejected outright. If a
 * model ever emits more than one toolUse in a turn, resolve all of them (not
 * just the "primary" one) - same pattern as the Anthropic adapter.
 */
function rejectAllToolUses(content: ContentBlock[], primaryId: string, primaryMessage: string): Message {
  const blocks = content.filter((b): b is ContentBlock & { toolUse: NonNullable<ContentBlock["toolUse"]> } =>
    Boolean(b.toolUse)
  );
  return {
    role: "user",
    content: blocks.map((b) => ({
      toolResult: {
        toolUseId: b.toolUse.toolUseId,
        status: "error",
        content: [
          {
            text:
              b.toolUse.toolUseId === primaryId
                ? primaryMessage
                : "Superseded by another tool call in the same turn - ignore this one.",
          },
        ],
      },
    })),
  };
}

/**
 * Same tool_result bookkeeping as rejectAllToolUses, but for a call that
 * passed schema validation and just needs a second look - acknowledged as
 * successful (status "success") rather than rejected as invalid.
 */
function acknowledgeToolUses(content: ContentBlock[], note: string): Message {
  const blocks = content.filter((b): b is ContentBlock & { toolUse: NonNullable<ContentBlock["toolUse"]> } =>
    Boolean(b.toolUse)
  );
  return {
    role: "user",
    content: [
      ...blocks.map((b) => ({
        toolResult: {
          toolUseId: b.toolUse.toolUseId,
          status: "success" as const,
          content: [{ text: "Received - take one more careful look before finalizing." }],
        },
      })),
      { text: note },
    ],
  };
}

interface BedrockCallResult<T> {
  data: T;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
}

async function callToolWithValidation<T>(
  modelId: string,
  schema: z.ZodType<T>,
  tool: ToolSpec,
  initialMessages: Message[],
  opts: {
    maxTokens: number;
    system?: string;
    maxAttempts?: number;
    normalize?: (raw: unknown) => unknown;
    retryHint?: (data: T) => string | null | undefined;
  }
): Promise<BedrockCallResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const bedrockTool = toBedrockTool(tool);
  let messages: Message[] = [...initialMessages];
  let lastError = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await getClient().send(
      new ConverseCommand({
        modelId,
        system: opts.system ? [{ text: opts.system }] : undefined,
        messages,
        toolConfig: {
          tools: [bedrockTool],
          // Only one tool is ever offered, so "any" (force at least one tool
          // call) is equivalent to Anthropic's specific-tool forcing. Unlike
          // the `tool` choice - restricted to Anthropic Claude 3 and Amazon
          // Nova models per the Bedrock docs - "any" works across every
          // Converse tool-use model, including GLM/Kimi/Qwen/DeepSeek/Llama.
          toolChoice: { any: {} },
        },
        inferenceConfig: { maxTokens: clampMaxTokens(modelId, opts.maxTokens) },
      })
    );

    totalInputTokens += response.usage?.inputTokens ?? 0;
    totalOutputTokens += response.usage?.outputTokens ?? 0;

    const content = response.output?.message?.content ?? [];

    if (response.stopReason === "max_tokens") {
      lastError = "response was cut off before finishing (max_tokens)";
      const hasToolUse = content.some((b) => b.toolUse);
      messages = [
        ...messages,
        { role: "assistant", content },
        hasToolUse
          ? rejectAllToolUses(
              content,
              "",
              "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget."
            )
          : {
              role: "user",
              content: [
                {
                  text: "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget.",
                },
              ],
            },
      ];
      continue;
    }

    const toolBlock = content.find((b) => b.toolUse);
    if (!toolBlock?.toolUse) {
      lastError = "no tool_use block in response";
      messages = [
        ...messages,
        { role: "assistant", content },
        { role: "user", content: [{ text: `You must call the ${tool.name} tool with its full arguments.` }] },
      ];
      continue;
    }

    const normalized = opts.normalize ? opts.normalize(toolBlock.toolUse.input) : toolBlock.toolUse.input;
    const coerced = coerceToSchema(schema, normalized);
    const result = schema.safeParse(coerced);
    if (result.success) {
      const correction = attempt < maxAttempts ? opts.retryHint?.(result.data) : null;
      if (correction) {
        console.warn(`[bedrock] ${tool.name} attempt ${attempt} passed validation but retryHint requested another look`);
        messages = [
          ...messages,
          { role: "assistant", content },
          acknowledgeToolUses(content, correction),
        ];
        continue;
      }
      return { data: result.data, attempts: attempt, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    }

    lastError = result.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");

    if (attempt === maxAttempts) break;

    console.warn(`[bedrock] ${tool.name} attempt ${attempt} failed validation, retrying:\n${lastError}`);

    messages = [
      ...messages,
      { role: "assistant", content },
      rejectAllToolUses(
        content,
        toolBlock.toolUse.toolUseId ?? "",
        `Your call to ${tool.name} was rejected - these fields were missing or the wrong type:\n${lastError}\n\nCall ${tool.name} again with a complete, valid set of arguments. Do not omit any required field.`
      ),
    ];
  }

  throw new Error(
    `Bedrock model ${modelId} failed to produce a valid ${tool.name} call after ${maxAttempts} attempts:\n${lastError}`
  );
}

export const bedrockProvider: LLMProvider = {
  name: "bedrock",

  supports(workload: Workload): boolean {
    return config.bedrockEnabled && Boolean(config.bedrockModelMap[workload]);
  },

  async callTool<T>(req: LLMToolCallRequest<T>): Promise<LLMResult<T>> {
    if (!config.bedrockEnabled) {
      throw new Error("Bedrock provider is disabled (set BEDROCK_REGION to enable it)");
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
      req.messages.map(toBedrockMessage),
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
        provider: "bedrock",
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
