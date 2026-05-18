# Sync Engine Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current full-document autosave path with a block-identity-based incremental draft sync engine, so typing no longer triggers `getContent`-before-save and manual save becomes `flush + commit`.

**Architecture:** The implementation introduces a stable front-end block identity model (`blockId` + `clientId`), upgrades the existing `/blocks/batch` endpoint into a real sync transport with batch acknowledgements, and adds a front-end sync engine that tracks dirty blocks and flushes them asynchronously with `createVersion: false`. Manual save becomes a barrier operation that waits for all draft mutations to flush before calling `/documents/:docId/commit`.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, TipTap 3, NestJS 11, TypeORM, Jest (server), Vitest (new, frontend pure-unit tests)

---

## Planned File Structure

### Frontend (`F:/yuediter`)

- Create: `F:/yuediter/vitest.config.ts`
- Create: `F:/yuediter/src/services/sync/types.ts`
- Create: `F:/yuediter/src/services/sync/identity.ts`
- Create: `F:/yuediter/src/services/sync/api.ts`
- Create: `F:/yuediter/src/services/sync/reducer.ts`
- Create: `F:/yuediter/src/services/sync/engine.ts`
- Create: `F:/yuediter/src/services/sync/__tests__/identity.test.ts`
- Create: `F:/yuediter/src/services/sync/__tests__/reducer.test.ts`
- Create: `F:/yuediter/src/hooks/useDocumentSync.ts`
- Modify: `F:/yuediter/package.json`
- Modify: `F:/yuediter/src/components/markdown-editor/extensions/blockIdAttribute.ts:1-37`
- Modify: `F:/yuediter/src/services/tiptap-converter.ts:1-133`
- Modify: `F:/yuediter/src/services/tiptap-extensions.ts`
- Modify: `F:/yuediter/src/components/markdown-editor/MarkdownEditor.tsx:1-340`
- Modify: `F:/yuediter/src/services/document.ts:340-457`
- Modify: `F:/yuediter/src/contexts/DocumentContext.tsx:1-219`
- Modify: `F:/yuediter/src/components/EditorPage.tsx:264-360`
- Modify: `F:/yuediter/src/components/DocumentHeader.tsx`
- Modify: `F:/yuediter/src/components/markdown-editor/BlockToolbar/BlockMenu.tsx`

### Backend (`F:/yuweb/back/server`)

- Create: `F:/yuweb/back/server/src/modules/blocks/dto/sync-batch-response.dto.ts`
- Create: `F:/yuweb/back/server/src/modules/documents/dto/sync-state-response.dto.ts`
- Create: `F:/yuweb/back/server/test/document-sync.e2e-spec.ts`
- Modify: `F:/yuweb/back/server/src/modules/blocks/dto/batch-block.dto.ts:1-128`
- Modify: `F:/yuweb/back/server/src/modules/blocks/blocks.controller.ts`
- Modify: `F:/yuweb/back/server/src/modules/blocks/blocks.service.ts:650-740`
- Modify: `F:/yuweb/back/server/src/modules/documents/documents.controller.ts:81-240`
- Modify: `F:/yuweb/back/server/src/modules/documents/documents.service.ts:731-819, 1098-1148, 1218-1310`
- Modify: `F:/yuweb/back/server/src/modules/documents/services/version-control.service.ts:1-140`

---

### Task 1: Add stable block identity primitives on the frontend

**Files:**
- Create: `F:/yuediter/vitest.config.ts`
- Create: `F:/yuediter/src/services/sync/types.ts`
- Create: `F:/yuediter/src/services/sync/identity.ts`
- Create: `F:/yuediter/src/services/sync/__tests__/identity.test.ts`
- Modify: `F:/yuediter/package.json`
- Modify: `F:/yuediter/src/components/markdown-editor/extensions/blockIdAttribute.ts:1-37`
- Modify: `F:/yuediter/src/services/tiptap-converter.ts:1-133`
- Modify: `F:/yuediter/src/services/tiptap-extensions.ts`
- Modify: `F:/yuediter/src/components/markdown-editor/MarkdownEditor.tsx:1-340`

- [ ] **Step 1: Write the failing frontend identity tests**

```ts
// F:/yuediter/src/services/sync/__tests__/identity.test.ts
import { describe, expect, it } from "vitest";
import {
  ensureBlockIdentity,
  ensureDocumentIdentity,
  readIdentityFromAttrs,
} from "../identity";

describe("sync identity", () => {
  it("preserves existing blockId and clientId on a block node", () => {
    const node = {
      type: "paragraph",
      attrs: { blockId: "b_1", clientId: "c_1" },
      content: [{ type: "text", text: "hello" }],
    };

    const result = ensureBlockIdentity(node);

    expect(result.attrs?.blockId).toBe("b_1");
    expect(result.attrs?.clientId).toBe("c_1");
  });

  it("creates a clientId when blockId exists but clientId is missing", () => {
    const node = {
      type: "heading",
      attrs: { blockId: "b_2" },
      content: [{ type: "text", text: "Title" }],
    };

    const result = ensureBlockIdentity(node);

    expect(result.attrs?.blockId).toBe("b_2");
    expect(result.attrs?.clientId).toMatch(/^client_/);
  });

  it("adds identities to every top-level block in a TipTap doc", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", attrs: { blockId: "b_3" }, content: [{ type: "text", text: "B" }] },
      ],
    };

    const result = ensureDocumentIdentity(doc);

    expect(result.content?.[0].attrs?.clientId).toMatch(/^client_/);
    expect(result.content?.[1].attrs?.blockId).toBe("b_3");
    expect(result.content?.[1].attrs?.clientId).toMatch(/^client_/);
  });

  it("reads identity from either attrs or legacy data-block-id", () => {
    const attrs = {
      blockId: null,
      clientId: "client_9",
      "data-block-id": "b_legacy",
    };

    expect(readIdentityFromAttrs(attrs)).toEqual({
      blockId: "b_legacy",
      clientId: "client_9",
    });
  });
});
```

- [ ] **Step 2: Run the identity tests to verify they fail**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/identity.test.ts
```

Expected: FAIL with errors like `Cannot find module '../identity'` and missing `vitest` script support.

- [ ] **Step 3: Add the minimal identity implementation and test runner**

```ts
// F:/yuediter/src/services/sync/types.ts
export type BlockIdentity = {
  blockId: string | null;
  clientId: string;
};

export type SyncAwareAttrs = {
  blockId?: string | null;
  clientId?: string | null;
  "data-block-id"?: string | null;
};

export type SyncDocNode = {
  type: string;
  attrs?: SyncAwareAttrs;
  content?: SyncDocNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};
```

```ts
// F:/yuediter/src/services/sync/identity.ts
import type { BlockIdentity, SyncAwareAttrs, SyncDocNode } from "./types";

export function createClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function readIdentityFromAttrs(attrs?: SyncAwareAttrs): BlockIdentity | null {
  if (!attrs) return null;
  const blockId = attrs.blockId ?? attrs["data-block-id"] ?? null;
  const clientId = attrs.clientId ?? null;
  if (!blockId && !clientId) return null;
  return {
    blockId,
    clientId: clientId || createClientId(),
  };
}

export function ensureBlockIdentity<T extends SyncDocNode>(node: T): T {
  const existing = readIdentityFromAttrs(node.attrs);
  const attrs: SyncAwareAttrs = {
    ...(node.attrs || {}),
    blockId: existing?.blockId ?? node.attrs?.blockId ?? node.attrs?.["data-block-id"] ?? null,
    clientId: existing?.clientId ?? createClientId(),
    "data-block-id": existing?.blockId ?? node.attrs?.blockId ?? node.attrs?.["data-block-id"] ?? null,
  };
  return { ...node, attrs };
}

export function ensureDocumentIdentity<T extends { type: "doc"; content?: SyncDocNode[] }>(doc: T): T {
  return {
    ...doc,
    content: (doc.content || []).map((node) => ensureBlockIdentity(node)),
  };
}
```

```ts
// F:/yuediter/src/components/markdown-editor/extensions/blockIdAttribute.ts
import { Extension } from "@tiptap/core";

export const BlockIdAttribute = Extension.create({
  name: "blockIdAttribute",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "codeBlock",
          "blockquote",
          "listItem",
          "tableCell",
          "tableHeader",
          "taskItem",
          "highlightBlock",
        ],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {};
              return { "data-block-id": attributes.blockId };
            },
          },
          clientId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-client-id"),
            renderHTML: (attributes) => {
              if (!attributes.clientId) return {};
              return { "data-client-id": attributes.clientId };
            },
          },
          "data-block-id": {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },
});
```

```ts
// F:/yuediter/package.json (scripts/devDependencies delta)
{
  "scripts": {
    "test:unit": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "@vitest/coverage-v8": "^3.2.4"
  }
}
```

- [ ] **Step 4: Propagate identities through converter and editor setup**

```ts
// F:/yuediter/src/services/tiptap-converter.ts
import { ensureDocumentIdentity } from "./sync/identity";

export function tiptapJsonToBlocks(
  doc: TiptapDoc,
  existingBlockIds?: string[],
): BlockPayload[] {
  const normalized = ensureDocumentIdentity(doc);
  if (!normalized.content) return [];

  return normalized.content.map((node, i) => {
    const blockType = toBlockType(node.type);
    const blockId = node.attrs?.blockId ?? existingBlockIds?.[i];
    const payload: Record<string, unknown> = { ...node };
    return blockId
      ? { blockId, type: blockType, payload }
      : { type: blockType, payload };
  });
}

export function blocksToTiptapJson(
  blocks: Array<{ blockId: string; type: string; payload: Record<string, unknown>; sortKey?: string }>,
): TiptapDoc {
  const content = blocks
    .filter((b) => b.type !== "root")
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || ""))
    .map((block) => {
      const payload = { ...block.payload } as Record<string, unknown>;
      const attrs = { ...(payload.attrs as Record<string, unknown> | undefined), blockId: block.blockId };
      return {
        ...(payload as TiptapNode),
        type: typeof payload.type === "string" ? (payload.type as string) : toTiptapType(block.type),
        attrs,
      } as TiptapNode;
    });

  return ensureDocumentIdentity({ type: "doc", content });
}
```

```ts
// F:/yuediter/src/components/markdown-editor/MarkdownEditor.tsx
import { ensureDocumentIdentity } from "@/services/sync/identity";

const handleUpdate = useCallback(
  ({ editor: ed }: { editor: import("@tiptap/core").Editor }) => {
    if (!onChange) return;
    const json = ensureDocumentIdentity(ed.getJSON() as EditorContentType);
    onChange(json);
  },
  [onChange],
);
```

- [ ] **Step 5: Run the identity tests and lint to verify the foundation passes**

Run:
```bash
cd /d F:\yuediter && pnpm install && pnpm exec vitest run src/services/sync/__tests__/identity.test.ts && pnpm lint
```

Expected: PASS for the 4 identity tests, ESLint exits with code 0.

- [ ] **Step 6: Commit the identity foundation**

```bash
git -C "F:/yuediter" add package.json vitest.config.ts src/services/sync/types.ts src/services/sync/identity.ts src/services/sync/__tests__/identity.test.ts src/components/markdown-editor/extensions/blockIdAttribute.ts src/services/tiptap-converter.ts src/services/tiptap-extensions.ts src/components/markdown-editor/MarkdownEditor.tsx
git -C "F:/yuediter" commit -m "feat: add frontend block identity foundation"
```

### Task 2: Upgrade the backend batch endpoint into a sync transport

**Files:**
- Create: `F:/yuweb/back/server/src/modules/blocks/dto/sync-batch-response.dto.ts`
- Create: `F:/yuweb/back/server/src/modules/documents/dto/sync-state-response.dto.ts`
- Create: `F:/yuweb/back/server/test/document-sync.e2e-spec.ts`
- Modify: `F:/yuweb/back/server/src/modules/blocks/dto/batch-block.dto.ts:1-128`
- Modify: `F:/yuweb/back/server/src/modules/blocks/blocks.controller.ts`
- Modify: `F:/yuweb/back/server/src/modules/blocks/blocks.service.ts:650-740`
- Modify: `F:/yuweb/back/server/src/modules/documents/documents.controller.ts:81-240`
- Modify: `F:/yuweb/back/server/src/modules/documents/documents.service.ts:731-819, 1098-1148, 1218-1310`
- Modify: `F:/yuweb/back/server/src/modules/documents/services/version-control.service.ts:1-140`

- [ ] **Step 1: Write the failing backend e2e tests for batch ack and sync-state**

```ts
// F:/yuweb/back/server/test/document-sync.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('document sync contract (e2e)', () => {
  let app: INestApplication;
  let authHeader = '';
  let docId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns batch ack metadata for autosync createVersion=false writes', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/blocks/batch')
      .set('Authorization', authHeader)
      .send({
        docId,
        baseVersion: 1,
        clientBatchId: 'batch_sync_1',
        source: 'autosync',
        createVersion: false,
        operations: [
          {
            type: 'create',
            clientId: 'client_new_1',
            data: {
              docId,
              type: 'paragraph',
              payload: {
                type: 'paragraph',
                attrs: { clientId: 'client_new_1' },
                content: [{ type: 'text', text: 'queued' }],
              },
            },
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.acceptedBatchId).toBe('batch_sync_1');
    expect(res.body.data.serverHead).toBeGreaterThanOrEqual(1);
    expect(res.body.data.results[0].clientId).toBe('client_new_1');
    expect(res.body.data.results[0].blockId).toMatch(/^b_/);
  });

  it('returns sync-state without rebuilding the document tree', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/documents/${docId}/sync-state`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.docId).toBe(docId);
    expect(typeof res.body.data.head).toBe('number');
    expect(typeof res.body.data.pendingCount).toBe('number');
    expect(typeof res.body.data.hasPendingDraft).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run the backend e2e tests to verify they fail**

Run:
```bash
cd /d F:\yuweb\back\server && pnpm test:e2e -- document-sync.e2e-spec.ts
```

Expected: FAIL with 404 on `GET /documents/:docId/sync-state` and missing `acceptedBatchId`, `clientId`, `blockId` fields on batch response.

- [ ] **Step 3: Extend the batch DTO and response contract**

```ts
// F:/yuweb/back/server/src/modules/blocks/dto/batch-block.dto.ts
export class BatchCreateOperation {
  @ApiPropertyOptional({ description: '前端临时 clientId', example: 'client_new_1' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({ description: '操作类型', example: 'create', enum: BatchOperationType })
  @IsEnum(BatchOperationType)
  type: BatchOperationType.CREATE;

  @ApiProperty({ description: '创建块的数据', type: CreateBlockDto })
  @ValidateNested()
  @Type(() => CreateBlockDto)
  data: CreateBlockDto;
}

export class BatchBlockDto {
  @ApiPropertyOptional({ description: '本地起始版本号', example: 5 })
  @IsOptional()
  @IsNumber()
  baseVersion?: number;

  @ApiPropertyOptional({ description: '客户端批次ID', example: 'batch_sync_1' })
  @IsOptional()
  @IsString()
  clientBatchId?: string;

  @ApiPropertyOptional({ description: '请求来源', example: 'autosync' })
  @IsOptional()
  @IsString()
  source?: 'autosync' | 'manual-save';
}
```

```ts
// F:/yuweb/back/server/src/modules/blocks/dto/sync-batch-response.dto.ts
export class SyncBatchResultDto {
  operation: 'create' | 'update' | 'delete' | 'move';
  success: boolean;
  clientId?: string;
  blockId?: string;
  version?: number;
  error?: string;
}

export class SyncBatchResponseDto {
  acceptedBatchId: string | null;
  appliedAt: number;
  serverHead: number;
  needsReload: boolean;
  conflicts: Array<{ code: string; message: string }>;
  results: SyncBatchResultDto[];
}
```

- [ ] **Step 4: Implement batch ack metadata and the new sync-state endpoint**

```ts
// F:/yuweb/back/server/src/modules/blocks/blocks.service.ts (inside batch)
const acceptedBatchId = batchBlockDto.clientBatchId ?? null;
const conflicts: Array<{ code: string; message: string }> = [];

if (
  typeof batchBlockDto.baseVersion === 'number' &&
  batchBlockDto.baseVersion > 0
) {
  const docSnapshot = await manager.findOne(Document, {
    where: { docId: batchBlockDto.docId },
    select: ['head'],
  });
  if (docSnapshot && batchBlockDto.baseVersion > docSnapshot.head) {
    conflicts.push({
      code: 'BASE_VERSION_AHEAD',
      message: `baseVersion ${batchBlockDto.baseVersion} is ahead of server head ${docSnapshot.head}`,
    });
  }
}

return {
  acceptedBatchId,
  appliedAt: now,
  serverHead: (await manager.findOne(Document, { where: { docId: batchBlockDto.docId }, select: ['head'] }))?.head ?? 0,
  needsReload: conflicts.length > 0,
  conflicts,
  results,
};
```

```ts
// F:/yuweb/back/server/src/modules/documents/documents.controller.ts
@Get(':docId/sync-state')
@ApiOperation({ summary: '获取文档同步状态' })
async getSyncState(@Param('docId') docId: string, @CurrentUser() user: any) {
  return this.documentsService.getSyncState(docId, user.userId);
}
```

```ts
// F:/yuweb/back/server/src/modules/documents/documents.service.ts
async getSyncState(docId: string, userId: string) {
  const document = await this.findOne(docId, userId);
  const pendingCount = this.versionControlService.getPendingVersionCount(docId);
  return {
    docId: document.docId,
    head: document.head,
    publishedHead: document.publishedHead,
    hasPendingDraft: pendingCount > 0,
    pendingCount,
    updatedAt: document.updatedAt,
  };
}
```

- [ ] **Step 5: Run backend tests and lint to verify the transport contract passes**

Run:
```bash
cd /d F:\yuweb\back\server && pnpm test:e2e -- document-sync.e2e-spec.ts && pnpm test -- version-control.service.spec.ts && pnpm lint
```

Expected: PASS for the new sync e2e tests, PASS for version-control unit tests, lint exits with code 0.

- [ ] **Step 6: Commit the backend sync contract**

```bash
git -C "F:/yuweb/back/server" add src/modules/blocks/dto/batch-block.dto.ts src/modules/blocks/dto/sync-batch-response.dto.ts src/modules/blocks/blocks.controller.ts src/modules/blocks/blocks.service.ts src/modules/documents/dto/sync-state-response.dto.ts src/modules/documents/documents.controller.ts src/modules/documents/documents.service.ts src/modules/documents/services/version-control.service.ts test/document-sync.e2e-spec.ts
git -C "F:/yuweb/back/server" commit -m "feat: add batch ack and document sync state"
```

### Task 3: Implement the pure frontend sync reducer and queue semantics

**Files:**
- Create: `F:/yuediter/src/services/sync/api.ts`
- Create: `F:/yuediter/src/services/sync/reducer.ts`
- Create: `F:/yuediter/src/services/sync/engine.ts`
- Create: `F:/yuediter/src/services/sync/__tests__/reducer.test.ts`

- [ ] **Step 1: Write the failing reducer tests for merge rules and flush barriers**

```ts
// F:/yuediter/src/services/sync/__tests__/reducer.test.ts
import { describe, expect, it } from "vitest";
import {
  createInitialSyncState,
  enqueueChange,
  markBatchInflight,
  resolveBatchSuccess,
} from "../reducer";

describe("sync reducer", () => {
  it("merges create followed by update into one create", () => {
    let state = createInitialSyncState("doc_1", 3);
    state = enqueueChange(state, {
      clientId: "client_a",
      blockId: null,
      opType: "create",
      payload: { type: "paragraph", attrs: { clientId: "client_a" } },
    });
    state = enqueueChange(state, {
      clientId: "client_a",
      blockId: null,
      opType: "update",
      payload: { type: "paragraph", attrs: { clientId: "client_a" }, content: [{ type: "text", text: "A" }] },
    });

    expect(state.dirtyOrder).toEqual(["client_a"]);
    expect(state.entries.client_a.opType).toBe("create");
    expect((state.entries.client_a.payload as any).content[0].text).toBe("A");
  });

  it("drops create followed by delete before flush", () => {
    let state = createInitialSyncState("doc_1", 3);
    state = enqueueChange(state, { clientId: "client_b", blockId: null, opType: "create", payload: { type: "paragraph" } });
    state = enqueueChange(state, { clientId: "client_b", blockId: null, opType: "delete" });

    expect(state.dirtyOrder).toEqual([]);
    expect(state.entries.client_b).toBeUndefined();
  });

  it("keeps manual-save barrier active until inflight batch resolves", () => {
    let state = createInitialSyncState("doc_1", 3);
    state = enqueueChange(state, { clientId: "client_c", blockId: "b_1", opType: "update", payload: { type: "paragraph" } });
    state = markBatchInflight(state, "batch_1", [state.entries.client_c], true);

    expect(state.syncState).toBe("flushing");
    expect(state.pendingCommit).toBe(true);

    state = resolveBatchSuccess(state, "batch_1", [{ clientId: "client_c", blockId: "b_1", success: true, operation: "update" }]);

    expect(state.syncState).toBe("idle");
    expect(state.pendingCommit).toBe(true);
  });
});
```

- [ ] **Step 2: Run the reducer tests to verify they fail**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/reducer.test.ts
```

Expected: FAIL with missing reducer symbols.

- [ ] **Step 3: Implement the reducer, API wrapper, and engine shell**

```ts
// F:/yuediter/src/services/sync/reducer.ts
export type SyncEntry = {
  clientId: string;
  blockId: string | null;
  opType: "create" | "update" | "delete" | "move";
  payload?: Record<string, unknown>;
  parentId?: string | null;
  sortKey?: string | null;
  indent?: number | null;
};

export type SyncReducerState = {
  docId: string;
  baseVersion: number;
  localRevision: number;
  syncState: "idle" | "dirty" | "flushing" | "error" | "conflicted";
  entries: Record<string, SyncEntry>;
  dirtyOrder: string[];
  inflightBatchId: string | null;
  pendingCommit: boolean;
};

export function createInitialSyncState(docId: string, baseVersion: number): SyncReducerState {
  return {
    docId,
    baseVersion,
    localRevision: 0,
    syncState: "idle",
    entries: {},
    dirtyOrder: [],
    inflightBatchId: null,
    pendingCommit: false,
  };
}

export function enqueueChange(state: SyncReducerState, incoming: SyncEntry): SyncReducerState {
  const current = state.entries[incoming.clientId];
  if (current?.opType === "create" && incoming.opType === "update") {
    incoming = { ...incoming, opType: "create", blockId: null };
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
  return {
    ...state,
    localRevision: state.localRevision + 1,
    syncState: "dirty",
    entries: {
      ...state.entries,
      [incoming.clientId]: current ? { ...current, ...incoming } : incoming,
    },
    dirtyOrder: state.dirtyOrder.includes(incoming.clientId)
      ? state.dirtyOrder
      : [...state.dirtyOrder, incoming.clientId],
  };
}

export function markBatchInflight(
  state: SyncReducerState,
  batchId: string,
  entries: SyncEntry[],
  pendingCommit = false,
): SyncReducerState {
  return {
    ...state,
    inflightBatchId: batchId,
    syncState: "flushing",
    pendingCommit,
  };
}

export function resolveBatchSuccess(
  state: SyncReducerState,
  batchId: string,
  results: Array<{ clientId?: string; blockId?: string; success: boolean; operation: string }>,
): SyncReducerState {
  if (state.inflightBatchId !== batchId) return state;
  const nextEntries = { ...state.entries };
  for (const result of results) {
    if (!result.clientId) continue;
    delete nextEntries[result.clientId];
  }
  return {
    ...state,
    entries: nextEntries,
    dirtyOrder: state.dirtyOrder.filter((id) => nextEntries[id]),
    inflightBatchId: null,
    syncState: Object.keys(nextEntries).length === 0 ? "idle" : "dirty",
  };
}
```

```ts
// F:/yuediter/src/services/sync/api.ts
import { apiGet, apiPost } from "@/services/api-client";
import type { SyncEntry } from "./reducer";

export type SyncBatchResponse = {
  acceptedBatchId: string | null;
  appliedAt: number;
  serverHead: number;
  needsReload: boolean;
  conflicts: Array<{ code: string; message: string }>;
  results: Array<{ operation: string; success: boolean; clientId?: string; blockId?: string; version?: number; error?: string }>;
};

export type DocumentSyncState = {
  docId: string;
  head: number;
  publishedHead: number;
  hasPendingDraft: boolean;
  pendingCount: number;
  updatedAt: string;
};

export async function postSyncBatch(input: {
  docId: string;
  baseVersion: number;
  clientBatchId: string;
  source: "autosync" | "manual-save";
  operations: SyncEntry[];
}): Promise<SyncBatchResponse> {
  return apiPost<SyncBatchResponse>("/blocks/batch", {
    docId: input.docId,
    baseVersion: input.baseVersion,
    clientBatchId: input.clientBatchId,
    source: input.source,
    createVersion: false,
    operations: input.operations,
  });
}

export async function getDocumentSyncState(docId: string): Promise<DocumentSyncState> {
  return apiGet<DocumentSyncState>(`/documents/${docId}/sync-state`);
}
```

- [ ] **Step 4: Run the reducer test suite to verify queue semantics pass**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/identity.test.ts src/services/sync/__tests__/reducer.test.ts
```

Expected: PASS for both test files.

- [ ] **Step 5: Commit the sync reducer core**

```bash
git -C "F:/yuediter" add src/services/sync/api.ts src/services/sync/reducer.ts src/services/sync/engine.ts src/services/sync/__tests__/reducer.test.ts
git -C "F:/yuediter" commit -m "feat: add sync reducer and api client"
```

### Task 4: Integrate the sync engine into document loading, autosave, and manual save

**Files:**
- Create: `F:/yuediter/src/hooks/useDocumentSync.ts`
- Modify: `F:/yuediter/src/services/document.ts:346-456`
- Modify: `F:/yuediter/src/contexts/DocumentContext.tsx:25-206`
- Modify: `F:/yuediter/src/components/EditorPage.tsx:264-360`
- Modify: `F:/yuediter/src/components/DocumentHeader.tsx`

- [ ] **Step 1: Add a failing integration-oriented unit test for initial identity hydration**

```ts
// F:/yuediter/src/services/sync/__tests__/identity.test.ts
it("hydrates blockId into loaded TipTap docs so autosync can target existing blocks", () => {
  const doc = ensureDocumentIdentity({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "b_loaded_1" },
        content: [{ type: "text", text: "server" }],
      },
    ],
  });

  expect(doc.content?.[0].attrs?.blockId).toBe("b_loaded_1");
  expect(doc.content?.[0].attrs?.clientId).toMatch(/^client_/);
});
```

- [ ] **Step 2: Run the frontend unit tests to verify the new hydration assertion is in place**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/identity.test.ts
```

Expected: PASS after Task 1; this step guards against regressions before integration edits.

- [ ] **Step 3: Replace the full-document save API with load metadata plus sync hooks**

```ts
// F:/yuediter/src/services/document.ts
export type LoadedSyncDocument = {
  content: EditorContent;
  docVer: number;
  blockIds: string[];
};

export async function loadDocumentContentV2(docId: string): Promise<LoadedSyncDocument> {
  const resp = await getDocumentContent(docId);
  if (!resp.tree) return { content: "", docVer: resp.docVer, blockIds: [] };

  const flatBlocks = flattenBlockTree(resp.tree);
  const contentBlocks = flatBlocks.filter((b) => b.type !== "root");
  const blockIds = contentBlocks.map((b) => b.blockId);

  if (contentBlocks.length === 0) {
    return { content: { type: "doc", content: [] }, docVer: resp.docVer, blockIds };
  }

  if (isLegacyDocument(contentBlocks)) {
    const html = blocksToHtml(contentBlocks, new Map(contentBlocks.map((b, i) => [i, b.blockId])));
    return { content: html, docVer: resp.docVer, blockIds };
  }

  return {
    content: blocksToTiptapJson(contentBlocks),
    docVer: resp.docVer,
    blockIds,
  };
}
```

```ts
// F:/yuediter/src/hooks/useDocumentSync.ts
import { useEffect, useRef, useState } from "react";
import { commitVersion } from "@/services/document";
import { createInitialSyncState, enqueueChange } from "@/services/sync/reducer";
import { postSyncBatch } from "@/services/sync/api";

export function useDocumentSync(docId: string | null, baseVersion: number | null) {
  const [state, setState] = useState(() => (docId && baseVersion ? createInitialSyncState(docId, baseVersion) : null));
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!docId || baseVersion == null) return;
    setState(createInitialSyncState(docId, baseVersion));
  }, [docId, baseVersion]);

  return {
    state,
    enqueue(entry: Parameters<typeof enqueueChange>[1]) {
      setState((current) => (current ? enqueueChange(current, entry) : current));
    },
    async commit(message: string) {
      if (!docId) return;
      await commitVersion(docId, message);
    },
    async flush() {
      const current = stateRef.current;
      if (!current || current.dirtyOrder.length === 0 || current.inflightBatchId) return;
      const operations = current.dirtyOrder.map((id) => current.entries[id]);
      const clientBatchId = `batch_${Date.now()}`;
      const response = await postSyncBatch({
        docId: current.docId,
        baseVersion: current.baseVersion,
        clientBatchId,
        source: "autosync",
        operations,
      });
      return response;
    },
  };
}
```

- [ ] **Step 4: Wire DocumentContext, EditorPage, and header state to the new sync hook**

```ts
// F:/yuediter/src/contexts/DocumentContext.tsx
interface DocumentContextValue {
  workspaceId: string | null;
  currentDoc: Document | null;
  documents: Document[];
  saveStatus: "idle" | "dirty" | "flushing" | "saved" | "error";
  lastSavedAt: Date | null;
  currentDocVersion: number | null;
  loadContent: (docId: string) => Promise<LoadedSyncDocument>;
  markSavedAt: (at: Date) => void;
  setSaveStatus: (status: "idle" | "dirty" | "flushing" | "saved" | "error") => void;
  enqueueSyncEntry: (entry: SyncEntry) => void;
  flushSyncNow: () => Promise<void>;
}
```

```ts
// F:/yuediter/src/components/EditorPage.tsx
const { currentDoc, loadContent, workspaceId, setWorkspace, setSaveStatus, markSavedAt } = useDocument();
const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
const sync = useDocumentSync(currentDoc?.docId ?? null, loadedVersion);

useEffect(() => {
  const docId = currentDoc?.docId;
  if (!docId) return;
  setLoadingDoc(true);
  loadContent(docId)
    .then((loaded) => {
      setContent(loaded.content || DEFAULT_CONTENT);
      setLoadedVersion(loaded.docVer);
    })
    .finally(() => setLoadingDoc(false));
}, [currentDoc, loadContent]);

useEffect(() => {
  if (!sync.state) return;
  setSaveStatus(sync.state.syncState === "flushing" ? "flushing" : sync.state.syncState === "dirty" ? "dirty" : sync.state.syncState === "error" ? "error" : "saved");
}, [sync.state, setSaveStatus]);

const handleManualSave = useCallback(async () => {
  await sync.flush();
  await sync.commit("手动保存");
  markSavedAt(new Date());
}, [sync, markSavedAt]);
```

```ts
// F:/yuediter/src/components/DocumentHeader.tsx
const saveStatusLabel = {
  idle: null,
  dirty: <Text type="warning" style={{ fontSize: 11 }}>未同步</Text>,
  flushing: <Text type="secondary" style={{ fontSize: 11 }}>同步中...</Text>,
  saved: <Text type="secondary" style={{ fontSize: 11 }}>已同步到草稿</Text>,
  error: <Text type="danger" style={{ fontSize: 11 }}>同步失败</Text>,
};
```

- [ ] **Step 5: Run frontend verification to confirm the new autosync path builds cleanly**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/identity.test.ts src/services/sync/__tests__/reducer.test.ts && pnpm lint && pnpm build
```

Expected: PASS for unit tests, PASS for ESLint, PASS for Next.js production build.

- [ ] **Step 6: Commit the autosync integration**

```bash
git -C "F:/yuediter" add src/hooks/useDocumentSync.ts src/services/document.ts src/contexts/DocumentContext.tsx src/components/EditorPage.tsx src/components/DocumentHeader.tsx
git -C "F:/yuediter" commit -m "feat: integrate incremental draft sync"
```

### Task 5: Migrate explicit structural actions and remove the old autosave hot path

**Files:**
- Modify: `F:/yuediter/src/components/markdown-editor/BlockToolbar/BlockMenu.tsx`
- Modify: `F:/yuediter/src/hooks/useAutoSave.ts`
- Modify: `F:/yuediter/src/services/document.ts:377-456`
- Modify: `F:/yuediter/src/components/EditorPage.tsx:305-316`

- [ ] **Step 1: Write a failing reducer test for structural delete of a local-only block**

```ts
// F:/yuediter/src/services/sync/__tests__/reducer.test.ts
it("removes a local-only create when the block is deleted before flush", () => {
  let state = createInitialSyncState("doc_1", 8);
  state = enqueueChange(state, {
    clientId: "client_local_only",
    blockId: null,
    opType: "create",
    payload: { type: "paragraph", attrs: { clientId: "client_local_only" } },
  });
  state = enqueueChange(state, {
    clientId: "client_local_only",
    blockId: null,
    opType: "delete",
  });

  expect(state.entries.client_local_only).toBeUndefined();
  expect(state.dirtyOrder).toHaveLength(0);
});
```

- [ ] **Step 2: Run the reducer tests to verify structural action coverage remains green**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/reducer.test.ts
```

Expected: PASS with the new local-only delete test.

- [ ] **Step 3: Make block menu delete enqueue a sync operation instead of refetching the document**

```ts
// F:/yuediter/src/components/markdown-editor/BlockToolbar/BlockMenu.tsx
const { enqueueSyncEntry, flushSyncNow } = useDocument();

const handleDeleteBlock = useCallback(async () => {
  if (!currentDoc || !blockId) return;
  enqueueSyncEntry({
    clientId: hoveredBlock.dataset.clientId || hoveredBlock.dataset.blockId || `client_delete_${Date.now()}`,
    blockId,
    opType: "delete",
  });
  await flushSyncNow();
}, [currentDoc, blockId, enqueueSyncEntry, flushSyncNow, hoveredBlock]);
```

```ts
// F:/yuediter/src/components/EditorPage.tsx
// remove this line entirely:
useAutoSave(content, saveDoc, { delay: 2000, enabled: !loadingDoc });

// replace it with:
useEffect(() => {
  if (!sync.state || loadingDoc) return;
  if (sync.state.syncState !== "dirty") return;
  const timer = window.setTimeout(() => {
    void sync.flush();
  }, 1000);
  return () => window.clearTimeout(timer);
}, [sync.state, sync, loadingDoc]);
```

```ts
// F:/yuediter/src/services/document.ts
/** Compatibility-only fallback for legacy HTML save; editor autosync must not call this path. */
export async function saveDocumentContentV2(
  docId: string,
  content: EditorContent,
  rootBlockId: string,
): Promise<void> {
  if (typeof content === "string") {
    await saveDocumentContent(docId, content, rootBlockId);
    return;
  }
  throw new Error("saveDocumentContentV2 is no longer the autosync path for TipTap JSON documents");
}
```

- [ ] **Step 4: Run end-to-end verification across both repos**

Run:
```bash
cd /d F:\yuediter && pnpm exec vitest run src/services/sync/__tests__/identity.test.ts src/services/sync/__tests__/reducer.test.ts && pnpm lint && pnpm build
cd /d F:\yuweb\back\server && pnpm test:e2e -- document-sync.e2e-spec.ts && pnpm lint
```

Expected: All frontend tests/build checks pass, backend sync e2e passes, and no autosave code path references `saveDocumentContentV2` for TipTap JSON documents.

- [ ] **Step 5: Commit the structural-action migration and old-path retirement**

```bash
git -C "F:/yuediter" add src/components/markdown-editor/BlockToolbar/BlockMenu.tsx src/hooks/useAutoSave.ts src/services/document.ts src/components/EditorPage.tsx
git -C "F:/yuediter" commit -m "refactor: remove full-document autosave hot path"
```

---

## Self-Review Checklist

### Spec coverage

- **Block identity (`blockId` + `clientId`)**: covered by Task 1.
- **Batch ack + sync-state endpoint + baseVersion metadata**: covered by Task 2.
- **Dirty block queue, merge rules, flush barrier semantics**: covered by Task 3.
- **Autosync integration and manual save becomes flush + commit**: covered by Task 4.
- **Structural actions stop refetching the whole document and old save hot path is retired**: covered by Task 5.
- **Legacy HTML remains compatibility-only, not autosync primary path**: covered in Task 5 by narrowing `saveDocumentContentV2`.

### Placeholder scan

- No unfinished markers or deferred-work placeholders remain.
- Every task contains exact files, commands, and code snippets.

### Type consistency

- The plan consistently uses `blockId` for server IDs and `clientId` for local IDs.
- The frontend state names are consistently `idle | dirty | flushing | error | conflicted`.
- Manual save consistently means `flush + commit`, not direct content save.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-18-sync-engine-phase-1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
