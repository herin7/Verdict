import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import { coerceToSchema } from "../../coerce.js";
import type {
  LLMCallMeta,
  LLMContentPart,
  LLMMessage,
  LLMProvider,
  LLMResult,
  LLMToolCallRequest,
  ToolSpec,
} from "../types.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: config.anthropicTimeoutMs });

/** USD per 1M tokens (input/output). Matched by substring against the configured model id; unknown models fall back to sonnet-tier pricing. */
const PRICE_TABLE: { match: string; input: number; output: number }[] = [
  { match: "opus", input: 15, output: 75 },
  { match: "sonnet", input: 3, output: 15 },
  { match: "haiku", input: 0.8, output: 4 },
];

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_TABLE.find((p) => model.toLowerCase().includes(p.match)) ?? PRICE_TABLE[1];
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function toAnthropicTool(tool: ToolSpec): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

function toAnthropicContent(
  content: string | LLMContentPart[]
): Anthropic.MessageParam["content"] {
  if (typeof content === "string") return content;
  return content.map((part): Anthropic.TextBlockParam | Anthropic.ImageBlockParam => {
    if (part.type === "text") return { type: "text", text: part.text };
    return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
  });
}

function toAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));
}

/**
 * Every tool_use block in an assistant turn MUST get a matching tool_result in
 * the very next message, or the next API call is rejected outright. If the model
 * ever emits more than one tool_use in a turn (parallel tool use), resolving
 * only the "primary" one leaves the rest dangling - so always resolve all of them.
 */
function rejectAllToolUses(
  content: Anthropic.ContentBlock[],
  primaryId: string,
  primaryMessage: string
): Anthropic.MessageParam {
  const blocks = content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  return {
    role: "user",
    content: blocks.map((b) => ({
      type: "tool_result" as const,
      tool_use_id: b.id,
      is_error: true,
      content:
        b.id === primaryId
          ? primaryMessage
          : "Superseded by another tool call in the same turn - ignore this one.",
    })),
  };
}

/**
 * Same tool_result bookkeeping as rejectAllToolUses, but for a call that
 * passed schema validation and just needs a second look (e.g. low
 * confidence despite strong evidence) - so the result is acknowledged as
 * successful (is_error omitted) rather than rejected as invalid.
 */
function acknowledgeToolUses(content: Anthropic.ContentBlock[], note: string): Anthropic.MessageParam {
  const blocks = content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  return {
    role: "user",
    content: [
      ...blocks.map((b) => ({
        type: "tool_result" as const,
        tool_use_id: b.id,
        content: "Received - take one more careful look before finalizing.",
      })),
      { type: "text" as const, text: note },
    ],
  };
}

async function callToolWithValidation<T>(req: LLMToolCallRequest<T>): Promise<LLMResult<T>> {
  const { schema, system, maxTokens, normalize } = req;
  const maxAttempts = req.maxAttempts ?? 3;
  const tool = toAnthropicTool(req.tool);
  const model = config.anthropicModel;
  const start = Date.now();

  let messages: Anthropic.MessageParam[] = toAnthropicMessages(req.messages);
  let lastError = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name, disable_parallel_tool_use: true },
      system,
      messages,
    });

    inputTokens += msg.usage?.input_tokens ?? 0;
    outputTokens += msg.usage?.output_tokens ?? 0;

    const buildMeta = (): LLMCallMeta => ({
      provider: "anthropic",
      model,
      latencyMs: Date.now() - start,
      inputTokens,
      outputTokens,
      costUsd: estimateCost(model, inputTokens, outputTokens),
      attempts: attempt,
    });

    if (msg.stop_reason === "max_tokens") {
      lastError = "response was cut off before finishing (max_tokens)";
      const hasToolUse = msg.content.some((b) => b.type === "tool_use");
      messages = [
        ...messages,
        { role: "assistant", content: msg.content },
        hasToolUse
          ? rejectAllToolUses(
              msg.content,
              "",
              "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget."
            )
          : {
              role: "user",
              content:
                "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget.",
            },
      ];
      continue;
    }

    const toolBlock = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolBlock) {
      lastError = "no tool_use block in response";
      messages = [
        ...messages,
        { role: "assistant", content: msg.content },
        { role: "user", content: `You must call the ${tool.name} tool with its full arguments.` },
      ];
      continue;
    }

    const normalized = normalize ? normalize(toolBlock.input) : toolBlock.input;
    const coerced = coerceToSchema(schema, normalized);
    const result = schema.safeParse(coerced);
    if (result.success) {
      const correction = attempt < maxAttempts ? req.retryHint?.(result.data) : null;
      if (correction) {
        console.warn(`[anthropicProvider] ${tool.name} attempt ${attempt} passed validation but retryHint requested another look`);
        messages = [
          ...messages,
          { role: "assistant", content: msg.content },
          acknowledgeToolUses(msg.content, correction),
        ];
        continue;
      }
      return { data: result.data, meta: buildMeta() };
    }

    lastError = result.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");

    if (attempt === maxAttempts) break;

    console.warn(`[anthropicProvider] ${tool.name} attempt ${attempt} failed validation, retrying:\n${lastError}`);

    messages = [
      ...messages,
      { role: "assistant", content: msg.content },
      rejectAllToolUses(
        msg.content,
        toolBlock.id,
        `Your call to ${tool.name} was rejected - these fields were missing or the wrong type:\n${lastError}\n\nCall ${tool.name} again with a complete, valid set of arguments. Do not omit any required field.`
      ),
    ];
  }

  throw new Error(
    `Anthropic failed to produce a valid ${tool.name} call after ${maxAttempts} attempts:\n${lastError}`
  );
}

export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  supports() {
    return Boolean(config.anthropicApiKey);
  },
  callTool<T>(req: LLMToolCallRequest<T>) {
    if (!config.anthropicApiKey) {
      throw new Error("Anthropic provider is disabled (ANTHROPIC_API_KEY unset)");
    }
    return callToolWithValidation(req);
  },
};
