import { describe, expect, it } from "vitest";
import { shouldEnableLegacyAutoSave } from "../save-policy";

describe("save policy", () => {
  it("does not auto-save immediately after loading an unchanged legacy document", () => {
    expect(shouldEnableLegacyAutoSave({
      syncEngineEnabled: false,
      loadingDoc: false,
      hasCurrentDoc: true,
      contentDirty: false,
      content: "<p>loaded</p>",
    })).toBe(false);
  });

  it("does not run legacy auto-save for TipTap JSON documents", () => {
    expect(shouldEnableLegacyAutoSave({
      syncEngineEnabled: false,
      loadingDoc: false,
      hasCurrentDoc: true,
      contentDirty: true,
      content: { type: "doc" },
    })).toBe(false);
  });

  it("enables legacy auto-save only for dirty HTML documents when sync engine is disabled", () => {
    expect(shouldEnableLegacyAutoSave({
      syncEngineEnabled: false,
      loadingDoc: false,
      hasCurrentDoc: true,
      contentDirty: true,
      content: "<p>changed</p>",
    })).toBe(true);
  });
});
