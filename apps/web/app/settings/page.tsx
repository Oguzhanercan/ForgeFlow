"use client";

import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@forgeflow/ui";

import { apiBaseUrl, fetchProviders, fetchRuns, fetchSessions } from "../../lib/api";
import { detectLocale, formatCapabilityLabel, formatRunStatusLabel, formatShortId } from "../../lib/display";
import { SESSION_STORAGE_KEY } from "../../lib/session";


export default function SettingsPage() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const locale = detectLocale();
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
  });
  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => fetchSessions(),
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
  });

  useEffect(() => {
    setActiveSessionId(window.localStorage.getItem(SESSION_STORAGE_KEY));
  }, []);

  const providers = providersQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  return (
    <AppShell activeNav="Settings" title="ForgeFlow" subtitle="Workspace Settings" statusPill={locale === "tr" ? "Canlı Yapılandırma" : "Live Configuration"}>
      <main className="flex-1 rounded-[30px] bg-[#121314]/94 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-6 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-[24px] bg-[#181a1b] p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Runtime</div>
              <div className="mt-2 text-sm text-[#859399]">
                {locale === "tr"
                  ? "Bu ekran salt-okunur tanılama ve çalışma alanı durumu gösterir."
                  : "This screen provides read-only diagnostics and live workspace status."}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InfoRow label="API Base" value={apiBaseUrl()} />
                <InfoRow label="Active Session" value={formatShortId(activeSessionId)} />
                <InfoRow label="Registered Providers" value={String(providers.length)} />
                <InfoRow label="Runs Tracked" value={String(runs.length)} />
              </div>
            </div>
            <div className="rounded-[24px] bg-[#181a1b] p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Provider Capabilities</div>
              <div className="mt-4 grid gap-3">
                {providers.map((provider) => (
                  <div key={provider.id} className="rounded-[18px] bg-[#101112] px-4 py-3">
                    <div className="font-semibold">{provider.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[#859399]">{formatRunStatusLabel(provider.status, locale)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {provider.capabilities.map((capability) => (
                        <span key={capability} className="rounded-full bg-[#232526] px-3 py-1 text-xs text-[#e5e2e1]">
                          {formatCapabilityLabel(capability, locale)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside className="space-y-6">
            <div className="rounded-[24px] bg-[#181a1b] p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-[#859399]">Workspace Health</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <InfoRow label="Sessions" value={String((sessionsQuery.data ?? []).length)} />
                <InfoRow label="Completed Runs" value={String(runs.filter((run) => run.status === "completed").length)} />
                <InfoRow label="Failed Runs" value={String(runs.filter((run) => run.status === "failed").length)} />
              </div>
            </div>
            <div className="rounded-[24px] bg-[#181a1b] p-6 text-sm text-[#859399]">
              {locale === "tr"
                ? "ForgeFlow bu ekranda oturum, run, provider registry ve kütüphane durumunu canlı API üzerinden okur. Bu yüzden burada görülen veriler gerçek çalışma alanı durumudur."
                : "ForgeFlow reads session, run, provider registry, and library state from the live API. This page reflects the real workspace state."}
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}


function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-[#101112] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#859399]">{label}</div>
      <div className="mt-2 break-all text-sm font-semibold text-[#e5e2e1]">{value}</div>
    </div>
  );
}
