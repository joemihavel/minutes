import "server-only";

import { getProviderConfig, listConnections } from "@/data/connections";
import type { Provider } from "@/lib/types";
import { AppError } from "@/lib/server/errors";

export async function getTranscriptionProvider(userId: string) {
  const connections = await listConnections(userId);
  const provider: Provider | null = connections.some(
    (connection) => connection.provider === "google" && connection.connected,
  )
    ? "google"
    : connections.some(
          (connection) => connection.provider === "groq" && connection.connected,
        )
      ? "groq"
      : null;

  if (!provider) {
    throw new AppError(
      "Connect Google AI or Groq before transcribing audio.",
      409,
      "PROVIDER_NOT_CONNECTED",
    );
  }

  const config = await getProviderConfig(userId, provider);
  const model = config.models.transcription;
  if (!model) {
    throw new AppError(
      "Choose a transcription model before continuing.",
      409,
      "MODEL_REQUIRED",
    );
  }

  return { provider, apiKey: config.apiKey, model };
}
