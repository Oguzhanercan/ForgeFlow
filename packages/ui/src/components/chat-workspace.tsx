import type { AssetGroup, ChatCardMessage, ReviewOption } from "@forgeflow/contracts";

import { AppShell } from "./shell";

type ChatWorkspaceProps = {
  sessionTitle: string;
  runStatus: string;
  messages: ChatCardMessage[];
  reviewOptions: ReviewOption[];
  imageGroups: AssetGroup[];
  modelSummary: {
    planner: string;
    image: string;
    object3d: string;
  };
};

export function ChatWorkspace(props: ChatWorkspaceProps) {
  return (
    <AppShell activeNav="Chat" title="ForgeFlow" subtitle="Chat Workspace" statusPill={props.runStatus}>
      <main className="flex flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col bg-[#0e0e0e]">
          <div className="border-b border-white/5 px-8 py-5">
            <div className="text-lg font-bold">{props.sessionTitle}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">
              Planner {props.modelSummary.planner} · Image {props.modelSummary.image} · 3D {props.modelSummary.object3d}
            </div>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-8 py-6">
            {props.messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "ml-auto max-w-3xl" : "max-w-4xl"}
              >
                <div
                  className={[
                    "rounded-xl px-5 py-4",
                    message.role === "user" ? "bg-[#2a2a2a]" : "bg-[#1c1b1b]"
                  ].join(" ")}
                >
                  <div className="text-sm leading-6">{message.content}</div>
                  {message.planSummary ? (
                    <div className="mt-3 rounded-lg bg-[#131313] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#a4e6ff]">
                      {message.planSummary}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-[#1c1b1b] p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">
                Choose Review Mode
              </div>
              <div className="flex flex-wrap gap-2">
                {props.reviewOptions.map((option) => (
                  <button
                    key={option}
                    className="rounded-full bg-[#2a2a2a] px-4 py-2 text-xs font-semibold text-[#a4e6ff]"
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            {props.imageGroups.map((group) => (
              <div key={group.title} className="rounded-xl bg-[#1c1b1b] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-bold text-[#a4e6ff]">{group.title}</div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[#859399]">
                    {group.items.length} items
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-xl bg-[#2a2a2a] p-4">
                      <div className="aspect-[4/3] rounded-lg bg-[#353534]" />
                      <div className="mt-3 text-sm font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">
                        {item.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        <aside className="w-[360px] border-l border-white/5 bg-[#1c1b1b] p-5">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#859399]">Live Sidecar</div>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-[#2a2a2a] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Active Models</div>
              <div className="mt-3 text-sm">Planner: {props.modelSummary.planner}</div>
              <div className="mt-1 text-sm">Image: {props.modelSummary.image}</div>
              <div className="mt-1 text-sm">3D: {props.modelSummary.object3d}</div>
            </div>
            <div className="rounded-xl bg-[#2a2a2a] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Output Groups</div>
              <div className="mt-3 space-y-2">
                {props.imageGroups.map((group) => (
                  <div key={group.title} className="flex items-center justify-between text-sm">
                    <span>{group.title}</span>
                    <span className="text-[#859399]">{group.items.length}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </AppShell>
  );
}

