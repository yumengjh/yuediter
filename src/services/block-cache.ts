import type { Block } from "./document";

/** 前端块状态缓存，避免每次保存都重新加载完整文档 */
class BlockCache {
  private cache = new Map<string, Block[]>();

  /** 设置指定文档的块快照 */
  set(docId: string, blocks: Block[]): void {
    this.cache.set(docId, [...blocks]);
  }

  /** 获取指定文档的块快照，不存在返回 null */
  get(docId: string): Block[] | null {
    return this.cache.get(docId) ?? null;
  }

  /** 增量更新：应用批量操作到缓存 */
  applyBatch(
    docId: string,
    operations: { type: string; blockId?: string; data?: any }[],
  ): void {
    const blocks = this.cache.get(docId);
    if (!blocks) return;

    for (const op of operations) {
      if (op.type === "create" && op.data) {
        // batch 响应中 create 操作会返回新块，但当前 API 不返回
        // 所以这里无法直接添加，需要在调用方处理
      } else if (op.type === "update" && op.blockId) {
        const idx = blocks.findIndex((b) => b.blockId === op.blockId);
        if (idx !== -1) {
          blocks[idx] = {
            ...blocks[idx],
            payload: { ...blocks[idx].payload, ...op.data?.payload },
          };
        }
      } else if (op.type === "delete" && op.blockId) {
        const idx = blocks.findIndex((b) => b.blockId === op.blockId);
        if (idx !== -1) {
          blocks.splice(idx, 1);
        }
      }
    }
  }

  /** 替换指定文档的整个缓存（用于保存后重建） */
  replace(docId: string, blocks: Block[]): void {
    this.cache.set(docId, [...blocks]);
  }

  /** 清除指定文档的缓存 */
  clear(docId: string): void {
    this.cache.delete(docId);
  }

  /** 清除所有缓存 */
  clearAll(): void {
    this.cache.clear();
  }
}

export const blockCache = new BlockCache();
