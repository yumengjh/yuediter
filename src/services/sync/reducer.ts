import type { SyncEntry, SyncReducerState, SyncBatchResult } from "./types";

function isDeleteNotFound(entry: SyncEntry | undefined, result: SyncBatchResult): boolean {
  if (!entry || entry.opType !== "delete") return false;
  if (result.success) return false;
  const message = (result.error ?? "").toString().toLowerCase();
  return message.includes("not found") || message.includes("不存在");
}

export function createInitialSyncState(
  docId: string,
  rootBlockId: string,
  baseVersion: number,
): SyncReducerState {
  return {
    docId,
    rootBlockId,
    baseVersion,
    localRevision: 0,
    syncState: "idle",
    entries: {},
    dirtyOrder: [],
    inflightBatchId: null,
    inflightEntryIds: [],
    pendingCommit: false,
    lastError: null,
  };
}

export function enqueueChange(state: SyncReducerState, incoming: SyncEntry): SyncReducerState {
  const current = state.entries[incoming.clientId];

  if (current?.opType === "create" && incoming.opType === "update") {
    const merged: SyncEntry = {
      ...current,
      payload: incoming.payload ?? current.payload,
      sortKey: incoming.sortKey ?? current.sortKey,
    };
    return upsertEntry(state, merged);
  }

  if (current?.opType === "create" && incoming.opType === "delete") {
    const { [incoming.clientId]: _, ...rest } = state.entries;
    return {
      ...state,
      localRevision: state.localRevision + 1,
      syncState: Object.keys(rest).length === 0 ? "idle" : "dirty",
      entries: rest,
      dirtyOrder: state.dirtyOrder.filter((id) => id !== incoming.clientId),
    };
  }

  if (current?.opType === "update" && incoming.opType === "delete") {
    return upsertEntry(state, {
      clientId: incoming.clientId,
      blockId: incoming.blockId ?? current.blockId,
      opType: "delete",
    });
  }

  if (current?.opType === "delete" && incoming.opType === "update") {
    return state;
  }

  if (current) {
    return upsertEntry(state, {
      ...current,
      ...incoming,
      payload: incoming.payload ?? current.payload,
      sortKey: incoming.sortKey ?? current.sortKey,
    });
  }

  return upsertEntry(state, incoming);
}

function upsertEntry(state: SyncReducerState, entry: SyncEntry): SyncReducerState {
  return {
    ...state,
    localRevision: state.localRevision + 1,
    syncState: "dirty",
    lastError: null,
    entries: {
      ...state.entries,
      [entry.clientId]: entry,
    },
    dirtyOrder: state.dirtyOrder.includes(entry.clientId)
      ? state.dirtyOrder
      : [...state.dirtyOrder, entry.clientId],
  };
}

export function markBatchInflight(
  state: SyncReducerState,
  batchId: string,
  inflightEntryIds: string[],
  pendingCommit = false,
): SyncReducerState {
  return {
    ...state,
    inflightBatchId: batchId,
    inflightEntryIds,
    syncState: "flushing",
    pendingCommit: state.pendingCommit || pendingCommit,
    lastError: null,
  };
}

export function resolveBatchSuccess(
  state: SyncReducerState,
  batchId: string,
  results: SyncBatchResult[],
  serverHead?: number,
): SyncReducerState {
  if (state.inflightBatchId !== batchId) return state;

  const nextEntries = { ...state.entries };
  const inflightEntries = state.inflightEntryIds
    .map((id) => state.entries[id])
    .filter(Boolean);

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const byIndex = inflightEntries[index];
    const shouldTreatAsSuccess = result.success || isDeleteNotFound(byIndex, result);
    if (!shouldTreatAsSuccess) continue;

    if (result.clientId) {
      delete nextEntries[result.clientId];
      continue;
    }

    if (byIndex) {
      if (!result.blockId || byIndex.blockId === result.blockId) {
        delete nextEntries[byIndex.clientId];
        continue;
      }
    }

    if (result.blockId) {
      const matched = inflightEntries.find((entry) => entry.blockId === result.blockId);
      if (matched) {
        delete nextEntries[matched.clientId];
      }
    }
  }

  const nextDirty = state.dirtyOrder.filter((id) => Boolean(nextEntries[id]));
  return {
    ...state,
    entries: nextEntries,
    dirtyOrder: nextDirty,
    inflightBatchId: null,
    inflightEntryIds: [],
    baseVersion: typeof serverHead === "number" ? serverHead : state.baseVersion,
    syncState: nextDirty.length > 0 ? "dirty" : "idle",
    lastError: null,
  };
}

export function resolveBatchFailure(
  state: SyncReducerState,
  batchId: string,
  error: string,
  conflicted = false,
): SyncReducerState {
  if (state.inflightBatchId !== batchId) return state;
  return {
    ...state,
    inflightBatchId: null,
    inflightEntryIds: [],
    syncState: conflicted ? "conflicted" : "error",
    lastError: error,
  };
}

export function markPendingCommit(state: SyncReducerState): SyncReducerState {
  return {
    ...state,
    pendingCommit: true,
  };
}

export function clearPendingCommit(state: SyncReducerState): SyncReducerState {
  return {
    ...state,
    pendingCommit: false,
  };
}
