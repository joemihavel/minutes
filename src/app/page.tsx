import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { listClips } from "@/data/clips";
import { listConnections } from "@/data/connections";
import { listCustomModels } from "@/data/custom-models";
import { getUsage } from "@/data/usage";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const [clips, connections, customModels, usage] = await Promise.all([
    listClips(userId), listConnections(userId), listCustomModels(userId), getUsage(userId),
  ]);
  return <Workspace initialClips={clips} initialConnections={connections} initialCustomModels={customModels} initialUsage={usage} />;
}
