import { Check, CircleCheck, CircleHelp, ListChecks, Sparkles } from "lucide-react";
import { parseSummarySections } from "../lib/summary";

const summarySections = [
  { key: "overview", label: "Overview", icon: Sparkles },
  { key: "key-points", label: "Key points", icon: ListChecks },
  { key: "decisions", label: "Decisions", icon: CircleCheck },
  { key: "action-items", label: "Action items", icon: Check },
  { key: "open-questions", label: "Open questions", icon: CircleHelp },
] as const;

export function SummaryContent({ summary }: { summary: string }) {
  return (
    <div className="summary-sections">
      {parseSummarySections(summary).map((section, index) => {
        const config = summarySections.find(
          (item) => item.label.toLowerCase() === section.title.toLowerCase(),
        ) ?? summarySections[Math.min(index, summarySections.length - 1)];
        const Icon = config.icon;
        const lines = section.body.split("\n").map((line) => line.trim()).filter(Boolean);
        const bullets = lines
          .filter((line) => /^[-*]\s+/.test(line))
          .map((line) => line.replace(/^[-*]\s+/, ""));
        const prose = lines.filter((line) => !/^[-*]\s+/.test(line));
        return (
          <section className={`summary-section tone-${config.key}`} key={`${section.title}-${index}`}>
            <header><span><Icon size={15} /></span><h3>{section.title}</h3></header>
            {prose.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
            {bullets.length > 0 && <ul>{bullets.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ul>}
          </section>
        );
      })}
    </div>
  );
}
