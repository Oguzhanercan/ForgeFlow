import { describe, expect, test } from "vitest";

import { shouldSubmitFromKeydown } from "./chat-input";


describe("shouldSubmitFromKeydown", () => {
  test("submits on plain Enter", () => {
    expect(shouldSubmitFromKeydown({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  });

  test("does not submit on Shift+Enter", () => {
    expect(shouldSubmitFromKeydown({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
  });

  test("does not submit while composing", () => {
    expect(shouldSubmitFromKeydown({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });
});
