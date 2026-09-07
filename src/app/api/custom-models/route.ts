import { deleteCustomModel, listCustomModels, saveCustomModel } from "@/data/custom-models";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { validateOpenAICompatibleModel } from "@/lib/server/providers";
import { customModelSchema, parseJson, uuidSchema } from "@/lib/server/validation";

export async function GET() {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    return Response.json({ models: await listCustomModels(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const input = await parseJson(request, customModelSchema);
    await validateOpenAICompatibleModel(input.baseUrl, input.apiKey, input.modelId);
    await saveCustomModel({ userId, ...input });
    return Response.json({ models: await listCustomModels(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const id = uuidSchema.parse(new URL(request.url).searchParams.get("id"));
    await deleteCustomModel(userId, id);
    return Response.json({ models: await listCustomModels(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
