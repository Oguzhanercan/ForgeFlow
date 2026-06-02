import type { ProviderModel } from "@forgeflow/contracts";

import { AppShell } from "./shell";

type ModelsDashboardProps = {
  providers: ProviderModel[];
};

export function ModelsDashboard({ providers }: ModelsDashboardProps) {
  return (
    <AppShell activeNav="Models" title="ForgeFlow" subtitle="Models & Providers" statusPill="registry online">
      <main className="flex-1 bg-[#131313] px-8 py-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="font-headline text-4xl font-black tracking-tight">Model Foundry</div>
            <div className="mt-2 text-sm text-[#859399]">
              Register local Hugging Face models, OpenRouter adapters, and stage overrides.
            </div>
          </div>
          <button className="rounded-lg bg-gradient-to-br from-[#a4e6ff] to-[#00d1ff] px-5 py-3 text-sm font-bold text-[#003543]">
            Add Model
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => (
            <div key={provider.id} className="rounded-xl bg-[#1c1b1b] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold">{provider.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#859399]">
                    {provider.sourceKind ?? provider.source_kind}
                  </div>
                </div>
                <div className="rounded-full bg-[#2a2a2a] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#a4e6ff]">
                  {provider.status}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {provider.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full bg-[#2a2a2a] px-3 py-1 text-xs text-[#e5e2e1]"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}

