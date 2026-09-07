import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Minutes — AI audio notes",
    short_name: "Minutes",
    description:
      "Record, transcribe, summarize, and chat with Hindi, English, and Hinglish conversations.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f2",
    theme_color: "#ff5a0a",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
