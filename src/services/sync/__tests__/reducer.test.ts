import { describe, expect, it } from "vitest";
import {
  createInitialSyncState,
  enqueueChange,
  markBatchInflight,
  resolveBatchSuccess,
} from "../reducer";

describe("sync reducer", () => {
  it("merges create followed by update into one create", () => {
    let state = createInitialSyncState("doc_1", "root_1", 3);
    state = enqueueChange(state, {
      clientId: "client_a",
      blockId: null,
      opType: "create",
      blockType: "paragraph",
      payload: { type: "paragraph", attrs: { clientId: "client_a" } },
    });
    state = enqueueChange(state, {
      clientId: "client_a",
      blockId: null,
      opType: "update",
      payload: {
        type: "paragraph",
        attrs: { clientId: "client_a" },
        content: [{ type: "text", text: "A" }],
      },
    });

    expect(state.dirtyOrder).toEqual(["client_a"]);
    expect(state.entries.client_a.opType).toBe("create");
    expect((state.entries.client_a.payload as { content?: Array<{ text?: string }> }).content?.[0]?.text).toBe("A");
  });

  it("drops create followed by delete before flush", () => {
    let state = createInitialSyncState("doc_1", "root_1", 3);
    state = enqueueChange(state, {
      clientId: "client_b",
      blockId: null,
      opType: "create",
      blockType: "paragraph",
      payload: { type: "paragraph" },
    });
    state = enqueueChange(state, {
      clientId: "client_b",
      blockId: null,
      opType: "delete",
    });

    expect(state.dirtyOrder).toEqual([]);
    expect(state.entries.client_b).toBeUndefined();
  });

  it("keeps pending commit marker while inflight batch is resolving", () => {
    let state = createInitialSyncState("doc_1", "root_1", 3);
    state = enqueueChange(state, {
      clientId: "client_c",
      blockId: "b_1",
      opType: "update",
      payload: { type: "paragraph" },
    });
    state = markBatchInflight(state, "batch_1", [state.entries.client_c.clientId], true);

    expect(state.syncState).toBe("flushing");
    expect(state.pendingCommit).toBe(true);

    state = resolveBatchSuccess(state, "batch_1", [
      {
        clientId: "client_c",
        blockId: "b_1",
        success: true,
        operation: "update",
      },
    ]);

    expect(state.syncState).toBe("idle");
    expect(state.pendingCommit).toBe(true);
  });

  it("clears inflight update entry even when ack omits clientId", () => {
    let state = createInitialSyncState("doc_1", "root_1", 3);
    state = enqueueChange(state, {
      clientId: "client_d",
      blockId: "b_9",
      opType: "update",
      payload: { type: "paragraph", content: [{ type: "text", text: "x" }] },
    });
    state = markBatchInflight(state, "batch_2", ["client_d"], false);
    state = resolveBatchSuccess(state, "batch_2", [
      {
        operation: "update",
        success: true,
        blockId: "b_9",
      },
    ]);

    expect(state.entries.client_d).toBeUndefined();
    expect(state.dirtyOrder).toEqual([]);
    expect(state.syncState).toBe("idle");
  });

  it("treats delete-not-found as idempotent success to stop retry loop", () => {
    let state = createInitialSyncState("doc_1", "root_1", 3);
    state = enqueueChange(state, {
      clientId: "client_del",
      blockId: "b_missing",
      opType: "delete",
    });
    state = markBatchInflight(state, "batch_del_1", ["client_del"], false);
    state = resolveBatchSuccess(state, "batch_del_1", [
      {
        operation: "delete",
        success: false,
        blockId: "b_missing",
        error: "Block not found",
      },
    ]);

    expect(state.entries.client_del).toBeUndefined();
    expect(state.dirtyOrder).toEqual([]);
    expect(state.syncState).toBe("idle");
  });

  it("clears inflight entries when a batch has no executable operations", () => {
    let state = createInitialSyncState("doc_1", "root_1", 3);
    state = enqueueChange(state, {
      clientId: "client_without_block",
      blockId: null,
      opType: "update",
      payload: { type: "paragraph", content: [{ type: "text", text: "x" }] },
    });
    state = markBatchInflight(state, "batch_empty", ["client_without_block"], false);

    state = resolveBatchSuccess(state, "batch_empty", []);

    expect(state.entries.client_without_block).toBeUndefined();
    expect(state.dirtyOrder).toEqual([]);
    expect(state.syncState).toBe("idle");
  });
});
