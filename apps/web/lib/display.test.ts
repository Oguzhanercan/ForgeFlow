import { describe, expect, test } from "vitest";

import {
  formatArtifactGroupLabel,
  formatCapabilityLabel,
  formatIntentLabel,
  formatRunStatusLabel,
  formatShortId,
  formatSourceKindLabel,
} from "./display";


describe("display formatters", () => {
  test("formats supported labels in Turkish", () => {
    expect(formatIntentLabel("single_object_image", "tr")).toBe("Tek Obje Görseli");
    expect(formatCapabilityLabel("object3d_generation", "tr")).toBe("3D Obje Üretimi");
    expect(formatSourceKindLabel("api_generic", "tr")).toBe("Genel API");
    expect(formatRunStatusLabel("awaiting_review_mode", "tr")).toBe("İnceleme Bekleniyor");
    expect(formatArtifactGroupLabel("nation_based_props", "tr")).toBe("Nation Based Props");
  });

  test("formats supported labels in English", () => {
    expect(formatIntentLabel("image_plus_3d", "en")).toBe("Image to 3D");
    expect(formatCapabilityLabel("vision_review", "en")).toBe("Vision Review");
    expect(formatSourceKindLabel("local_hf_diffusers", "en")).toBe("Local Diffusers");
    expect(formatRunStatusLabel("completed", "en")).toBe("Completed");
  });

  test("shortens long identifiers safely", () => {
    expect(formatShortId("20B7D345")).toBe("20B7D345");
    expect(formatShortId("session_1234567890abcdef")).toBe("session_1234");
    expect(formatShortId("")).toBe("—");
  });
});
