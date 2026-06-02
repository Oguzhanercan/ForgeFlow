import type { AssetGroup } from "@forgeflow/contracts";

import { AppShell } from "./shell";

export function AssetLibrary({ groups }: { groups: AssetGroup[] }) {
  return (
    <AppShell activeNav="Library" title="ForgeFlow" subtitle="Asset Library" statusPill="indexed">
      <main className="flex-1 bg-[#131313] p-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.flatMap((group) =>
            group.items.map((item) => (
              <div key={item.id} className="rounded-xl bg-[#1c1b1b] p-4">
                <div className="aspect-[4/3] rounded-lg bg-[#353534]" />
                <div className="mt-3 text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">{group.title}</div>
              </div>
            ))
          )}
        </div>
      </main>
    </AppShell>
  );
}

