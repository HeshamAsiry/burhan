export function providerTimeoutMs(envName: string, fallbackMs = 20000) {
  const raw = Number(process.env[envName] ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return fallbackMs;
  return Math.min(Math.floor(raw), 120000);
}

export async function fetchWithProviderTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  envName: string,
) {
  const controller = new AbortController();
  const timeoutMs = providerTimeoutMs(envName);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Provider request timed out after " + timeoutMs + "ms.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
