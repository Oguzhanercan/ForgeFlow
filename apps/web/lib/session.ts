import type { SessionBundle } from "@forgeflow/contracts";


export const SESSION_STORAGE_KEY = "forgeflow.activeSessionId";

type EnsureValidSessionArgs = {
  storedSessionId: string | null;
  fetchSessionBundle: (sessionId: string) => Promise<SessionBundle | Record<string, unknown>>;
  createSession: () => Promise<{ id: string }>;
};

function isNotFound(error: unknown) {
  // Treat any API error (4xx/5xx) on session fetch as a signal to create a fresh session.
  // This prevents stale localStorage session IDs from blocking the bootstrap indefinitely.
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("404") || msg.includes("422") || msg.includes("400") || msg.includes("api request failed");
}

export async function ensureValidSession({
  storedSessionId,
  fetchSessionBundle,
  createSession,
}: EnsureValidSessionArgs) {
  if (storedSessionId) {
    try {
      await fetchSessionBundle(storedSessionId);
      return {
        sessionId: storedSessionId,
        replaced: false,
      };
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  const created = await createSession();
  return {
    sessionId: created.id,
    replaced: true,
  };
}
