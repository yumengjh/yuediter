import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";
import { blockCache } from "./block-cache";

// ─── 类型定义 ───

export interface Document {
  docId: string;
  workspaceId: string;
  title: string;
  icon?: string;
  cover?: string;
  visibility: string;
  status: string;
  parentId?: string;
  rootBlockId: string;
  head: number;
  publishedHead?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Block {
  blockId: string;
  docId: string;
  type: string;
  payload: Record<string, unknown>;
  parentId?: string;
  sortKey: string;
  indent: number;
  collapsed: boolean;
  children?: Block[];
}

// API 返回的文档内容结构
export interface DocumentContentResponse {
  docId: string;
  docVer: number;
  title: string;
  tree: Block; // 单个根块对象（不是数组！）
  pagination?: {
    totalBlocks: number;
    returnedBlocks: number;
    hasMore: boolean;
    nextStartBlockId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// 批量操作类型 — blockId 在顶层（update/delete）
interface BatchCreateOp {
  type: "create";
  data: {
    docId: string;
    type: string;
    payload: Record<string, unknown>;
    parentId?: string;
    sortKey?: string;
  };
}

interface BatchUpdateOp {
  type: "update";
  blockId: string;
  data: {
    payload: Record<string, unknown>;
    plainText?: string;
  };
}

interface BatchDeleteOp {
  type: "delete";
  blockId: string;
}

type BatchOperation = BatchCreateOp | BatchUpdateOp | BatchDeleteOp;

// ─── 文档 CRUD ───

export async function createDocument(data: {
  workspaceId: string;
  title: string;
  icon?: string;
  visibility?: string;
}): Promise<Document> {
  return apiPost<Document>("/documents", data);
}

export async function listDocuments(params: {
  workspaceId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
}): Promise<PaginatedResponse<Document>> {
  const query = new URLSearchParams();
  if (params.workspaceId) query.set("workspaceId", params.workspaceId);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);
  return apiGet<PaginatedResponse<Document>>(
    `/documents?${query.toString()}`,
  );
}

export async function getDocument(docId: string): Promise<Document> {
  return apiGet<Document>(`/documents/${docId}`);
}

export async function getDocumentContent(
  docId: string,
): Promise<DocumentContentResponse> {
  return apiGet<DocumentContentResponse>(`/documents/${docId}/content`);
}

export async function deleteDocument(docId: string): Promise<void> {
  return apiDelete(`/documents/${docId}`);
}

export async function updateDocument(
  docId: string,
  data: { title?: string; icon?: string; visibility?: string },
): Promise<Document> {
  return apiPatch<Document>(`/documents/${docId}`, data);
}

export async function commitVersion(
  docId: string,
  message?: string,
): Promise<void> {
  await apiPost(`/documents/${docId}/commit`, { message });
}

export async function publishDocument(
  docId: string,
): Promise<Document> {
  return apiPost<Document>(`/documents/${docId}/publish`);
}

// ─── 块操作 ───

const BATCH_SIZE = 100;

async function batchOperations(
  docId: string,
  operations: BatchOperation[],
): Promise<void> {
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const chunk = operations.slice(i, i + BATCH_SIZE);
    await apiPost("/blocks/batch", { docId, operations: chunk });
  }
}

// ─── HTML↔块 桥接 ───

/** 从 HTML 标签推断块 type */
function inferBlockType(html: string): string {
  const tag = html.match(/^<([a-z][a-z0-9]*)/i)?.[1]?.toLowerCase();
  if (!tag) return "paragraph";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "pre") return "code";
  if (tag === "table") return "table";
  if (tag === "blockquote") return "blockquote";
  if (tag === "hr") return "hr";
  return "paragraph";
}

/** 将 TipTap 输出的 HTML 拆分为顶级节点的 HTML 字符串数组 */
function splitHtmlToTopLevelNodes(html: string): string[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  const nodes: string[] = [];
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        nodes.push(`<p>${text}</p>`);
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      nodes.push(el.outerHTML);
    }
  }
  return nodes;
}

/** 将块数组拼接为完整 HTML */
function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) => (b.payload?.html as string) || "")
    .filter(Boolean)
    .join("");
}

/** 从根块递归展平为排序后的数组（包含根块自身） */
function flattenBlockTree(root: Block): Block[] {
  const result: Block[] = [root];
  function walk(block: Block) {
    if (block.children?.length) {
      for (const child of block.children) {
        result.push(child);
        walk(child);
      }
    }
  }
  walk(root);
  result.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return result;
}

/**
 * 加载文档内容，返回完整 HTML 字符串
 */
export async function loadDocumentContent(docId: string): Promise<string> {
  const resp = await getDocumentContent(docId);
  if (!resp.tree) return "";

  const flatBlocks = flattenBlockTree(resp.tree);
  // 过滤掉 root 块，只保留内容块
  const contentBlocks = flatBlocks.filter((b) => b.type !== "root");
  // 更新块缓存
  blockCache.set(docId, contentBlocks);
  return blocksToHtml(contentBlocks);
}

/**
 * 保存文档内容：解析 HTML → 拆分顶级节点 → diff 已有块 → 批量增删改
 */
export async function saveDocumentContent(
  docId: string,
  html: string,
  rootBlockId: string,
): Promise<void> {
  // 1. 从缓存获取已有块，缓存为空时 fallback 到 GET
  let existingBlocks = blockCache.get(docId);
  if (!existingBlocks) {
    const resp = await getDocumentContent(docId);
    existingBlocks = resp.tree
      ? flattenBlockTree(resp.tree).filter((b) => b.type !== "root")
      : [];
    blockCache.set(docId, existingBlocks);
  }

  // 2. 解析新 HTML 为顶级节点
  const newNodes = splitHtmlToTopLevelNodes(html);

  // 3. Diff：逐个对比
  const operations: BatchOperation[] = [];
  const maxLen = Math.max(existingBlocks.length, newNodes.length);

  for (let i = 0; i < maxLen; i++) {
    const existing = existingBlocks[i];
    const newNodeHtml = newNodes[i];

    if (existing && newNodeHtml) {
      const existingHtml = (existing.payload?.html as string) || "";
      if (existingHtml !== newNodeHtml) {
        operations.push({
          type: "update",
          blockId: existing.blockId,
          data: { payload: { html: newNodeHtml } },
        });
      }
    } else if (!existing && newNodeHtml) {
      operations.push({
        type: "create",
        data: {
          docId,
          type: inferBlockType(newNodeHtml),
          payload: { html: newNodeHtml },
          parentId: rootBlockId,
        },
      });
    } else if (existing && !newNodeHtml) {
      operations.push({
        type: "delete",
        blockId: existing.blockId,
      });
    }
  }

  // 4. 执行批量操作
  if (operations.length > 0) {
    await batchOperations(docId, operations);
  }

  // 5. 更新缓存
  const hasCreateOrDelete = operations.some(
    (op) => op.type === "create" || op.type === "delete",
  );
  if (hasCreateOrDelete) {
    // 有新增/删除操作时，重新加载获取真实的 blockId
    const resp = await getDocumentContent(docId);
    const blocks = resp.tree
      ? flattenBlockTree(resp.tree).filter((b) => b.type !== "root")
      : [];
    blockCache.replace(docId, blocks);
  } else {
    // 只有 update 操作时，直接更新缓存中的 payload
    const updatedBlocks = newNodes.map((html, i) => {
      const existing = existingBlocks[i];
      if (existing) {
        return { ...existing, payload: { html } };
      }
      return existing!;
    });
    blockCache.replace(docId, updatedBlocks);
  }
}
