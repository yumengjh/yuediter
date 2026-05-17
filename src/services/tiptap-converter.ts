/**
 * Tiptap JSON ↔ Block payload 双向转换
 *
 * 新格式：payload 直接存储 Tiptap 节点结构（attrs/content/marks）
 * 旧格式：payload.html 存储 HTML 字符串（兼容回退）
 */

// ─── Tiptap JSON 类型 ───

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}

// ─── Block payload 类型 ───

export interface BlockPayload {
  type: string; // 后端 block type
  payload: Record<string, unknown>; // 存入 block_versions.payload
  blockId?: string; // 已有 block 的 ID（用于 diff）
}

// ─── 格式检测 ───

export type PayloadFormat = "json" | "html";

export function detectPayloadFormat(
  payload: Record<string, unknown>,
): PayloadFormat {
  if (payload.html && typeof payload.html === "string") return "html";
  return "json";
}

export function isLegacyDocument(
  blocks: Array<{ type: string; payload: Record<string, unknown> }>,
): boolean {
  const contentBlocks = blocks.filter((b) => b.type !== "root");
  if (contentBlocks.length === 0) return false;
  return contentBlocks.every((b) => detectPayloadFormat(b.payload) === "html");
}

// ─── 类型映射 ───

const TIPTAP_TO_BLOCK_TYPE: Record<string, string> = {
  heading: "heading",
  paragraph: "paragraph",
  codeBlock: "codeBlock",
  bulletList: "bulletList",
  orderedList: "orderedList",
  taskList: "taskList",
  blockquote: "blockquote",
  table: "table",
  horizontalRule: "hr",
  highlightBlock: "highlightBlock",
};

const BLOCK_TO_TIPTAP_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(TIPTAP_TO_BLOCK_TYPE).map(([k, v]) => [v, k]),
);
BLOCK_TO_TIPTAP_TYPE.hr = "horizontalRule";

function toBlockType(tiptapType: string): string {
  return TIPTAP_TO_BLOCK_TYPE[tiptapType] || "paragraph";
}

function toTiptapType(blockType: string): string {
  return BLOCK_TO_TIPTAP_TYPE[blockType] || "paragraph";
}

// ─── Tiptap JSON → Block payloads ───

/**
 * 将 Tiptap doc JSON 拆分为独立的 block payloads
 * 每个顶级节点成为一个 block
 */
export function tiptapJsonToBlocks(
  doc: TiptapDoc,
  existingBlockIds?: string[],
): BlockPayload[] {
  if (!doc.content) return [];

  return doc.content.map((node, i) => {
    const blockType = toBlockType(node.type);
    const blockId = existingBlockIds?.[i];

    // payload = 完整 Tiptap 节点（不含 blockId，那是 block 元数据不是 payload 内容）
    const payload: Record<string, unknown> = { ...node };

    if (blockId) {
      return { blockId, type: blockType, payload };
    }
    return { type: blockType, payload };
  });
}

// ─── Block payloads → Tiptap JSON ───

/**
 * 将 block 数组重组为 Tiptap doc JSON
 * 用于从后端加载数据后喂给编辑器
 */
export function blocksToTiptapJson(
  blocks: Array<{
    blockId: string;
    type: string;
    payload: Record<string, unknown>;
    sortKey?: string;
  }>,
): TiptapDoc {
  const contentBlocks = blocks
    .filter((b) => b.type !== "root")
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || ""));

  const content: TiptapNode[] = contentBlocks.map((block) => {
    // 如果 payload 本身就是 Tiptap 节点结构，直接使用
    if (block.payload.type && typeof block.payload.type === "string") {
      return block.payload as unknown as TiptapNode;
    }
    // 否则按 block type 构造
    const tiptapType = toTiptapType(block.type);
    return {
      type: tiptapType,
      ...block.payload,
    } as unknown as TiptapNode;
  });

  return { type: "doc", content };
}

/** 从 Tiptap 节点中提取纯文本（用于后端搜索索引） */
export function extractPlainText(node: TiptapNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractPlainText).join("");
}
