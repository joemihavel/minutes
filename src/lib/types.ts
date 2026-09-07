export type Provider = "groq" | "google";
export type ChatProvider = Provider | `custom:${string}`;
export type ModelCapability = "transcription" | "chat";
export type ClipStatus = "uploading" | "transcribing" | "ready" | "failed";

export type TranscriptSegment = {
  text: string;
  startSecond: number;
  endSecond: number;
  speaker?: string | null;
};

export type ClipDTO = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
  transcript: string;
  summary: string;
  segments: TranscriptSegment[];
  language: string | null;
  status: ClipStatus;
  errorMessage: string | null;
  hasAudio: boolean;
  shareSlug: string | null;
  shareIncludesAudio: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConnectionDTO = {
  provider: Provider;
  connected: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  models: {
    transcription: string | null;
    chat: string | null;
  };
};

export type CustomModelDTO = {
  id: string;
  name: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  keyHint: string;
  updatedAt: string;
};

export type UsageDTO = {
  transcriptionSecondsToday: number;
  transcriptionRequestsToday: number;
  chatRequestsToday: number;
  inputTokensToday: number;
  outputTokensToday: number;
  storedBytes: number;
};
