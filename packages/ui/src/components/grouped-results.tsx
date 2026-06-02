import type { AssetGroup } from "@forgeflow/contracts";

import { AppShell } from "./shell";

export function GroupedResultsWorkspace({ groups }: { groups: AssetGroup[] }) {
  return (
    <AppShell activeNav="Runs" title="ForgeFlow" subtitle="Grouped Results" statusPill="run complete">
      <main className="flex-1 bg-[#131313] p-8">
        <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
          <section className="space-y-8">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#a4e6ff]">
                  {group.title}
                </div>
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-xl bg-[#1c1b1b] p-4">
                      <div className="aspect-square rounded-lg bg-[#353534]" />
                      <div className="mt-3 font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">
                        {item.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <aside className="rounded-xl bg-[#1c1b1b] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">Inspector</div>
            <div className="mt-4 space-y-3 text-sm text-[#e5e2e1]">
              <div>Group-level review</div>
              <div className="rounded-lg bg-[#2a2a2a] p-4 text-[#859399]">Accept, reject, refine, annotate, rerun stage.</div>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

