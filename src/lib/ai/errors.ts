// Error helpers shared by the AI provider code.

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI is not set up yet. Add GEMINI_API_KEY to the server settings.");
    this.name = "AiNotConfiguredError";
  }
}

// The free tier allows a limited number of requests per minute and per day.
export class AiRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number, message = "The AI service is busy (free-tier limit).") {
    super(message);
    this.name = "AiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function statusOf(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Gemini puts the suggested wait in the error body, e.g. "retryDelay": "23s".
export function retryDelayMs(error: unknown, fallbackMs = 20_000): number {
  const match = messageOf(error).match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/);
  if (match) return Math.ceil(Number(match[1]) * 1000) + 500;
  return fallbackMs;
}

export function isRateLimit(error: unknown): boolean {
  const status = statusOf(error);
  return (
    status === 429 ||
    /RESOURCE_EXHAUSTED|rate limit|quota/i.test(messageOf(error))
  );
}

// Errors where trying another model makes sense.
export function isModelUnavailable(error: unknown): boolean {
  const status = statusOf(error);
  return status === 404 || status === 503 || status === 500 || /not found|UNAVAILABLE|overloaded/i.test(messageOf(error));
}

// Short, safe text for the user. No keys or internals.
export function friendlyAiError(error: unknown): string {
  if (error instanceof AiNotConfiguredError) return error.message;
  if (error instanceof AiRateLimitError || isRateLimit(error)) {
    return "The free AI limit was reached for now. Please try again in a minute.";
  }
  const status = statusOf(error);
  if (status === 400 && /API key/i.test(messageOf(error))) {
    return "The Gemini API key is not valid. Check GEMINI_API_KEY.";
  }
  if (status === 403) return "The Gemini API key does not have access. Check GEMINI_API_KEY.";
  return "The AI service could not finish this request. Please try again.";
}
