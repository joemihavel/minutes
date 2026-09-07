import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "BAD_REQUEST",
  ) {
    super(message);
  }
}

export function safeErrorDetails(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || !("cause" in current) || !current.cause) break;
    current = current.cause;
  }
  const record = current && typeof current === "object" ? current as Record<string, unknown> : null;
  const rawMessage = current instanceof Error ? current.message : "Unknown error";
  return {
    name: current instanceof Error ? current.name : "UnknownError",
    code: typeof record?.code === "string" ? record.code : undefined,
    statusCode: typeof record?.statusCode === "number" ? record.statusCode : undefined,
    message: rawMessage.split("\nparams:")[0].slice(0, 500),
  };
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "The request contains invalid data.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }
  console.error("Unhandled request error", safeErrorDetails(error));
  return Response.json(
    { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
