"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type ShellProps = {
  activeNav: string;
  title: string;
  subtitle?: string;
  statusPill?: string;
  children: ReactNode;
};

const navItems = [
  { label: "Chat", href: "/", glyph: "CH" },
  { label: "Projects", href: "/projects", glyph: "PR" },
  { label: "Runs", href: "/runs", glyph: "RN" },
  { label: "Library", href: "/library", glyph: "LB" },
  { label: "Models", href: "/models", glyph: "MD" },
  { label: "3D Review", href: "/review", glyph: "3D" },
  { label: "Settings", href: "/settings", glyph: "ST" },
];

export function AppShell({ activeNav, title, subtitle, statusPill, children }: ShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [routePending, setRoutePending] = useState(false);
  const activeItem = useMemo(() => navItems.find((item) => item.label === activeNav) ?? navItems[0], [activeNav]);

  useEffect(() => {
    setRoutePending(false);
  }, [activeNav]);

  const humanStatusPill = useMemo(() => {
    if (!statusPill) {
      return null;
    }
    return statusPill
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (segment) => segment.toUpperCase());
  }, [statusPill]);

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(0,209,255,0.16),transparent_58%)]" />
      <div className="pointer-events-none fixed inset-y-0 left-0 hidden w-28 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] lg:block" />
      <div
        className={[
          "fixed left-0 top-0 z-[70] h-0.5 bg-gradient-to-r from-[#63d9ff] to-[#00d1ff] transition-all duration-300",
          routePending ? "w-full opacity-100" : "w-0 opacity-0",
        ].join(" ")}
      />

      <div className="relative flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[84px] flex-col px-3 py-4 lg:flex">
          <div className="rounded-[28px] bg-[#161616]/90 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex h-12 items-center justify-center rounded-2xl bg-[#101112] text-lg font-black tracking-[0.2em] text-[#00d1ff]">
              FF
            </div>
            <nav className="mt-4 flex flex-col gap-2">
              {navItems.map((item) => {
                const active = item.label === activeNav;
                return (
                  <a
                    href={item.href}
                    key={item.label}
                    onClick={() => setRoutePending(true)}
                    className={[
                      "group flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-[10px] font-bold uppercase tracking-[0.18em] transition duration-200",
                      active
                        ? "bg-[#222423] text-[#a4e6ff] shadow-[0_0_0_1px_rgba(164,230,255,0.08),0_20px_50px_rgba(0,209,255,0.08)]"
                        : "text-[#7f9095] hover:bg-[#1b1c1d] hover:text-[#d5f5ff]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-10 w-10 items-center justify-center rounded-2xl text-[11px] tracking-[0.18em]",
                        active ? "bg-[#0d2932] text-[#00d1ff]" : "bg-[#121314] text-current",
                      ].join(" ")}
                    >
                      {item.glyph}
                    </span>
                    <span className="text-center leading-tight">{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[96px]">
          <header className="sticky top-0 z-20 px-3 pt-3 sm:px-4 sm:pt-4 lg:px-6">
            <div className="rounded-[26px] bg-[#171818]/88 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex items-center gap-3 px-3 py-3 sm:px-4 lg:px-5">
                <button
                  aria-label="Toggle navigation"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#111214] text-sm font-bold tracking-[0.18em] text-[#a4e6ff] transition hover:bg-[#1b1e20] lg:hidden"
                  onClick={() => setMobileNavOpen(true)}
                  type="button"
                >
                  {activeItem.glyph}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="hidden h-9 min-w-9 items-center justify-center rounded-2xl bg-[#0d2932] px-3 text-[11px] font-black tracking-[0.24em] text-[#00d1ff] sm:flex">
                      FF
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-headline text-xl font-black tracking-tight text-[#dff7ff] sm:text-2xl">{title}</div>
                      {subtitle ? (
                        <div className="truncate text-[10px] uppercase tracking-[0.22em] text-[#819197] sm:text-[11px]">{subtitle}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {humanStatusPill ? (
                  <div className="max-w-[45vw] rounded-full bg-[#202223] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a4e6ff] sm:max-w-none sm:px-4">
                    <span className="block truncate">{humanStatusPill}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <div className="flex-1 px-3 pb-24 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pb-6">{children}</div>
        </div>
      </div>

      <div
        aria-hidden={!mobileNavOpen}
        className={[
          "fixed inset-0 z-40 bg-[#071116]/70 backdrop-blur-sm transition duration-200 lg:hidden",
          mobileNavOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[340px] bg-[#121314]/96 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition duration-200 lg:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#819197]">Navigation</div>
            <div className="mt-2 font-headline text-2xl font-black text-[#dff7ff]">ForgeFlow</div>
          </div>
          <button
            aria-label="Close navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#191b1d] text-xs font-bold tracking-[0.18em] text-[#a4e6ff]"
            onClick={() => setMobileNavOpen(false)}
            type="button"
          >
            X
          </button>
        </div>
        <nav className="mt-6 flex flex-col gap-2">
          {navItems.map((item) => {
            const active = item.label === activeNav;
            return (
              <a
                href={item.href}
                key={item.label}
                onClick={() => {
                  setRoutePending(true);
                  setMobileNavOpen(false);
                }}
                className={[
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition duration-200",
                  active ? "bg-[#222423] text-[#a4e6ff]" : "bg-[#17191a] text-[#d2d0ce] hover:bg-[#1d1f20]",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-11 w-11 items-center justify-center rounded-2xl text-[11px] font-bold tracking-[0.18em]",
                    active ? "bg-[#0d2932] text-[#00d1ff]" : "bg-[#101112] text-[#93a4a8]",
                  ].join(" ")}
                >
                  {item.glyph}
                </span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-3 z-30 px-3 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-1 overflow-x-auto rounded-[26px] bg-[#171818]/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          {navItems.map((item) => {
            const active = item.label === activeNav;
            return (
              <a
                href={item.href}
                key={item.label}
                onClick={() => setRoutePending(true)}
                className={[
                  "flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition duration-200",
                  active ? "bg-[#222423] text-[#a4e6ff]" : "text-[#809096]",
                ].join(" ")}
              >
                <span className={["rounded-xl px-2 py-1", active ? "bg-[#0d2932] text-[#00d1ff]" : "bg-[#101112]"].join(" ")}>
                  {item.glyph}
                </span>
                <span className={item.label === "3D Review" ? "text-center leading-tight" : "whitespace-nowrap"}>{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
