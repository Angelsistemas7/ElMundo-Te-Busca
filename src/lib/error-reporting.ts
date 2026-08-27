import "server-only";

type ErrorContext = Record<string, string | number | boolean | null | undefined>;

function errorDetails(error: unknown): Record<string, string | number> {
  if (error instanceof Error) {
    const message = error.message
      .replace(/([?&](?:api_?key|apikey|key|token|secret)=)[^&\s]+/gi, "$1[redacted]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    return { name: error.name, message: message.slice(0, 500) };
  }
  if (typeof error === "object" && error !== null) {
    const value = error as { code?: unknown; status?: unknown };
    return {
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      ...(typeof value.status === "number" ? { status: value.status } : {}),
    };
  }
  return { name: "UnknownError" };
}

export function reportServerError(context: string, error: unknown, details: ErrorContext = {}): void {
  console.error(`[${context}]`, { ...details, ...errorDetails(error) });
}

export async function withServerFallback<T>(
  context: string,
  operation: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    reportServerError(context, error);
    return fallback;
  }
}
