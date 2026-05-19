export type SavePolicyContent = string | { type?: string } | null | undefined;

export function shouldEnableLegacyAutoSave(input: {
  syncEngineEnabled: boolean;
  loadingDoc: boolean;
  hasCurrentDoc: boolean;
  contentDirty: boolean;
  content: SavePolicyContent;
}): boolean {
  return Boolean(
    input.hasCurrentDoc &&
      !input.loadingDoc &&
      !input.syncEngineEnabled &&
      input.contentDirty &&
      typeof input.content === "string",
  );
}
