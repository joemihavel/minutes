import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { PublicDocument } from "@/components/share/public-document";
import { getPublicShare, recordShareView } from "@/data/clips";

export const metadata: Metadata = { title: "Shared transcript", robots: { index: false, follow: false } };

export default async function SharedTranscript({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  let item;
  try { item = await getPublicShare(slug); } catch { notFound(); }
  after(() => recordShareView(slug));
  return <main className="share-page">
    <header><Brand/><span>Public transcript</span></header>
    <PublicDocument {...item} slug={slug} initialView={query.view === "transcript" || !item.summary ? "transcript" : "summary"} />
    <footer>Shared securely with Minutes</footer>
  </main>;
}
