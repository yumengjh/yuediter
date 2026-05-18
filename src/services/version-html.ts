/**
 * Version content → rendered HTML for diff viewer
 * Reuses the same conversion pipeline as the editor
 */
import { generateHTML } from "@tiptap/core";
import { serializationExtensions } from "./tiptap-extensions";
import {
  blocksToTiptapJson,
  detectPayloadFormat,
  isLegacyDocument,
  type TiptapNode,
  type TiptapDoc,
} from "./tiptap-converter";
import type { Block, DiffChange } from "./document";

/** 将 block tree 转为带 data-block-id 的渲染后 HTML */
export function versionTreeToHtml(tree: Block): string {
  const flat: Block[] = [];
  function walk(block: Block) {
    flat.push(block);
    if (block.children) {
      for (const child of block.children) walk(child);
    }
  }
  walk(tree);

  const contentBlocks = flat
    .filter((b) => b.type !== "root")
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || ""));

  if (contentBlocks.length === 0) return "";

  if (isLegacyDocument(contentBlocks)) {
    return contentBlocks
      .map((b) => {
        const html = (b.payload?.html as string) || "";
        if (!html) return "";
        return html.replace(
          /^(\s*<[^>\s]+)/,
          `$1 data-block-id="${b.blockId}"`,
        );
      })
      .filter(Boolean)
      .join("");
  }

  // 新格式：逐块生成 HTML，注入 data-block-id
  return contentBlocks
    .map((b) => {
      try {
        const node = b.payload as unknown as TiptapNode;
        const doc: TiptapDoc = { type: "doc", content: [node] };
        const html = generateHTML(doc, serializationExtensions);
        return html.replace(
          /^(\s*<[^>\s]+)/,
          `$1 data-block-id="${b.blockId}"`,
        );
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("");
}

/**
 * 将 block tree 转为分块 HTML 数组 + 对应 blockId
 * 用于 diff 对比时按块渲染并标记变更类型
 */
export function versionTreeToBlockHtmls(
  tree: Block,
): Array<{ blockId: string; html: string }> {
  const flat: Block[] = [];
  function walk(block: Block) {
    flat.push(block);
    if (block.children) {
      for (const child of block.children) walk(child);
    }
  }
  walk(tree);

  const contentBlocks = flat
    .filter((b) => b.type !== "root")
    .sort((a, b) => (a.sortKey || "").localeCompare(b.sortKey || ""));

  if (contentBlocks.length === 0) return [];

  if (isLegacyDocument(contentBlocks)) {
    return contentBlocks.map((b) => ({
      blockId: b.blockId,
      html: (b.payload?.html as string) || "",
    }));
  }

  return contentBlocks
    .map((b) => {
      try {
        const node = b.payload as unknown as TiptapNode;
        const doc: TiptapDoc = { type: "doc", content: [node] };
        const html = generateHTML(doc, serializationExtensions);
        return { blockId: b.blockId, html };
      } catch {
        return { blockId: b.blockId, html: "" };
      }
    })
    .filter((b) => b.html);
}

/** 根据变更类型返回 CSS 类名 */
function changeTypeToClass(type: DiffChange["type"]): string {
  switch (type) {
    case "added":
      return "diff-block-added";
    case "deleted":
      return "diff-block-deleted";
    case "modified":
      return "diff-block-modified";
    case "moved":
      return "diff-block-moved";
    case "reordered":
      return "diff-block-reordered";
    case "indent-changed":
      return "diff-block-indent-changed";
    default:
      return "";
  }
}

/**
 * 为 HTML 中带 data-block-id 的元素注入变更高亮 CSS 类
 */
export function annotateBlockChanges(
  html: string,
  changes: DiffChange[],
): string {
  if (!changes.length) return html;

  const changeMap = new Map<string, DiffChange["type"]>();
  for (const c of changes) {
    changeMap.set(c.blockId, c.type);
  }

  // 匹配 data-block-id="xxx" 并注入 class
  return html.replace(
    /(<[^>]*?)data-block-id="([^"]+)"([^>]*?)>/g,
    (_match, prefix, blockId, suffix) => {
      const changeType = changeMap.get(blockId);
      if (!changeType) return `${prefix}data-block-id="${blockId}"${suffix}>`;
      const cls = changeTypeToClass(changeType);
      if (!cls) return `${prefix}data-block-id="${blockId}"${suffix}>`;
      // 如果已有 class 属性，追加；否则新建
      if (/class="/.test(prefix) || /class="/.test(suffix)) {
        return `${prefix}data-block-id="${blockId}"${suffix}>`.replace(
          /class="([^"]*)"/,
          `class="$1 ${cls}"`,
        );
      }
      return `${prefix}data-block-id="${blockId}" class="${cls}"${suffix}>`;
    },
  );
}

/**
 * 根据变更类型为每个块 HTML 包裹高亮 div
 * 用于按块渲染 diff 视图
 */
export function wrapBlockWithChangeClass(
  html: string,
  blockId: string,
  changes: DiffChange[],
): string {
  const change = changes.find((c) => c.blockId === blockId);
  if (!change) return html;
  const cls = changeTypeToClass(change.type);
  if (!cls) return html;
  return `<div class="${cls}">${html}</div>`;
}
