import { describe, expect, test } from "vitest";

import { buildWorkspaceIndex, defaultWorkspaceIdForSession, filterVisibleSessions } from "./workspace";


describe("workspace helpers", () => {
  const sessions = [
    {
      id: "session_a",
      title: "Ottoman Castle Concepts",
      created_at: "2026-04-12T08:00:00Z",
      metadata: { workspace_id: "ws_empire" },
    },
    {
      id: "session_b",
      title: "Shield Variants",
      created_at: "2026-04-12T09:00:00Z",
      metadata: { workspace_id: "ws_empire" },
    },
    {
      id: "session_c",
      title: "Archived Chat",
      created_at: "2026-04-12T10:00:00Z",
      metadata: { workspace_id: "ws_empire", archived: true },
    },
    {
      id: "session_d",
      title: "Venetian Port Props",
      created_at: "2026-04-12T11:00:00Z",
      metadata: {},
    },
  ];

  test("filters archived sessions from the visible rail", () => {
    const visible = filterVisibleSessions(sessions);
    expect(visible.map((session) => session.id)).toEqual(["session_a", "session_b", "session_d"]);
  });

  test("groups sessions by workspace and sorts newest first", () => {
    const groups = buildWorkspaceIndex(filterVisibleSessions(sessions));
    expect(groups).toHaveLength(2);
    expect(groups[0].workspaceId).toBe("session_d");
    expect(groups[1].workspaceId).toBe("ws_empire");
    expect(groups[1].sessions.map((session) => session.id)).toEqual(["session_b", "session_a"]);
  });

  test("falls back to session id when workspace id is absent", () => {
    expect(defaultWorkspaceIdForSession(sessions[3])).toBe("session_d");
  });
});
