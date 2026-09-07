import "server-only";

import { auth } from "@clerk/nextjs/server";
import { AppError } from "./errors";

export async function requireUserId() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    throw new AppError("Please sign in to continue.", 401, "UNAUTHORIZED");
  }
  return userId;
}
