/**
 * Learnova — secure OpenRouter gateway.
 *
 * SERVER ONLY.
 *
 * This module is imported by Supabase Edge Functions.
 * It must never be imported from browser/React code.
 *
 * OpenRouter's `models` array is used for model-level fallback.
 * OpenRouter's own provider routing supplies provider-level failover.
 */

export type OpenRouterContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
        detail?: "auto" | "low" | "high";
      };
    };

export type OpenRouterMessage = {
  role:
    | "system"
    | "user"
    | "assistant";
  content:
    | string
    | OpenRouterContentPart[];
};

export type OpenRouterRequestOptions = {
  model?: string;
  models?: string[];
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: {
    type: "json_object";
  };
  timeoutMs?: number;
  task?: string;
  siteUrl?: string;
  siteName?: string;
};

export type OpenRouterResult = {
  content: string;
  model: string | null;
  provider: string | null;
  usage: Record<
    string,
    unknown
  > | null;
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
    this.name =
      "OpenRouterError";
    this.details =
      details;
  }
}

export const DEFAULT_MODELS =
  [
    "google/gemini-3.8-flash",
    "anthropic/claude-sonnet-5",
  ] as const;

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_TIMEOUT_MS =
  45_000;

const TRANSIENT_STATUS_CODES =
  new Set([
    408,
    409,
    425,
    429,
    500,
    502,
    503,
    504,
  ]);

function getApiKey():
  | string
  | null {
  return (
    Deno.env
      .get(
        "OPENROUTER_API_KEY",
      )
      ?.trim() ||
    null
  );
}

export function isOpenRouterConfigured():
  boolean {
  return Boolean(
    getApiKey(),
  );
}

function normalizeModels(
  model?: string,
  models?: string[],
): string[] {
  const values = [
    ...(models ??
      []),
    ...(model
      ? [model]
      : []),
    ...DEFAULT_MODELS,
  ]
    .map(
      (
        value,
      ) =>
        value?.trim(),
    )
    .filter(
      Boolean,
    );

  return [
    ...new Set(
      values,
    ),
  ].slice(
    0,
    5,
  );
}

function timeoutFor(
  value:
    | number
    | undefined,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    5_000,
    Math.min(
      60_000,
      Math.floor(
        value!,
      ),
    ),
  );
}

function responseText(
  payload: any,
): string {
  const content =
    payload
      ?.choices?.[0]
      ?.message
      ?.content;

  if (
    typeof content ===
    "string"
  ) {
    return content.trim();
  }

  if (
    Array.isArray(
      content,
    )
  ) {
    return content
      .map(
        (
          part: any,
        ) => {
          if (
            typeof part ===
            "string"
          ) {
            return part;
          }

          return typeof part
            ?.text ===
            "string"
            ? part.text
            : "";
        },
      )
      .filter(
        Boolean,
      )
      .join("\n")
      .trim();
  }

  return "";
}

async function requestModel(
  apiKey: string,
  models: string[],
  options: OpenRouterRequestOptions,
): Promise<OpenRouterResult> {
  const timeout =
    timeoutFor(
      options.timeoutMs,
    );

  const headers: Record<
    string,
    string
  > = {
    Authorization:
      `Bearer ${apiKey}`,
    "Content-Type":
      "application/json",
  };

  const siteUrl =
    options.siteUrl?.trim() ||
    Deno.env
      .get(
        "LEARNOVA_SITE_URL",
      )
      ?.trim();

  const siteName =
    options.siteName?.trim() ||
    Deno.env
      .get(
        "LEARNOVA_SITE_NAME",
      )
      ?.trim() ||
    "Learnova";

  if (siteUrl) {
    headers[
      "HTTP-Referer"
    ] = siteUrl;
  }

  headers[
    "X-Title"
  ] = siteName;

  /*
   * OpenRouter documents `models` as the fallback array.
   *
   * Do not send a separate browser-visible API key.
   */
  const body: Record<
    string,
    unknown
  > = {
    models,
    messages:
      options.messages,
  };

  if (
    typeof options.temperature ===
      "number" &&
    Number.isFinite(
      options.temperature,
    )
  ) {
    body.temperature =
      Math.max(
        0,
        Math.min(
          2,
          options.temperature,
        ),
      );
  }

  if (
    typeof options.maxTokens ===
      "number" &&
    Number.isFinite(
      options.maxTokens,
    ) &&
    options.maxTokens >
      0
  ) {
    body.max_tokens =
      Math.min(
        65_536,
        Math.floor(
          options.maxTokens,
        ),
      );
  }

  if (
    options.responseFormat
  ) {
    body.response_format =
      options.responseFormat;
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeout,
    );

  try {
    const response =
      await fetch(
        OPENROUTER_URL,
        {
          method:
            "POST",
          headers,
          body:
            JSON.stringify(
              body,
            ),
          signal:
            controller.signal,
        },
      );

    const raw =
      await response.text();

    if (
      !response.ok
    ) {
      throw new OpenRouterError(
        `OpenRouter returned HTTP ${response.status}.`,
        {
          status:
            response.status,
          body:
            raw.slice(
              0,
              2_000,
            ),
          task:
            options.task,
        },
      );
    }

    let payload:
      any;

    try {
      payload =
        JSON.parse(
          raw,
        );
    } catch {
      throw new OpenRouterError(
        "OpenRouter returned invalid JSON.",
        {
          status:
            response.status,
          body:
            raw.slice(
              0,
              2_000,
            ),
          task:
            options.task,
        },
      );
    }

    const content =
      responseText(
        payload,
      );

    if (!content) {
      throw new OpenRouterError(
        "OpenRouter returned an empty response.",
        {
          status:
            response.status,
          body:
            raw.slice(
              0,
              2_000,
            ),
          task:
            options.task,
        },
      );
    }

    return {
      content,
      model:
        typeof payload
          ?.model ===
        "string"
          ? payload.model
          : null,
      provider:
        typeof payload
          ?.provider ===
        "string"
          ? payload.provider
          : null,
      usage:
        payload
          ?.usage &&
        typeof payload.usage ===
          "object"
          ? payload.usage
          : null,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      OpenRouterError
    ) {
      throw error;
    }

    const aborted =
      error instanceof
        DOMException &&
      error.name ===
        "AbortError";

    throw new OpenRouterError(
      aborted
        ? `OpenRouter request timed out after ${Math.ceil(
            timeout / 1_000,
          )} seconds.`
        : `OpenRouter network request failed: ${
            error instanceof
            Error
              ? error.message
              : String(
                  error,
                )
          }`,
      {
        status:
          null,
        body:
          "",
        task:
          options.task,
      },
    );
  } finally {
    clearTimeout(
      timer,
    );
  }
}

export async function callOpenRouter(
  options: OpenRouterRequestOptions,
): Promise<OpenRouterResult> {
  const key =
    getApiKey();

  if (!key) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not configured.",
      {
        status:
          null,
        body:
          "",
        task:
          options.task,
      },
    );
  }

  const models =
    normalizeModels(
      options.model,
      options.models,
    );

  if (
    models.length ===
    0
  ) {
    throw new OpenRouterError(
      "No OpenRouter models were configured.",
      {
        status:
          null,
        body:
          "",
        task:
          options.task,
      },
    );
  }

  let lastError:
    | unknown
    | null = null;

  /*
   * First request: let OpenRouter itself perform model + provider
   * fallback using its `models` array.
   */
  try {
    return await requestModel(
      key,
      models,
      options,
    );
  } catch (
    firstError
  ) {
    lastError =
      firstError;

    /*
     * Only retry the whole routed request once for transient conditions.
     *
     * This protects against a transient network interruption without
     * multiplying requests during a permanent client-side 4xx error.
     */
    const status =
      firstError instanceof
      OpenRouterError
        ? firstError
            .details
            .status
        : null;

    const retryable =
      status === null ||
      TRANSIENT_STATUS_CODES.has(
        status,
      );

    if (
      !retryable
    ) {
      throw firstError;
    }
  }

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        500,
      ),
  );

  try {
    return await requestModel(
      key,
      models,
      options,
    );
  } catch (
    retryError
  ) {
    lastError =
      retryError;
  }

  if (
    lastError instanceof
    OpenRouterError
  ) {
    throw lastError;
  }

  throw new OpenRouterError(
    "OpenRouter failed after retry.",
    {
      status:
        null,
      body:
        "",
      task:
        options.task,
    },
  );
}

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
        role:
          "user",
        content:
          prompt,
      },
    ],
  });
}

export async function callOpenRouterVision(
  prompt: string,
  imageUrl: string,
  options: Omit<
    OpenRouterRequestOptions,
    "messages"
  > = {},
): Promise<OpenRouterResult> {
  const url =
    imageUrl?.trim();

  if (!url) {
    throw new OpenRouterError(
      "A vision request requires an image URL or data URL.",
      {
        status:
          null,
        body:
          "",
        task:
          options.task,
      },
    );
  }

  return callOpenRouter({
    ...options,
    messages: [
      {
        role:
          "user",
        content: [
          {
            type:
              "text",
            text:
              prompt,
          },
          {
            type:
              "image_url",
            image_url: {
              url,
              detail:
                "high",
            },
          },
        ],
      },
    ],
  });
}

export function getOpenRouterStatus() {
  return {
    configured:
      isOpenRouterConfigured(),
    models:
      DEFAULT_MODELS,
  };
    }
