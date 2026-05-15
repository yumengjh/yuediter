# 同步引擎优化：前端块缓存机制

> 日期：2026-05-15
> 状态：已实现

## 一、背景

编辑器的文档同步采用 HTTP REST API + 防抖自动保存的架构。每次用户编辑后 2 秒触发保存，保存流程调用 `saveDocumentContent` 函数。

**原有问题**：`saveDocumentContent` 每次保存时都会先调用 `GET /documents/{id}/content` 重新加载完整文档的全部块，然后再做 diff、生成批量操作。这意味着每次自动保存都有一次冗余的全量读取请求，即使只改了一个字。

## 二、架构设计

### 2.1 核心思路

**前端维护块状态快照（Block Cache），保存时直接用本地快照做 diff，消除冗余 GET 请求。**

```
原有流程：
编辑 → 防抖 → GET 完整文档 → diff → POST batch
                 ↑ 冗余请求

优化后：
编辑 → 防抖 → 读本地缓存 → diff → POST batch
                 ↑ 无网络请求
```

### 2.2 数据流

```
┌─────────────┐    loadDocumentContent    ┌──────────────┐
│   服务器     │ ─────────────────────────→│  Block Cache │
│  (REST API)  │                           │  (前端内存)   │
└──────┬───────┘                           └──────┬───────┘
       │                                          │
       │  GET /documents/{id}/content              │ blockCache.get()
       │  (仅首次加载时调用)                        │ (每次保存时读取)
       │                                          │
       │         saveDocumentContent               │
       │ ←─────────────────────────────────────────┘
       │    POST /blocks/batch (增量操作)
       │
       │         保存成功后
       │ ─────────────────────────────────────────→
       │    更新缓存 (blockCache.replace)
       │
```

## 三、实现细节

### 3.1 Block Cache 模块

**文件**：`src/services/block-cache.ts`

```typescript
class BlockCache {
  private cache = new Map<string, Block[]>();

  set(docId: string, blocks: Block[]): void;    // 设置缓存
  get(docId: string): Block[] | null;            // 读取缓存
  replace(docId: string, blocks: Block[]): void; // 替换缓存
  clear(docId: string): void;                    // 清除指定文档
  clearAll(): void;                              // 清除全部
}
```

缓存以 `docId` 为 key，存储该文档所有内容块的扁平数组（不含 root 块）。

### 3.2 加载时填充缓存

**文件**：`src/services/document.ts` → `loadDocumentContent`

```typescript
export async function loadDocumentContent(docId: string): Promise<string> {
  const resp = await getDocumentContent(docId);
  const flatBlocks = flattenBlockTree(resp.tree);
  const contentBlocks = flatBlocks.filter((b) => b.type !== "root");

  // 新增：加载后填充缓存
  blockCache.set(docId, contentBlocks);

  return blocksToHtml(contentBlocks);
}
```

文档首次加载时，从服务器获取完整块树，展平后同时写入缓存和返回 HTML。

### 3.3 保存时从缓存读取

**文件**：`src/services/document.ts` → `saveDocumentContent`

```typescript
export async function saveDocumentContent(docId, html, rootBlockId) {
  // 1. 从缓存读取，缓存为空时 fallback 到 GET
  let existingBlocks = blockCache.get(docId);
  if (!existingBlocks) {
    const resp = await getDocumentContent(docId);
    existingBlocks = flattenBlockTree(resp.tree).filter(...);
    blockCache.set(docId, existingBlocks);
  }

  // 2. 解析新 HTML → diff → 生成 batch 操作（逻辑不变）
  // 3. 执行 POST /blocks/batch

  // 4. 更新缓存
  if (有新增或删除操作) {
    // 重新加载获取服务器返回的真实 blockId
    const resp = await getDocumentContent(docId);
    blockCache.replace(docId, newBlocks);
  } else {
    // 只有 update 操作时，直接更新缓存中的 payload
    blockCache.replace(docId, updatedBlocks);
  }
}
```

### 3.4 缓存更新策略

保存成功后，根据操作类型决定如何更新缓存：

| 操作类型 | 缓存更新方式 | 原因 |
|---------|------------|------|
| 仅 update | 直接更新 payload | blockId 不变，只需更新内容 |
| 有 create/delete | 重新 GET 并替换缓存 | create 操作需要服务器返回的真实 blockId |

这个策略在「避免冗余请求」和「保持缓存正确性」之间取得平衡：
- 纯编辑场景（最常见）：0 次额外 GET
- 增删块场景：1 次额外 GET（但仍比原来每次都 GET 要少）

### 3.5 容错机制

缓存为空时（如页面刷新后首次保存、内存被回收等），自动 fallback 到 GET 加载：

```typescript
let existingBlocks = blockCache.get(docId);
if (!existingBlocks) {
  // fallback：从服务器加载
  const resp = await getDocumentContent(docId);
  existingBlocks = ...;
  blockCache.set(docId, existingBlocks);
}
```

## 四、涉及文件

| 文件 | 改动 |
|------|------|
| `src/services/block-cache.ts` | 新建，块缓存模块 |
| `src/services/document.ts` | `loadDocumentContent` 填充缓存；`saveDocumentContent` 从缓存读取 |

`DocumentContext.tsx` 和 `useAutoSave.ts` 无需改动 —— 缓存逻辑完全封装在 `document.ts` 内部。

## 五、性能收益

| 场景 | 原有请求数 | 优化后请求数 |
|------|-----------|-------------|
| 普通编辑保存 | 1 GET + 1 POST | 1 POST |
| 新增/删除块后保存 | 1 GET + 1 POST | 1 GET + 1 POST |
| 连续编辑 10 次 | 10 GET + 10 POST | 10 POST |

**典型场景（纯编辑）减少 50% 的网络请求。**

## 六、验证方式

1. 打开浏览器 DevTools → Network 面板
2. 打开一个文档，等待内容加载完成
3. 编辑文档内容，等待 2 秒自动保存
4. 确认 Network 中只有 `POST /blocks/batch`，没有 `GET /documents/{id}/content`
5. 新增一个块，再次保存，确认有 `GET` 请求（获取新块的 blockId）
6. 继续编辑，确认下次保存又回到只有 `POST`
