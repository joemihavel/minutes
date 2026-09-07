"use client";

import { useState } from "react";
import { Check, Copy, FileText, Share2, Sparkles } from "lucide-react";
import { AudioPlayer } from "@/components/elevenlabs-ui/audio-player";
import { SummaryContent } from "@/components/summary-content";
import { sanitizeGeneratedSummary } from "@/lib/summary";
import type { TranscriptSegment } from "@/lib/types";

type View = "summary" | "transcript";

function stamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function PublicDocument({
  slug,
  title,
  transcript,
  summary,
  segments,
  durationSeconds,
  language,
  createdAt,
  includeAudio,
  initialView,
}: {
  slug: string;
  title: string;
  transcript: string;
  summary: string;
  segments: TranscriptSegment[];
  durationSeconds: number | null;
  language: string | null;
  createdAt: string;
  includeAudio: boolean;
  initialView: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [copied, setCopied] = useState(false);
  const content = view === "summary" ? sanitizeGeneratedSummary(summary) : transcript;
  const speakerTones = new Map<string, number>();

  async function copyContent() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareView() {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (navigator.share) {
      try {
        await navigator.share({ title, url: url.toString() });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="public-document">
      <div className="public-document-heading">
        <div>
          <h1>{title}</h1>
          <p className="share-meta">{durationSeconds ? `${stamp(durationSeconds)} · ` : ""}{language ?? "Auto-detected"} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(createdAt))}</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void shareView()}><Share2 size={15} />Share</button>
      </div>
      {includeAudio && <AudioPlayer id={slug} title={title} src={`/api/share/${slug}/audio`} />}
      <div className="document-switcher public-switcher">
        <div className="document-tabs" role="tablist" aria-label="Shared recording content">
          {summary && <button role="tab" aria-controls="shared-recording-content" aria-selected={view === "summary"} className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}><Sparkles size={14} />Summary</button>}
          <button role="tab" aria-controls="shared-recording-content" aria-selected={view === "transcript"} className={view === "transcript" ? "active" : ""} onClick={() => setView("transcript")}><FileText size={14} />Transcript</button>
        </div>
        <div className="document-tools"><button type="button" onClick={() => void copyContent()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button></div>
      </div>
      <div className="document-content" id="shared-recording-content" role="tabpanel" aria-label={view === "summary" ? "Detailed summary" : "Transcript"}>
        {view === "summary" && summary ? <SummaryContent summary={summary} /> : segments.length ? <div className="public-segments">{segments.map((segment, index) => {
          const speaker = segment.speaker?.trim();
          if (speaker && !speakerTones.has(speaker)) speakerTones.set(speaker, speakerTones.size % 4);
          const tone = speaker ? speakerTones.get(speaker) ?? 0 : index % 4;
          return <p className={`tone-${tone}`} key={`${segment.startSecond}-${index}`}><time>{stamp(segment.startSecond)}</time><span className="segment-copy">{speaker && <small>{speaker}</small>}{segment.text}</span></p>;
        })}</div> : <div className="public-copy">{transcript}</div>}
      </div>
    </article>
  );
}
