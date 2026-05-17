/**
 * 服务端 Block tree → HTML 渲染
 * 使用 Tiptap generateHTML 官方 API + jsdom 补丁（仅 Node.js 环境）
 */
import { generateHTML } from "@tiptap/core";
import { serializationExtensions } from "./tiptap-extensions";
import {
  detectPayloadFormat,
  type TiptapNode,
  type TiptapDoc,
} from "./tiptap-converter";

// jsdom 补丁：仅在服务端（无 window 且无 document）时注入
let jsdomReady = false;

function ensureJsdom() {
  if (jsdomReady) return;
  if (typeof window !== "undefined") {
    // 浏览器环境，无需补丁
    jsdomReady = true;
    return;
  }
  if (typeof (globalThis as Record<string, unknown>).document !== "undefined") {
    // 已有 DOM 环境（如测试框架注入的 jsdom）
    jsdomReady = true;
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JSDOM } = require("jsdom") as typeof import("jsdom");
    const dom = new JSDOM();
    (globalThis as Record<string, unknown>).document = dom.window.document;
    (globalThis as Record<string, unknown>).window = dom.window;
    (globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;
    (globalThis as Record<string, unknown>).Node = dom.window.Node;
    (globalThis as Record<string, unknown>).Element = dom.window.Element;
    jsdomReady = true;
  } catch (e) {
    console.error("[generate-block-html] jsdom 初始化失败，JSON 格式文档将无法渲染:", e);
  }
}

interface Block {
  blockId: string;
  type: string;
  payload: Record<string, unknown>;
  sortKey?: string;
  children?: Block[];
}

/**
 * 从 block tree 生成 HTML，兼容旧格式（payload.html）和新格式（Tiptap JSON）
 */
export function renderBlockTreeToHtml(tree: Block): string {
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

  const isLegacy = contentBlocks.every(
    (b) => detectPayloadFormat(b.payload) === "html",
  );

  if (isLegacy) {
    return contentBlocks
      .map((b) => (b.payload?.html as string) || "")
      .filter(Boolean)
      .join("");
  }

  ensureJsdom();

  return contentBlocks
    .map((b) => {
      try {
        const node = b.payload as unknown as TiptapNode;
        const doc: TiptapDoc = { type: "doc", content: [node] };
        return generateHTML(doc, serializationExtensions);
      } catch (e) {
        console.warn("[generate-block-html] block 渲染失败，跳过:", b.blockId, e);
        return "";
      }
    })
    .join("");
}
