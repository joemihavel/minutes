import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelCapability, Provider } from "@/lib/types";
import { AppError } from "./errors";

export function groqProvider(apiKey: string) {
  return createGroq({ apiKey });
}

export function googleProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

export function openAICompatibleProvider(input: {
  apiKey: string;
  baseUrl: string;
  providerName: string;
}) {
  return createOpenAICompatible({
    apiKey: input.apiKey,
    baseURL: input.baseUrl,
    name: input.providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom",
  });
}

export async function validateOpenAICompatibleModel(baseUrl: string, apiKey: string, modelId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new AppError("That API key or endpoint could not be verified.", 422, "INVALID_CUSTOM_PROVIDER");
    }
    const payload = await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
    if (payload?.data?.length && !payload.data.some((model) => model.id === modelId)) {
      throw new AppError("That model ID is not available at this endpoint.", 422, "MODEL_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("The custom provider could not be reached. Check its HTTPS base URL.", 503, "CUSTOM_PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateProviderKey(provider: Provider, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      provider === "groq"
        ? "https://api.groq.com/openai/v1/models"
        : "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      {
        headers:
          provider === "groq"
            ? { Authorization: `Bearer ${apiKey}` }
            : { "x-goog-api-key": apiKey },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new AppError(
        `That ${provider === "groq" ? "Groq" : "Google AI"} key could not be verified.`,
        422,
        "INVALID_PROVIDER_KEY",
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "The provider could not be reached. Please try again.",
      503,
      "PROVIDER_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateProviderModel(
  provider: Provider,
  apiKey: string,
  modelId: string,
  capability: ModelCapability,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const normalized = modelId.replace(/^models\//, "");
  try {
    const response = await fetch(
      provider === "groq"
        ? `https://api.groq.com/openai/v1/models/${encodeURIComponent(modelId)}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalized)}`,
      {
        headers: provider === "groq"
          ? { Authorization: `Bearer ${apiKey}` }
          : { "x-goog-api-key": apiKey },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new AppError("That model is not available to this provider account.", 422, "MODEL_UNAVAILABLE");
    }
    if (provider === "groq") {
      const looksLikeWhisper = modelId.toLowerCase().includes("whisper");
      if ((capability === "transcription") !== looksLikeWhisper) {
        throw new AppError(
          capability === "transcription" ? "Choose a Groq Whisper model for transcription." : "Choose a Groq language model for chat.",
          422,
          "MODEL_CAPABILITY_MISMATCH",
        );
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("The provider could not verify that model. Please try again.", 503, "PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
