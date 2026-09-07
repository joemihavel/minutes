import { deleteConnection, getProviderKey, listConnections, saveConnection, updateConnectionModel } from "@/data/connections";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { validateProviderKey, validateProviderModel } from "@/lib/server/providers";
import { connectionSchema, modelUpdateSchema, parseJson, providerSchema } from "@/lib/server/validation";

export async function GET() {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    return Response.json({ connections: await listConnections(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const { provider, apiKey } = await parseJson(request, connectionSchema);
    await validateProviderKey(provider, apiKey);
    await saveConnection(userId, provider, apiKey);
    return Response.json({ connections: await listConnections(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const { provider, capability, modelId } = await parseJson(request, modelUpdateSchema);
    const apiKey = await getProviderKey(userId, provider);
    await validateProviderModel(provider, apiKey, modelId, capability);
    await updateConnectionModel(userId, provider, capability, modelId);
    return Response.json({ connections: await listConnections(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const provider = providerSchema.parse(new URL(request.url).searchParams.get("provider"));
    await deleteConnection(userId, provider);
    return Response.json({ connections: await listConnections(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
