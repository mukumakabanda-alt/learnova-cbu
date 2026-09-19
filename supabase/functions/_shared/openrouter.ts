/**
 * Learnova OpenRouter Gateway
 *
 * Purpose:
 * - Keep the OpenRouter secret server-side.
 * - Provide one resilient API wrapper for text + vision requests.
 * - Support model-level fallback through OpenRouter.
 * - Support provider-level fallback through OpenRouter's routing layer.
 * - Keep OpenRouter-specific details out of the rest of the application.
 *
 * IMPORTANT:
 * This file MUST only be imported from Supabase Edge Functions.
 * Never import it from React/browser code.
 */

export type OpenRouterTextContent = string;

export type OpenRouterImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type OpenRouterContentPart =
  | {
      type: "text";
      text: string;
    }
  | OpenRouterImageContent;

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: OpenRouterTextContent | OpenRouterContentPart[];
};

export type OpenRouterRequestOptions = {
  /**
   * The primary model to try.
   *
   * When omitted, the first model from DEFAULT_MODELS is used.
   */
  model?: string;

  /**
   * Models tried in order if the previous model/provider attempt fails.
   *
   * OpenRouter itself also performs provider-level routing/failover.
   */
  models?: string[];

  /**
   * Messages in OpenAI-compatible chat format.
   */
  messages: OpenRouterMessage[];

  /**
   * Optional request temperature.
   *
   * We normally omit this for extraction, verification, and other
   * correctness-sensitive workloads.
   */
  temperature?: number;

  /**
   * Maximum generated tokens.
   */
  maxTokens?: number;

  /**
   * Optional JSON response format.
   *
   * Keep this optional because not every model/provider supports every
   * structured-output feature identically.
   */
  responseFormat?: {
    type: "json_object";
  };

  /**
   * Timeout for the individual OpenRouter HTTP request.
   */
  timeoutMs?: number;

  /**
   * Optional task label used only for diagnostics/logging.
   */
  task?: string;

  /**
   * Optional site metadata sent to OpenRouter.
   */
  siteUrl?: string;

  /**
   * Optional site title sent to OpenRouter.
   */
  siteName?: string;
};

export type OpenRouterResult = {
  content: string;
  model: string | null;
  provider: string | null;
  usage: Record<string, unknown> | null;
};

export type OpenRouterErrorDetails = {
  status: number | null;
  body: string;
  task?: string;
};

export class OpenRouterError extends Error {
  readonly details: OpenRouterErrorDetails;

  constructor(
    message: string,
    details: OpenRouterErrorDetails,
  ) {
    super(message);
    this.name = "OpenRouterError";
    this.details = details;
  }
}

/**
 * Keep the fallback list deliberately small.
 *
 * Why:
 * - Excessive model hopping increases latency and cost.
 * - We want genuinely different providers/models.
 * - OpenRouter already performs provider-level failover itself.
 *
 * These are current multimodal-capable models available through OpenRouter.
 */
export const DEFAULT_MODELS = [
  "google/gemini-3.8-flash",
  "anthropic/claude-sonnet-5",
] as const;

/**
 * Maximum time allowed for an individual OpenRouter request.
 *
 * The overall Edge Function has its own budget; this prevents one hung
 * request from consuming the whole function lifetime.
 */
const DEFAULT_TIMEOUT_MS = 35_000;

/**
 * OpenRouter endpoint.
 */
const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/**
 * Statuses commonly worth retrying/falling back from.
 */
const TRANSIENT_STATUS_CODES = new Set([
  408,
  409,
  425,
  429,
  500,
  502,
  503,
  504,
]);

function getApiKey(): string | null {
  const key = Deno.env.get("OPENROUTER_API_KEY")?.trim();

  return key ? key : null;
}

/**
 * Returns whether OpenRouter has been configured.
 *
 * This allows Learnova to run perfectly well without OpenRouter:
 *
 * Puter/browser visual intelligence
 * +
 * Lovable primary AI
 *
 * and then automatically gain OpenRouter resilience when the secret
 * is configured.
 */
export function isOpenRouterConfigured(): boolean {
  return Boolean(getApiKey());
}

function clampTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    5_000,
    Math.min(60_000, Math.floor(value!)),
  );
}

function normaliseModels(
  model?: string,
  models?: string[],
): string[] {
  const candidates = [
    ...(model?.trim() ? [model.trim()] : []),
    ...(models ?? [])
      .map((entry) => entry?.trim())
      .filter(Boolean),
    ...DEFAULT_MODELS,
  ];

  return [...new Set(candidates)].slice(0, 5);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractAssistantContent(
  payload: any,
): string {
  const content =
    payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  /**
   * Some multimodal/structured providers can return a content array.
   * Flatten only ordinary text parts.
   */
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (
          typeof part === "string"
        ) {
          return part;
        }

        if (
          part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

/**
 * Make one direct request to OpenRouter.
 *
 * Model fallback is handled by the exported wrapper below.
 */
async function requestOpenRouter(
  apiKey: string,
  model: string,
  options: OpenRouterRequestOptions,
): Promise<OpenRouterResult> {
  const timeoutMs = clampTimeout(
    options.timeoutMs,
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  /**
   * These headers are optional for API operation but useful for
   * identifying the application in OpenRouter's ecosystem.
   *
   * They are intentionally configurable rather than hard-coded to a
   * localhost URL.
   */
  const siteUrl =
    options.siteUrl?.trim() ||
    Deno.env
      .get("LEARNOVA_SITE_URL")
      ?.trim();

  const siteName =
    options.siteName?.trim() ||
    Deno.env
      .get("LEARNOVA_SITE_NAME")
      ?.trim() ||
    "Learnova";

  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
  }

  if (siteName) {
    headers["X-Title"] = siteName;
  }

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
  };

  if (
    typeof options.temperature ===
      "number" &&
    Number.isFinite(options.temperature)
  ) {
    body.temperature = Math.max(
      0,
      Math.min(2, options.temperature),
    );
  }

  if (
    typeof options.maxTokens ===
      "number" &&
    Number.isFinite(options.maxTokens) &&
    options.maxTokens > 0
  ) {
    body.max_tokens = Math.min(
      Math.floor(options.maxTokens),
      65_536,
    );
  }

  if (options.responseFormat) {
    body.response_format =
      options.responseFormat;
  }

  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(
      OPENROUTER_CHAT_URL,
      {
        method: "POST",
        headers,
        body: safeJson(body),
        signal: controller.signal,
      },
    );

    const bodyText =
      await response.text();

    if (!response.ok) {
      throw new OpenRouterError(
        `OpenRouter request failed with HTTP ${response.status}.`,
        {
          status: response.status,
          body: bodyText.slice(
            0,
            1_000,
          ),
          task: options.task,
        },
      );
    }

    let payload: any;

    try {
      payload = JSON.parse(
        bodyText,
      );
    } catch {
      throw new OpenRouterError(
        "OpenRouter returned a non-JSON response.",
        {
          status: response.status,
          body: bodyText.slice(
            0,
            1_000,
          ),
          task: options.task,
        },
      );
    }

    const content =
      extractAssistantContent(
        payload,
      );

    if (!content) {
      throw new OpenRouterError(
        "OpenRouter returned an empty assistant response.",
        {
          status: response.status,
          body: bodyText.slice(
            0,
            1_000,
          ),
          task: options.task,
        },
      );
    }

    const modelUsed =
      typeof payload?.model ===
      "string"
        ? payload.model
        : model;

    const provider =
      typeof payload?.provider ===
      "string"
        ? payload.provider
        : null;

    const usage =
      payload?.usage &&
      typeof payload.usage ===
        "object"
        ? payload.usage
        : null;

    return {
      content,
      model: modelUsed,
      provider,
      usage,
    };
  } catch (error) {
    if (
      error instanceof
      OpenRouterError
    ) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const aborted =
      error instanceof
        DOMException &&
      error.name ===
        "AbortError";

    throw new OpenRouterError(
      aborted
        ? `OpenRouter request timed out after ${timeoutMs}ms.`
        : `OpenRouter request failed: ${message}`,
      {
        status: null,
        body: "",
        task: options.task,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-side OpenRouter call with:
 *
 * 1. model fallback
 * 2. OpenRouter provider failover
 * 3. bounded number of attempts
 *
 * If OpenRouter is not configured, this function throws a clean,
 * identifiable error rather than pretending the provider worked.
 */
export async function callOpenRouter(
  options: OpenRouterRequestOptions,
): Promise<OpenRouterResult> {
  const apiKey =
    getApiKey();

  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not configured.",
      {
        status: null,
        body: "",
        task: options.task,
      },
    );
  }

  const models =
    normaliseModels(
      options.model,
      options.models,
    );

  let lastError: unknown =
    null;

  for (
    let index = 0;
    index < models.length;
    index++
  ) {
    const model =
      models[index];

    try {
      return await requestOpenRouter(
        apiKey,
        model,
        options,
      );
    } catch (error) {
      lastError = error;

      const status =
        error instanceof
        OpenRouterError
          ? error.details.status
          : null;

      /**
       * Continue to the next model for:
       * - transient provider failure
       * - rate limiting
       * - timeout/network failure
       *
       * For clearly client-side errors such as malformed requests,
       * falling through every model would only waste time.
       */
      const shouldFallback =
        status === null ||
        TRANSIENT_STATUS_CODES.has(
          status,
        );

      if (
        !shouldFallback ||
        index ===
          models.length - 1
      ) {
        break;
      }
    }
  }

  if (
    lastError instanceof
    OpenRouterError
  ) {
    throw lastError;
  }

  throw new OpenRouterError(
    "All configured OpenRouter fallback models failed.",
    {
      status: null,
      body: "",
      task: options.task,
    },
  );
}

/**
 * Text-only convenience wrapper.
 */
export async function callOpenRouterText(
  prompt: string,
  options: Omit<
    OpenRouterRequestOptions,
    "messages"
  > = {},
): Promise<OpenRouterResult> {
  return callOpenRouter({
    ...options,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
}

/**
 * Multimodal convenience wrapper.
 *
 * The caller is responsible for converting the page/slide/photo into
 * a valid image URL or data URL.
 *
 * Examples:
 *   https://example.com/page.jpg
 *
 * or:
 *
 *   data:image/jpeg;base64,...
 */
export async function callOpenRouterVision(
  prompt: string,
  imageUrl: string,
  options: Omit<
    OpenRouterRequestOptions,
    "messages"
  > = {},
): Promise<OpenRouterResult> {
  const cleanImageUrl =
    imageUrl?.trim();

  if (!cleanImageUrl) {
    throw new OpenRouterError(
      "callOpenRouterVision requires a non-empty image URL or data URL.",
      {
        status: null,
        body: "",
        task: options.task,
      },
    );
  }

  return callOpenRouter({
    ...options,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: cleanImageUrl,
              detail: "high",
            },
          },
        ],
      },
    ],
  });
}

/**
 * Health-check helper.
 *
 * This intentionally performs no AI work.
 */
export function getOpenRouterStatus(): {
  configured: boolean;
  models: readonly string[];
} {
  return {
    configured:
      isOpenRouterConfigured(),
    models:
      DEFAULT_MODELS,
  };
}
