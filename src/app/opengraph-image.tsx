import { ImageResponse } from "next/og";

export const alt = "Minutes — speaker-aware audio transcription and notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "72px 78px",
      background: "#f4f4f2",
      color: "#171717",
      fontFamily: "sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, background: "#ff5a0a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 34, fontWeight: 700 }}>m</div>
        <div style={{ fontSize: 47, letterSpacing: "-0.04em" }}>minutes</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 940 }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.02, letterSpacing: "-0.055em", fontWeight: 650 }}><span>Hear every voice.</span><span>Keep every detail.</span></div>
        <div style={{ fontSize: 27, color: "#666666", lineHeight: 1.35 }}>Speaker-aware transcripts and useful summaries for Hindi, English, and Hinglish conversations.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 21, color: "#555555" }}>
        <span style={{ color: "#ff5a0a" }}>●</span> Record · Transcribe · Summarize · Ask
      </div>
    </div>,
    size,
  );
}
