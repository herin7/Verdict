import { z } from "zod";

/**
 * LLM tool calls don't always respect the declared JSON schema shape exactly
 * (a single object instead of a one-item array, a stringified JSON blob instead
 * of native JSON, a numeric string instead of a number, etc). Rather than
 * patching each failure mode as it's discovered, this walks the actual Zod
 * schema and coerces the raw value into the shape the schema expects wherever
 * that coercion is unambiguous. Zod still does final validation - this only
 * normalizes shape, it never invents data.
 */
export function coerceToSchema(schema: z.ZodTypeAny, value: unknown): unknown {
  const def = schema._def as any;
  const typeName = def.typeName as string;

  switch (typeName) {
    case "ZodOptional":
      return value === undefined ? undefined : coerceToSchema(def.innerType, value);

    case "ZodNullable":
      return value === null ? null : coerceToSchema(def.innerType, value);

    case "ZodDefault":
      return value === undefined ? def.defaultValue() : coerceToSchema(def.innerType, value);

    case "ZodString": {
      if (typeof value === "string") return value;
      if (value == null) return value;
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    }

    case "ZodNumber": {
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return Number(value);
      }
      return value;
    }

    case "ZodBoolean": {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    }

    case "ZodEnum":
      return value;

    case "ZodArray": {
      let arr: unknown[];
      if (Array.isArray(value)) {
        arr = value;
      } else if (typeof value === "string") {
        arr = parseArrayFromString(value);
      } else if (value && typeof value === "object") {
        // A single object where an array was expected, or an object keyed "0","1",...
        arr = Object.values(value as Record<string, unknown>);
      } else if (value == null) {
        arr = [];
      } else {
        arr = [value];
      }
      return arr.map((item) => coerceToSchema(def.type, item));
    }

    case "ZodObject": {
      const obj = extractObject(value);
      const shape = def.shape() as Record<string, z.ZodTypeAny>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        out[key] = coerceToSchema(shape[key], obj[key]);
      }
      return out;
    }

    default:
      return value;
  }
}

function parseArrayFromString(value: string): unknown[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [trimmed];
  }
}

function extractObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    const first = value.find((v) => v && typeof v === "object");
    return (first as Record<string, unknown>) ?? {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}
