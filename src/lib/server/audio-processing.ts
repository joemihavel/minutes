import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { AppError } from "./errors";
import {
  GROQ_DIRECT_UPLOAD_BYTES,
  MAX_AUDIO_DURATION_SECONDS,
} from "@/lib/limits";

export type AudioChunk = {
  audio: Buffer;
  offsetSeconds: number;
  filename: string;
  mediaType: string;
};

const DEFAULT_CHUNK_SECONDS = 10 * 60;

function executablePath() {
  if (!ffmpegPath) throw new Error("FFmpeg is unavailable on this platform.");
  return ffmpegPath;
}

function runFfmpeg(args: string[], timeout: number) {
  const executable = executablePath();
  return new Promise<{ stderr: string }>((resolve, reject) => {
    execFile(
      executable,
      args,
      { timeout, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" },
      (error, _stdout, stderr) => {
        if (error) reject(Object.assign(error, { stderr }));
        else resolve({ stderr });
      },
    );
  });
}

async function readDuration(inputPath: string) {
  const executable = executablePath();
  const stderr = await new Promise<string>((resolve) => {
    execFile(
      executable,
      ["-nostdin", "-hide_banner", "-i", inputPath],
      { timeout: 15_000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" },
      (_error, _stdout, output) => resolve(output),
    );
  });
  const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!match) throw new AppError("The recording duration could not be read.", 422, "AUDIO_UNREADABLE");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function createTranscriptionChunks(
  audio: Buffer,
  filename: string,
  mediaType: string,
  options: { chunkSeconds?: number; maxDirectBytes?: number } = {},
) {
  const chunkSeconds = options.chunkSeconds ?? DEFAULT_CHUNK_SECONDS;
  const maxDirectBytes = options.maxDirectBytes ?? GROQ_DIRECT_UPLOAD_BYTES;
  const directory = await mkdtemp(join(tmpdir(), "minutes-audio-"));
  const extension = extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".audio";
  const inputPath = join(directory, `input${extension}`);
  try {
    await writeFile(inputPath, audio);
    const duration = await readDuration(inputPath);
    if (duration > MAX_AUDIO_DURATION_SECONDS) {
      throw new AppError(
        "Recordings can be up to 4 hours long on the free tier.",
        413,
        "AUDIO_TOO_LONG",
      );
    }
    if (
      audio.byteLength <= maxDirectBytes &&
      duration <= chunkSeconds &&
      !mediaType.startsWith("video/")
    ) {
      await rm(directory, { recursive: true, force: true });
      return {
        chunks: [{ audio, offsetSeconds: 0, filename, mediaType }],
        durationSeconds: duration,
        cleanup: async () => undefined,
      };
    }
    await runFfmpeg(
      [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-i", inputPath,
        "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "flac",
        "-f", "segment", "-segment_time", String(chunkSeconds),
        "-reset_timestamps", "1", join(directory, "chunk-%03d.flac"),
      ],
      180_000,
    );
    const names = (await readdir(directory)).filter((name) => name.startsWith("chunk-")).sort();
    if (!names.length) throw new AppError("No audio track was found in this file.", 422, "AUDIO_TRACK_MISSING");
    const chunks: AudioChunk[] = [];
    for (const [index, name] of names.entries()) {
      const chunk = await readFile(join(directory, name));
      if (chunk.byteLength > maxDirectBytes) {
        throw new AppError("This recording could not be split into safe transcription chunks.", 422, "CHUNK_TOO_LARGE");
      }
      chunks.push({
        audio: chunk,
        offsetSeconds: index * chunkSeconds,
        filename: name,
        mediaType: "audio/flac",
      });
    }
    return {
      chunks,
      durationSeconds: duration,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
