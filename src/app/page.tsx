import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { Workspace } from "@/components/workspace/workspace";
import { listClips } from "@/data/clips";
import { listConnections } from "@/data/connections";
import { getUsage } from "@/data/usage";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) {
    return <main className="auth-page"><Brand /><SignIn /></main>;
  }
  const [clips, connections, usage] = await Promise.all([
    listClips(userId), listConnections(userId), getUsage(userId),
  ]);
  return <Workspace initialClips={clips} initialConnections={connections} initialUsage={usage} />;
}
