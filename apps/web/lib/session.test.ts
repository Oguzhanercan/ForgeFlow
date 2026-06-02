import { describe, expect, test, vi } from "vitest";

import { ensureValidSession } from "./session";


describe("ensureValidSession", () => {
  test("returns stored session when it still exists", async () => {
    const result = await ensureValidSession({
      storedSessionId: "session_live",
      fetchSessionBundle: vi.fn().mockResolvedValue({}),
      createSession: vi.fn(),
    });

    expect(result.sessionId).toBe("session_live");
    expect(result.replaced).toBe(false);
  });

  test("creates a new session when storage is empty", async () => {
    const result = await ensureValidSession({
      storedSessionId: null,
      fetchSessionBundle: vi.fn(),
      createSession: vi.fn().mockResolvedValue({ id: "session_new" }),
    });

    expect(result.sessionId).toBe("session_new");
    expect(result.replaced).toBe(true);
  });

  test("replaces stale session when backend returns 404", async () => {
    const result = await ensureValidSession({
      storedSessionId: "session_stale",
      fetchSessionBundle: vi.fn().mockRejectedValue(new Error("API request failed: 404")),
      createSession: vi.fn().mockResolvedValue({ id: "session_fresh" }),
    });

    expect(result.sessionId).toBe("session_fresh");
    expect(result.replaced).toBe(true);
  });
});
