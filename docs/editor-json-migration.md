# 编辑器底层架构迁移：HTML → Tiptap JSON

> 日期：2026-05-17
> 状态：已实现
> 影响范围：编辑器核心数据流、保存/加载、服务端渲染

## 一、背景与动机

### 1.1 原有架构

编辑器的数据流为：

```
用户编辑 → editor.getHTML() → payload.html (string) → 后端 block_versions.payload (JSONB)
后端返回 → payload.html → editor.setContent(html) → 渲染
```

每个 block 的 `payload` 结构为 `{ html: "<h2>标题</h2><p>内容</p>" }`，即一个 HTML 字符串。

### 1.2 存在的问题

1. **元信息丢失**：HTML 无法表达代码块的语言、折叠状态、行号显示等块级元信息
2. **Block 粒度粗糙**：HTML 拆分逻辑只看最外层标签，导致整个 taskList、嵌套列表等被塞进单个 block
3. **位置索引 diff**：保存时用位置索引逐个对比，中间插入一个块会导致后续所有块级联 update
4. **无法利用结构化能力**：Tiptap/ProseMirror 的文档模型是结构化 JSON，存 HTML 等于丢弃了这一能力

### 1.3 迁移目标

- 前端改用 `editor.getJSON()` 输出 Tiptap ProseMirror JSON
- 以 Tiptap 顶级节点为单位拆分为独立 block
- 后端 `block_versions.payload` JSONB 字段无需改动，天然支持任意对象
- 新文档用 JSON，旧文档保持 HTML 回退，不做主动迁移

## 二、架构设计

### 2.1 数据流对比

```
原有流程（HTML）：
编辑 → editor.getHTML() → 拆分 HTML 节点 → 位置索引 diff → POST batch

新流程（JSON）：
编辑 → editor.getJSON() → 拆分 Tiptap 节点 → blockId 精确 diff → POST batch
```

### 2.2 payload 格式

**旧格式**（保留兼容）：
```json
{
  "html": "<h2>标题</h2><p>内容</p>"
}
```

**新格式**：
```json
{
  "type": "heading",
  "attrs": { "level": 2 },
  "content": [{ "type": "text", "text": "标题" }]
}
```

payload 直接复用 Tiptap 节点结构（`type`/`attrs`/`content`/`marks`），不额外包装。

### 2.3 格式检测

```typescript
// tiptap-converter.ts
export function detectPayloadFormat(payload: Record<string, unknown>): "json" | "html" {
  if (payload.html && typeof payload.html === "string") return "html";
  return "json";
}

export function isLegacyDocument(blocks: Array<{ type: string; payload: Record<string, unknown> }>): boolean {
  const contentBlocks = blocks.filter((b) => b.type !== "root");
  if (contentBlocks.length === 0) return false;
  return contentBlocks.every((b) => detectPayloadFormat(b.payload) === "html");
}
```

判断逻辑：`payload.html` 存在且为字符串 → 旧格式；否则 → 新格式。

### 2.4 BlockId 精确匹配 diff

旧的 diff 算法基于位置索引（第 0 个 block 对第 0 个），中间插入会导致级联 update。新的 diff 基于 `blockId` 精确匹配：

```
新 block 有 blockId 且匹配已有 block → 比较 payload，不同则 update
新 block 无 blockId 或无匹配 → create
已有 block 无匹配 → delete
```

`blockId` 存储在 Tiptap 节点的 `data-block-id` 属性中，由 `BlockIdAttribute` 扩展自动管理。

### 2.5 Tiptap 类型映射

| Tiptap type | Block type | 说明 |
|-------------|-----------|------|
| heading | heading | 含 `attrs.level` |
| paragraph | paragraph | |
| codeBlock | codeBlock | 含 `attrs.language` |
| bulletList | bulletList | |
| orderedList | orderedList | |
| taskList | taskList | |
| blockquote | blockquote | |
| table | table | |
| horizontalRule | hr | 类型名缩写 |
| highlightBlock | highlightBlock | 自定义扩展 |

## 三、实现细节

### 3.1 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/services/tiptap-converter.ts` | 新建 | Tiptap JSON ↔ Block payload 双向转换 |
| `src/services/tiptap-extensions.ts` | 新建 | 序列化用 extensions 列表（单一来源） |
| `src/services/generate-block-html.ts` | 新建 | 服务端 Block tree → HTML（jsdom + generateHTML） |
| `src/services/document.ts` | 修改 | 新增 V2 加载/保存函数 |
| `src/components/markdown-editor/MarkdownEditor.tsx` | 修改 | 输出改为 getJSON()，类型改为 EditorContent |
| `src/contexts/DocumentContext.tsx` | 修改 | 使用 V2 函数，双格式支持 |
| `src/hooks/useAutoSave.ts` | 修改 | 泛型化，支持任意内容类型 |
| `src/components/EditorPage.tsx` | 修改 | 状态改为 EditorContent，预览用 generateHTML |
| `src/components/markdown-editor/BlockToolbar/BlockMenu.tsx` | 修改 | 回滚逻辑改用 V2 加载 |
| `app/doc/[slug]/page.tsx` | 修改 | 服务端渲染兼容双格式 |

### 3.2 核心模块：tiptap-converter.ts

纯函数模块，不依赖 DOM 或浏览器 API。

**Tiptap JSON → Block payloads（保存时拆分）：**

```typescript
export function tiptapJsonToBlocks(doc: TiptapDoc, existingBlockIds?: string[]): BlockPayload[] {
  return doc.content.map((node, i) => {
    const blockType = toBlockType(node.type);
    const blockId = existingBlockIds?.[i];
    const payload: Record<string, unknown> = { ...node };
    if (blockId) return { blockId, type: blockType, payload };
    return { type: blockType, payload };
  });
}
```

**Block payloads → Tiptap JSON（加载时重组）：**

```typescript
export function blocksToTiptapJson(blocks: Array<{ blockId: string; type: string; payload: Record<string, unknown>; sortKey?: string }>): TiptapDoc {
  const contentBlocks = blocks
    .filter((b) => b.type !== "root")
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || ""));

  const content = contentBlocks.map((block) => {
    if (block.payload.type && typeof block.payload.type === "string") {
      return block.payload as unknown as TiptapNode;  // payload 本身就是 Tiptap 节点
    }
    return { type: toTiptapType(block.type), ...block.payload } as unknown as TiptapNode;
  });

  return { type: "doc", content };
}
```

### 3.3 保存逻辑：saveDocumentContentV2

```typescript
export async function saveDocumentContentV2(docId: string, content: EditorContent, rootBlockId: string): Promise<void> {
  if (typeof content === "string") {
    await saveDocumentContent(docId, content, rootBlockId);  // 旧路径
    return;
  }
  await saveJsonContent(docId, content, rootBlockId);  // 新路径
}
```

`saveJsonContent` 内部流程：
1. 获取已有 blocks
2. `tiptapJsonToBlocks()` 拆分为 block payloads
3. 基于 `blockId` 精确匹配 diff
4. 生成 batch operations（create/update/delete）

### 3.4 加载逻辑：loadDocumentContentV2

```typescript
export async function loadDocumentContentV2(docId: string): Promise<{ content: EditorContent; blockIds: string[] }> {
  // ...获取 blocks...
  if (isLegacyDocument(contentBlocks)) {
    const html = blocksToHtml(contentBlocks, blockIdMap);  // 旧格式：拼接 HTML
    return { content: html, blockIds };
  }
  const tiptapDoc = blocksToTiptapJson(contentBlocks);  // 新格式：重组 Tiptap JSON
  return { content: tiptapDoc, blockIds };
}
```

### 3.5 JSON → HTML 转换

**问题**：多处需要将 Tiptap JSON 转为 HTML（编辑器预览、服务端渲染详情页），但 `generateHTML` 依赖 DOM API。

**方案**：统一使用 Tiptap 官方 `generateHTML(json, extensions)` API。

- **客户端**（EditorPage.tsx）：浏览器原生 DOM，直接调用
- **服务端**（app/doc/[slug]/page.tsx）：jsdom 补丁注入 `globalThis.document` 等

**extensions 列表**抽取到 `tiptap-extensions.ts` 单一来源，避免编辑器和序列化之间 schema 漂移。

```typescript
// tiptap-extensions.ts
export const serializationExtensions = [
  StarterKit.configure({ codeBlock: false, code: false, bold: false, italic: false, strike: false, horizontalRule: false, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
  CodeBlock,
  Code.extend({ excludes: "" }),  // 与编辑器一致，允许 code+bold 共存
  // ...其余 extensions
];
```

**jsdom 补丁**采用惰性初始化 + 幂等守卫：

```typescript
// generate-block-html.ts
let jsdomReady = false;
function ensureJsdom() {
  if (jsdomReady) return;
  if (typeof window !== "undefined") { jsdomReady = true; return; }  // 浏览器跳过
  if (typeof (globalThis as any).document !== "undefined") { jsdomReady = true; return; }  // 已有 DOM
  try {
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM();
    // 注入 globalThis.document, window, DOMParser, Node, Element
    jsdomReady = true;
  } catch (e) {
    console.error("[generate-block-html] jsdom 初始化失败:", e);
  }
}
```

### 3.6 编辑器输出改造

`MarkdownEditor.tsx` 的 `handleUpdate` 改为输出 JSON：

```typescript
const handleUpdate = useCallback(({ editor: ed }) => {
  if (!onChange) return;
  const json = ed.getJSON() as EditorContentType;
  onChange(json);
}, [onChange]);
```

`content` prop 和 `onChange` 回调类型统一为 `EditorContent = string | TiptapDoc`。

内容同步逻辑根据类型分支：
- `string`（HTML）→ `editor.commands.setContent(html)`
- `object`（TiptapDoc）→ `editor.commands.setContent(json)`

### 3.7 脏检查策略

`DocumentContext.saveDoc` 中的脏检查：

```typescript
if (typeof content === "string" && typeof lastSavedContentRef.current === "string") {
  if (content === lastSavedContentRef.current) return;  // 字符串直接比较
} else if (typeof content === "object" && typeof lastSavedContentRef.current === "object") {
  if (JSON.stringify(content) === JSON.stringify(lastSavedContentRef.current)) return;  // JSON 序列化比较
}
```

### 3.8 服务端详情页兼容

`app/doc/[slug]/page.tsx` 是 Next.js Server Component，使用 `renderBlockTreeToHtml` 兼容双格式：

```typescript
import { renderBlockTreeToHtml } from "@/services/generate-block-html";

const rawHtml = renderBlockTreeToHtml(data.tree);
// → 旧文档：直接拼接 payload.html
// → 新文档：逐块 generateHTML(doc, extensions)
```

## 四、兼容性设计

### 4.1 旧文档回退

- 加载时 `isLegacyDocument()` 检测 → 返回 HTML 字符串
- 编辑器收到 HTML → `setContent(html)` 走 HTML 模式
- 保存时 `typeof content === "string"` → 走旧的 `saveDocumentContent` 逻辑
- **旧文档在迁移后行为完全不变**

### 4.2 新文档 JSON

- 加载时检测为非 legacy → `blocksToTiptapJson()` 重组为 TiptapDoc
- 编辑器收到 JSON → `setContent(json)` 走 JSON 模式
- 保存时走 `saveJsonContent` 的 blockId 精确 diff

### 4.3 不做主动迁移

- HTML 文档保持 HTML，不会被自动转换为 JSON
- 后续单独写迁移脚本处理存量数据
- 后端无需任何改动

## 五、已知限制与后续计划

### 5.1 已知限制

1. **BlockIdAttribute 出现在预览 HTML**：`generateHTML` 会输出 `data-block-id` 属性，对用户复制 HTML 可能有轻微影响
2. **空文档默认内容**：新建或空文档会显示 `DEFAULT_CONTENT` 欢迎内容，保存后会写入 JSON
3. **旧路径 `inferBlockType` 类型不匹配**：`"code"` vs `"codeBlock"`、`"list"` vs `"bulletList"` 等，仅影响旧 HTML 保存路径新建的块，后续迁移脚本会统一修正

### 5.2 后续计划

1. **存量数据迁移脚本**：将数据库中的 `payload.html` 批量转换为结构化 JSON
2. **自定义扩展元信息存储**：代码块标题、折叠状态、行号等利用 JSON payload 存储
3. **扩展列表统一管理**：考虑提取 `createBaseExtensions()` 工厂函数，编辑器和序列化共用
