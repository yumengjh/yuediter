import { describe, expect, it } from "vitest";
import {
  createClientId,
  ensureBlockIdentity,
  ensureDocumentIdentity,
  readIdentityFromAttrs,
} from "../identity";

describe("identity", () => {
  it("readIdentityFromAttrs 优先读取 blockId/clientId", () => {
    const identity = readIdentityFromAttrs({
      blockId: "block-main",
      "data-block-id": "block-legacy",
      clientId: "client-main",
      "data-client-id": "client-legacy",
    });

    expect(identity).toEqual({
      blockId: "block-main",
      clientId: "client-main",
    });
  });

  it("readIdentityFromAttrs 支持 data-* 回退", () => {
    const identity = readIdentityFromAttrs({
      "data-block-id": "block-legacy",
      "data-client-id": "client-legacy",
    });

    expect(identity).toEqual({
      blockId: "block-legacy",
      clientId: "client-legacy",
    });
  });

  it("ensureBlockIdentity 保留 blockId 并补充 clientId", () => {
    const node = ensureBlockIdentity({
      type: "paragraph",
      attrs: {
        blockId: "block-1",
      },
      content: [],
    });

    expect(node.attrs?.blockId).toBe("block-1");
    expect(typeof node.attrs?.clientId).toBe("string");
    expect((node.attrs?.clientId as string).length).toBeGreaterThan(0);
  });

  it("ensureBlockIdentity 不为非块级节点注入 attrs", () => {
    const textNode = { type: "text", text: "hello" };
    const nextNode = ensureBlockIdentity(textNode);
    expect(nextNode).toBe(textNode);
  });

  it("ensureDocumentIdentity 只处理顶层 block，并保留已有 blockId", () => {
    const doc = ensureDocumentIdentity({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-a", clientId: "client-a" },
          content: [{ type: "text", text: "hello" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "world" }],
        },
      ],
    });

    expect(doc.content?.[0].attrs?.blockId).toBe("block-a");
    expect(doc.content?.[0].attrs?.clientId).toBe("client-a");
    expect(typeof doc.content?.[1].attrs?.clientId).toBe("string");
    expect(doc.content?.[1].attrs?.blockId).toBeUndefined();
    expect(doc.content?.[0].content?.[0].attrs).toBeUndefined();
  });

  it("ensureDocumentIdentity 若已有稳定身份则保持引用不变", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "b-1", clientId: "c-1" },
        },
      ],
    };

    const nextDoc = ensureDocumentIdentity(doc);
    expect(nextDoc).toBe(doc);
  });

  it("createClientId 返回可用标识", () => {
    const id = createClientId();
    expect(id.startsWith("cid_")).toBe(true);
    expect(id.length).toBeGreaterThan(8);
  });
});
