import type { Run } from "@forgeflow/contracts";

import { AppShell } from "./shell";

export function RunsDashboard({ runs }: { runs: Run[] }) {
  return (
    <AppShell activeNav="Runs" title="ForgeFlow" subtitle="Runs Dashboard" statusPill={`${runs.length} runs`}>
      <main className="flex-1 bg-[#131313] p-8">
        <div className="overflow-hidden rounded-xl bg-[#1c1b1b]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#2a2a2a] text-xs uppercase tracking-[0.16em] text-[#859399]">
              <tr>
                <th className="px-4 py-3">Run</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Grouping</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-white/5">
                  <td className="px-4 py-3">{run.id}</td>
                  <td className="px-4 py-3">{run.intent_type}</td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">{run.grouping_strategy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}

