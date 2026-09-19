// ============================================================================
// LEARNOVA — OPENROUTER SHARED SERVER-SIDE CLIENT
// ============================================================================
//
// Purpose:
//   Securely call OpenRouter from Supabase Edge Functions.
//
// Design:
//   - NEVER exposes OPENROUTER_API_KEY to the browser.
//   - Uses the OpenRouter OpenAI-compatible Chat Completions endpoint.
//   - Supports OpenRouter's model fallback array.
//   - Supports structured JSON output where the selected model permits it.
//   - Applies a hard request timeout.
//   - Produces useful, bounded error messages for Edge Function logs.
//   - Does not perform its own model retry loop because OpenRouter itself
//     handles provider failover and the caller can decide whether another
//     application-level retry is appropriate.
//
// OpenRouter supports automatic provider failover, and its `models` array
// allows ordered model-level fallback when a selected model fails.
// ============================================================================

const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

// These are deliberately kept as a fallback chain rather than a single
// model. The first model is the normal OpenRouter fallback; subsequent
// entries are used if OpenRouter cannot complete the request with the
// previous model.
//
// Current model IDs were verified against OpenRouter's current model pages
// on 2026-09-18.
//
// The caller may override this list per request.
export const DEFAULT_MODELS = [
  "google/gemini-3.8-flash",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.4-mini",
] as const;

export type OpenRouterResponseFormat =
  | {
      type: "json_object";
    }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };

export type OpenRouterTextOptions = {
  /**
   * Ordered model IDs.
   *
   * OpenRouter will try these in order when model-level fallback is needed.
   */
  models?: string[];

  /**
   * Sampling temperature.
   *
   * 0 is preferred for extraction, grading, classification and
   * evidence-grounded educational generation.
   */
  temperature?: number;

  /**
   * Maximum number of output tokens.
   */
  maxTokens?: number;

  /**
   * Hard request timeout.
   */
  timeoutMs?: number;

  /**
   * Optional response-format constraint.
   */
  responseFormat?: OpenRouterResponseFormat;

  /**
   * Internal task name used only for diagnostics.
   */
  task?: string;

  /**
   * Optional system instruction.
   *
   * The existing Learnova pipeline generally places the complete prompt
   * into the user message, so this is optional.
   */
  systemPrompt?: string;

  /**
   * Optional OpenRouter provider preferences.
   */
  provider?: {
    allow_fallbacks?: boolean;
    data_collection?: "allow" | "deny";
    zdr?: boolean;
  };
};

export type OpenRouterTextResult = {
  content: string;
  model: string | null;
  provider: string | null;
  id: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterRawResponse = {
  id?: unknown;
  model?: unknown;
  provider?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
  error?: {
    code?: unknown;
    message?: unknown;
    type?: unknown;
    metadata?: unknown;
  };
};

function cleanModels(models: string[] | undefined): string[] {
  const source = models?.length
    ? models
    : [...DEFAULT_MODELS];

  const unique = new Set<string>();

  for (const model of source) {
    const value = String(model ?? "").trim();

    if (!value) continue;

    // Avoid sending malformed entries such as accidental spaces or
    // comma-separated values embedded in one item.
    if (value.includes(",")) {
      for (const part of value.split(",")) {
        const cleaned = part.trim();

        if (cleaned) {
          unique.add(cleaned);
        }
      }
      continue;
    }

    unique.add(value);
  }

  const result = [...unique];

  if (!result.length) {
    throw new Error("OpenRouter model list is empty.");
  }

  return result;
}

function boundedTemperature(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(2, parsed));
}

function boundedMaxTokens(value: unknown, fallback = 16_384): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(131_072, Math.floor(parsed)));
}

function boundedTimeout(value: unknown, fallback = 35_000): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1_000, Math.min(120_000, Math.floor(parsed)));
}

function safeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractMessageContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const chunks: string[] = [];

    for (const part of value) {
      if (typeof part === "string") {
        chunks.push(part);
        continue;
      }

      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        chunks.push((part as { text: string }).text);
      }
    }

    return chunks.join("");
  }

  if (
    value &&
    typeof value === "object" &&
    "text" in value &&
    typeof (value as { text?: unknown }).text === "string"
  ) {
    return (value as { text: string }).text;
  }

  return safeString(value);
}

function truncateForError(value: string, maxChars = 2_000): string {
  const cleaned = value.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxChars)}…`;
}

async function readResponseBody(response: Response): Promise<OpenRouterRawResponse> {
  const rawText = await response.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText) as OpenRouterRawResponse;
  } catch {
    throw new Error(
      `OpenRouter returned a non-JSON response (${response.status}): ${truncateForError(rawText)}`,
    );
  }
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY") ?? ""}`,
    "Content-Type": "application/json",
  };

  // Optional attribution headers.
  //
  // They are not required for the request to function, but allowing them
  // through environment variables avoids hardcoding deployment-specific
  // URLs into this shared utility.
  const siteUrl =
    Deno.env.get("OPENROUTER_SITE_URL")?.trim() ?? "";

  const appName =
    Deno.env.get("OPENROUTER_APP_NAME")?.trim() ??
    "Learnova";

  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
  }

  if (appName) {
    headers["X-Title"] = appName;
  }

  return headers;
}

function validateApiKey(): string {
  const apiKey =
    Deno.env.get("OPENROUTER_API_KEY")?.trim() ?? "";

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured in Supabase Edge Function secrets.",
    );
  }

  return apiKey;
}

function isLikelyTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();

  return (
    name.includes("abort") ||
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

function normalizeUsage(
  usage: OpenRouterRawResponse["usage"],
): OpenRouterTextResult["usage"] {
  if (!usage) {
    return undefined;
  }

  const promptTokens =
    Number.isFinite(Number(usage.prompt_tokens))
      ? Number(usage.prompt_tokens)
      : undefined;

  const completionTokens =
    Number.isFinite(Number(usage.completion_tokens))
      ? Number(usage.completion_tokens)
      : undefined;

  const totalTokens =
    Number.isFinite(Number(usage.total_tokens))
      ? Number(usage.total_tokens)
      : undefined;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

/**
 * Returns true when an OpenRouter key exists in the Edge Function environment.
 */
export function isOpenRouterConfigured(): boolean {
  return Boolean(
    Deno.env.get("OPENROUTER_API_KEY")?.trim(),
  );
}

/**
 * Make one non-streaming OpenRouter text-generation request.
 *
 * The `models` array is sent directly to OpenRouter. OpenRouter handles
 * model-level fallback and provider-level failover; this helper therefore
 * does not loop across models itself.
 */
export async function callOpenRouterText(
  prompt: string,
  options: OpenRouterTextOptions = {},
): Promise<OpenRouterTextResult> {
  const apiKey = validateApiKey();

  const cleanPrompt = String(prompt ?? "").trim();

  if (!cleanPrompt) {
    throw new Error("OpenRouter prompt cannot be empty.");
  }

  const models = cleanModels(options.models);

  const temperature = boundedTemperature(
    options.temperature,
    0,
  );

  const maxTokens = boundedMaxTokens(
    options.maxTokens,
    16_384,
  );

  const timeoutMs = boundedTimeout(
    options.timeoutMs,
    35_000,
  );

  const messages: OpenRouterMessage[] = [];

  if (options.systemPrompt?.trim()) {
    messages.push({
      role: "system",
      content: options.systemPrompt.trim(),
    });
  }

  messages.push({
    role: "user",
    content: cleanPrompt,
  });

  const body: Record<string, unknown> = {
    models,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  if (options.provider) {
    body.provider = options.provider;
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(
      new Error(
        `OpenRouter request timed out after ${timeoutMs}ms.`,
      ),
    );
  }, timeoutMs);

  const startedAt = Date.now();
  const taskLabel =
    options.task?.trim() || "Learnova OpenRouter request";

  try {
    const response = await fetch(
      OPENROUTER_ENDPOINT,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    const payload = await readResponseBody(response);

    if (!response.ok) {
      const errorCode =
        safeString(payload.error?.code).trim();

      const errorMessage =
        safeString(payload.error?.message).trim();

      const details = [
        `HTTP ${response.status}`,
        errorCode ? `code=${errorCode}` : "",
        errorMessage
          ? `message=${truncateForError(errorMessage)}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      throw new Error(
        `OpenRouter request failed during ${taskLabel}: ${details || "unknown API error"}`,
      );
    }

    const content =
      extractMessageContent(
        payload.choices?.[0]?.message?.content,
      ).trim();

    if (!content) {
      const elapsed = Date.now() - startedAt;

      throw new Error(
        `OpenRouter returned an empty response during ${taskLabel} after ${elapsed}ms.`,
      );
    }

    const model =
      typeof payload.model === "string"
        ? payload.model
        : null;

    const provider =
      typeof payload.provider === "string"
        ? payload.provider
        : null;

    const id =
      typeof payload.id === "string"
        ? payload.id
        : null;

    return {
      content,
      model,
      provider,
      id,
      usage: normalizeUsage(payload.usage),
    };
  } catch (error) {
    if (isLikelyTimeoutError(error)) {
      throw new Error(
        `OpenRouter request timed out during ${taskLabel} after ${timeoutMs}ms.`,
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `OpenRouter request failed during ${taskLabel}: ${String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience wrapper for callers that want plain text only.
 */
export async function generateOpenRouterText(
  prompt: string,
  options: OpenRouterTextOptions = {},
): Promise<string> {
  const result = await callOpenRouterText(
    prompt,
    options,
  );

  return result.content;
  }
