export type AppLocale = "tr" | "en";

type LabelKey =
  | "intent.chat_only"
  | "intent.single_object_image"
  | "intent.single_object_3d"
  | "intent.image_plus_3d"
  | "intent.asset_pack"
  | "intent.mixed_request"
  | "capability.text_chat"
  | "capability.planner_text"
  | "capability.image_generation"
  | "capability.image_editing"
  | "capability.vision_review"
  | "capability.object3d_generation"
  | "source.local_hf_transformers"
  | "source.local_hf_diffusers"
  | "source.local_custom"
  | "source.api_openrouter"
  | "source.api_generic"
  | "run.completed"
  | "run.failed"
  | "run.running"
  | "run.queued"
  | "run.retry_queued"
  | "run.awaiting_review_mode"
  | "run.review_rejected";

const dictionary: Record<AppLocale, Record<LabelKey, string>> = {
  tr: {
    "intent.chat_only": "Sohbet",
    "intent.single_object_image": "Tek Obje Görseli",
    "intent.single_object_3d": "Tek 3D Obje",
    "intent.image_plus_3d": "Görselden 3D",
    "intent.asset_pack": "Asset Paketi",
    "intent.mixed_request": "Karma İstek",
    "capability.text_chat": "Metin Sohbeti",
    "capability.planner_text": "Planlayıcı Metin",
    "capability.image_generation": "Görsel Üretimi",
    "capability.image_editing": "Görsel Düzenleme",
    "capability.vision_review": "Görsel İnceleme",
    "capability.object3d_generation": "3D Obje Üretimi",
    "source.local_hf_transformers": "Lokal Transformers",
    "source.local_hf_diffusers": "Lokal Diffusers",
    "source.local_custom": "Lokal Özel Runtime",
    "source.api_openrouter": "OpenRouter API",
    "source.api_generic": "Genel API",
    "run.completed": "Tamamlandı",
    "run.failed": "Başarısız",
    "run.running": "Çalışıyor",
    "run.queued": "Sırada",
    "run.retry_queued": "Tekrar Sırada",
    "run.awaiting_review_mode": "İnceleme Bekleniyor",
    "run.review_rejected": "İnceleme Reddedildi",
  },
  en: {
    "intent.chat_only": "Chat",
    "intent.single_object_image": "Single Object Image",
    "intent.single_object_3d": "Single 3D Object",
    "intent.image_plus_3d": "Image to 3D",
    "intent.asset_pack": "Asset Pack",
    "intent.mixed_request": "Mixed Request",
    "capability.text_chat": "Text Chat",
    "capability.planner_text": "Planner Text",
    "capability.image_generation": "Image Generation",
    "capability.image_editing": "Image Editing",
    "capability.vision_review": "Vision Review",
    "capability.object3d_generation": "3D Object Generation",
    "source.local_hf_transformers": "Local Transformers",
    "source.local_hf_diffusers": "Local Diffusers",
    "source.local_custom": "Local Custom Runtime",
    "source.api_openrouter": "OpenRouter API",
    "source.api_generic": "Generic API",
    "run.completed": "Completed",
    "run.failed": "Failed",
    "run.running": "Running",
    "run.queued": "Queued",
    "run.retry_queued": "Retry Queued",
    "run.awaiting_review_mode": "Awaiting Review",
    "run.review_rejected": "Review Rejected",
  },
};

function lookup(key: LabelKey, locale: AppLocale): string {
  return dictionary[locale][key];
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase());
}

export function detectLocale(): AppLocale {
  return "en";
}

export function formatIntentLabel(value: string | null | undefined, locale: AppLocale = detectLocale()): string {
  if (!value) {
    return locale === "tr" ? "Bilinmiyor" : "Unknown";
  }
  return (dictionary[locale] as Record<string, string>)[`intent.${value}`] ?? titleCase(value);
}

export function formatCapabilityLabel(value: string | null | undefined, locale: AppLocale = detectLocale()): string {
  if (!value) {
    return locale === "tr" ? "Bilinmiyor" : "Unknown";
  }
  return (dictionary[locale] as Record<string, string>)[`capability.${value}`] ?? titleCase(value);
}

export function formatSourceKindLabel(value: string | null | undefined, locale: AppLocale = detectLocale()): string {
  if (!value) {
    return locale === "tr" ? "Bilinmiyor" : "Unknown";
  }
  return (dictionary[locale] as Record<string, string>)[`source.${value}`] ?? titleCase(value);
}

export function formatRunStatusLabel(value: string | null | undefined, locale: AppLocale = detectLocale()): string {
  if (!value) {
    return locale === "tr" ? "Bilinmiyor" : "Unknown";
  }
  return (dictionary[locale] as Record<string, string>)[`run.${value}`] ?? titleCase(value);
}

export function formatShortId(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return value.length <= 12 ? value : value.slice(0, 12);
}

export function formatArtifactGroupLabel(value: string | null | undefined, locale: AppLocale = detectLocale()): string {
  if (!value) {
    return locale === "tr" ? "Varsayılan Grup" : "Default Group";
  }
  return titleCase(value);
}

export function formatFilterLabel(value: string | null | undefined, locale: AppLocale = detectLocale()): string {
  if (!value || value === "all") {
    return locale === "tr" ? "Tümü" : "All";
  }
  if (value === "image") {
    return locale === "tr" ? "Görseller" : "Images";
  }
  if (value === "3d") {
    return "3D";
  }
  return titleCase(value);
}

export function getLocalizedText(locale: AppLocale, key: LabelKey): string {
  return lookup(key, locale);
}
