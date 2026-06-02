import { AppShell } from "./shell";

export function SettingsPanel() {
  return (
    <AppShell activeNav="Settings" title="ForgeFlow" subtitle="Settings" statusPill="workspace defaults">
      <main className="flex-1 bg-[#131313] p-8">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl bg-[#1c1b1b] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">Review Defaults</div>
            <div className="mt-4 text-sm text-[#e5e2e1]">Default review mode, auto-open grouped results, VLM enablement.</div>
          </div>
          <div className="rounded-xl bg-[#1c1b1b] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#859399]">Runtime</div>
            <div className="mt-4 text-sm text-[#e5e2e1]">Filesystem artifacts, local cache roots, GPU safety caps, worker polling interval.</div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

