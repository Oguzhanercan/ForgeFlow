import { Coins } from "lucide-react";

export function CreditBadge({ credits }: { credits: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1e1f20] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a4e6ff]">
      <Coins className="h-3 w-3 text-[#00d1ff]" />
      <span>{credits.toLocaleString()}</span>
    </span>
  );
}
