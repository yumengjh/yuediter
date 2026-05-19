import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TiptapDoc } from "@/services/tiptap-converter";
import { postSyncBatch } from "@/services/sync/api";
import {
  applyCreateAck,
  deriveSyncEntries,
  normalizeEditorDoc,
} from "@/services/sync/engine";
import {
  clearPendingCommit,
  createInitialSyncState,
  enqueueChange,
  markBatchInflight,
  markPendingCommit,
  resolveBatchFailure,
  resolveBatchSuccess,
} from "@/services/sync/reducer";
import type { SyncReducerState } from "@/services/sync/types";

type SyncSource = "autosync" | "manual-save";

type UseDocumentSyncArgs = {
  docId: string | null;
  rootBlockId: string | null;
  baseVersion: number | null;
  content: TiptapDoc | null;
  onContentPatched?: (doc: TiptapDoc) => void;
};

function createBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useDocumentSync({
  docId,
  rootBlockId,
  baseVersion,
  content,
  onContentPatched,
}: UseDocumentSyncArgs) {
  const [syncState, setSyncState] = useState<SyncReducerState | null>(null);
  const stateRef = useRef<SyncReducerState | null>(null);
  const snapshotRef = useRef<TiptapDoc | null>(null);

  useEffect(() => {
    stateRef.current = syncState;
  }, [syncState]);

  useEffect(() => {
    if (!docId || !rootBlockId || baseVersion == null) {
      setSyncState(null);
      snapshotRef.current = null;
      return;
    }

    setSyncState(createInitialSyncState(docId, rootBlockId, baseVersion));
    snapshotRef.current = null;
  }, [docId, rootBlockId, baseVersion]);

  useEffect(() => {
    if (!syncState || !content) return;
    const normalized = normalizeEditorDoc(content);
    if (!snapshotRef.current) {
      snapshotRef.current = normalized;
      return;
    }
    const entries = deriveSyncEntries(snapshotRef.current, normalized);
    if (entries.length > 0) {
      setSyncState((current) => {
        if (!current) return current;
        let next = current;
        for (const entry of entries) {
          next = enqueueChange(next, entry);
        }
        return next;
      });
    }
    snapshotRef.current = normalized;
  }, [content, syncState?.docId]);

  const flush = useCallback(
    async (source: SyncSource = "autosync") => {
      const current = stateRef.current;
      if (!current) return;
      if (current.inflightBatchId) return;
      if (current.dirtyOrder.length === 0) return;

      const operations = current.dirtyOrder
        .map((id) => current.entries[id])
        .filter(Boolean);

      const clientBatchId = createBatchId();
      setSyncState((prev) =>
        prev ? markBatchInflight(prev, clientBatchId, operations.map((op) => op.clientId), source === "manual-save") : prev,
      );

      try {
        const response = await postSyncBatch({
          docId: current.docId,
          rootBlockId: current.rootBlockId,
          baseVersion: current.baseVersion,
          clientBatchId,
          source,
          operations,
        });

        if (response.needsReload) {
          setSyncState((prev) =>
            prev ? resolveBatchFailure(prev, clientBatchId, "检测到版本冲突，请刷新后重试", true) : prev,
          );
          return;
        }

        setSyncState((prev) =>
          prev ? resolveBatchSuccess(prev, clientBatchId, response.results, response.serverHead) : prev,
        );

        const createMappings = response.results
          .filter((result) => result.success && result.clientId && result.blockId)
          .map((result) => ({ clientId: result.clientId!, blockId: result.blockId! }));

        if (snapshotRef.current && createMappings.length > 0) {
          const patched = applyCreateAck(snapshotRef.current, createMappings);
          snapshotRef.current = patched;
          if (onContentPatched && patched !== content) {
            onContentPatched(patched);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "同步失败";
        setSyncState((prev) =>
          prev ? resolveBatchFailure(prev, clientBatchId, message, false) : prev,
        );
      }
    },
    [content, onContentPatched],
  );

  const flushAndCommitBarrier = useCallback(async (): Promise<boolean> => {
    setSyncState((prev) => (prev ? markPendingCommit(prev) : prev));
    try {
      await flush("manual-save");
      let current = stateRef.current;
      if (!current) return false;
      if (current.syncState === "conflicted" || current.syncState === "error") {
        return false;
      }
      if (current.dirtyOrder.length > 0) {
        await flush("manual-save");
        current = stateRef.current;
        if (!current) return false;
        if (current.syncState === "conflicted" || current.syncState === "error") {
          return false;
        }
        if (current.dirtyOrder.length > 0) {
          return false;
        }
      }
      return true;
    } finally {
      setSyncState((prev) => (prev ? clearPendingCommit(prev) : prev));
    }
  }, [flush]);

  const uiSaveStatus = useMemo(() => {
    if (!syncState) return "idle" as const;
    if (syncState.syncState === "flushing") return "flushing" as const;
    if (syncState.syncState === "dirty") return "dirty" as const;
    if (syncState.syncState === "error" || syncState.syncState === "conflicted") return "error" as const;
    return "saved" as const;
  }, [syncState]);

  return {
    syncState,
    uiSaveStatus,
    flush,
    flushAndCommitBarrier,
  };
}
