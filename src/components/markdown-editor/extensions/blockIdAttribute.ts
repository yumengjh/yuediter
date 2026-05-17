import { Extension } from "@tiptap/core";

/**
 * 为所有块级节点注册 data-block-id 全局属性，
 * 使 ProseMirror 在解析/渲染 HTML 时保留服务器块 ID。
 */
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
          "data-block-id": {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => {
              if (!attributes["data-block-id"]) return {};
              return { "data-block-id": attributes["data-block-id"] };
            },
          },
        },
      },
    ];
  },
});
