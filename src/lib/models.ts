import type { ModelCapability, Provider } from "@/lib/types";

export const DEFAULT_MODELS: Record<Provider, Partial<Record<ModelCapability, string>>> = {
  groq: {
    transcription: "whisper-large-v3",
    chat: "qwen/qwen3.6-27b",
  },
  google: {
    transcription: "gemini-3.5-transcribe",
    chat: "gemini-3.8-flash",
  },
};

export const MODEL_OPTIONS: Record<Provider, Partial<Record<ModelCapability, string[]>>> = {
  groq: {
    transcription: ["whisper-large-v3", "whisper-large-v3-turbo"],
    chat: ["qwen/qwen3.6-27b"],
  },
  google: {
    transcription: ["gemini-3.5-transcribe"],
    chat: ["gemini-3.8-flash"],
  },
};

export function defaultModel(provider: Provider, capability: ModelCapability) {
  return DEFAULT_MODELS[provider][capability] ?? null;
}
