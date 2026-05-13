import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlightBlock: {
      insertHighlightBlock: (options?: { backgroundColor?: string }) => ReturnType;
      updateHighlightBlockColor: (color: string) => ReturnType;
    };
  }
}

export const DEFAULT_HIGHLIGHT_BLOCK_COLOR = "#FFF2CC";

export const HighlightBlock = Node.create({
  name: "highlightBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      backgroundColor: {
        default: DEFAULT_HIGHLIGHT_BLOCK_COLOR,
        parseHTML: (element) =>
          element.style.backgroundColor || DEFAULT_HIGHLIGHT_BLOCK_COLOR,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return { style: `background-color: ${attributes.backgroundColor}` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-highlight-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-highlight-block": "" }),
      0,
    ];
  },

  addCommands() {
    return {
      insertHighlightBlock:
        (options) =>
        ({ commands }) => {
          const color =
            options?.backgroundColor || DEFAULT_HIGHLIGHT_BLOCK_COLOR;
          return commands.insertContent(
            `<div data-highlight-block="" style="background-color: ${color}"><p></p></div>`,
          );
        },
      updateHighlightBlockColor:
        (color) =>
        ({ commands }) => {
          return commands.updateAttributes("highlightBlock", {
            backgroundColor: color,
          });
        },
    };
  },
});
