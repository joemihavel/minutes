import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return <main className="message-page"><Brand /><div><span>404</span><h1>Nothing recorded here.</h1><p>This page may have moved or the shared transcript is no longer available.</p><Link className="button dark" href="/">Back to Minutes</Link></div></main>;
}
