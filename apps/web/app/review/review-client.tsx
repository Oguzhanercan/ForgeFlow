"use client";

import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ReviewViewer3D } from "@forgeflow/ui";

import { artifactDownloadUrl, fetchAsset } from "../../lib/api";
import { detectLocale, formatRunStatusLabel } from "../../lib/display";

function ReviewErrorState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 rounded-[30px] bg-[#121314]/94 p-6 text-center shadow-[0_30px_120px_rgba(0,0,0,0.42)]">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#7f9095]">Review Unavailable</div>
        <div className="mt-3 text-2xl font-black text-[#e7faff]">{title}</div>
        <div className="mt-3 max-w-xl text-sm text-[#859399]">{description}</div>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <a className="rounded-full bg-[#101112] px-4 py-3 text-sm font-semibold text-[#a4e6ff]" href="/library">
          Library
        </a>
        <a className="rounded-full bg-[#101112] px-4 py-3 text-sm font-semibold text-[#dff7ff]" href="/">
          Chat
        </a>
      </div>
    </div>
  );
}

export function ReviewClient() {
  const params = useSearchParams();
  const locale = detectLocale();
  const assetId = params.get("assetId");

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => fetchAsset(assetId!),
    enabled: Boolean(assetId),
    retry: false,
  });

  if (!assetId) {
    return (
      <ReviewErrorState
        description={
          locale === "tr"
            ? "İnceleme ekranı açıldı fakat geçerli bir asset kimliği verilmedi."
            : "The review screen opened without a valid asset id."
        }
        title={locale === "tr" ? "Asset seçilmedi" : "No asset selected"}
      />
    );
  }

  if (assetQuery.isError) {
    const isNotFound = assetQuery.error instanceof Error && assetQuery.error.message.includes("404");
    return (
      <ReviewErrorState
        description={
          isNotFound
            ? locale === "tr"
              ? "İstenen asset bulunamadı. Kütüphaneden başka bir asset seçebilir veya sohbete dönüp yeni üretim başlatabilirsin."
              : "The requested asset could not be found. Pick another one from the library or return to chat."
            : locale === "tr"
              ? "Asset metadata alınırken bir hata oluştu."
              : "An error occurred while loading the asset metadata."
        }
        title={isNotFound ? (locale === "tr" ? "Asset bulunamadı" : "Asset not found") : (locale === "tr" ? "Yükleme hatası" : "Loading error")}
      />
    );
  }

  const asset = assetQuery.data;
  if (!asset) {
    return (
      <ReviewErrorState
        description={locale === "tr" ? "Asset metadata yükleniyor." : "Loading asset metadata."}
        title={locale === "tr" ? "Yükleniyor" : "Loading"}
      />
    );
  }

  const formatLabel = asset.path.split(".").pop()?.toUpperCase() ?? "GLB";
  const sourceLabel = asset.metadata?.provider_id ? `Provider ${String(asset.metadata.provider_id)}` : "ForgeFlow Artifact";

  return (
    <ReviewViewer3D
      allowPreviewFallback={false}
      formatLabel={formatLabel}
      modelLabel={asset.title}
      modelUrl={artifactDownloadUrl(asset.id)}
      reviewStatus={formatRunStatusLabel(asset.status, locale)}
      sourceLabel={sourceLabel}
      technicalNotes={`${asset.kind} • ${asset.stage} • ${asset.mime_type ?? formatLabel}`}
    />
  );
}
