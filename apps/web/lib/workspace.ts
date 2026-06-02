import type { SessionSummary } from "@forgeflow/contracts";

export type WorkspaceGroup = {
  workspaceId: string;
  title: string;
  sessions: SessionSummary[];
};

export function defaultWorkspaceIdForSession(session: SessionSummary): string {
  return String(session.metadata?.workspace_id ?? session.id);
}

export function filterVisibleSessions(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.filter((session) => !session.metadata?.archived);
}

export function buildWorkspaceIndex(sessions: SessionSummary[]): WorkspaceGroup[] {
  const grouped = sessions.reduce<Map<string, SessionSummary[]>>((acc, session) => {
    const workspaceId = defaultWorkspaceIdForSession(session);
    const bucket = acc.get(workspaceId) ?? [];
    bucket.push(session);
    acc.set(workspaceId, bucket);
    return acc;
  }, new Map());

  return Array.from(grouped.entries())
    .map(([workspaceId, workspaceSessions]) => {
      const sorted = workspaceSessions
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return {
        workspaceId,
        title: sorted[0]?.title ?? "Workspace",
        sessions: sorted,
      };
    })
    .sort((a, b) => String(b.sessions[0]?.created_at ?? "").localeCompare(String(a.sessions[0]?.created_at ?? "")));
}
