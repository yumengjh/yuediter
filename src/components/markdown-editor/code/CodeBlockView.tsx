import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";

export default function CodeBlockView({ node, selected }: NodeViewProps) {
  const lineCount = (node.textContent || "").split("\n").length;

  return (
    <NodeViewWrapper
      className={`code-block-view ${selected ? "is-selected" : ""}`}
      as="pre"
      draggable={false}
    >
      <div className="code-block-line-numbers" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="code-block-line-number">
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code-block-content">
        <NodeViewContent as={"code" as "div"} spellCheck={false} />
      </div>
    </NodeViewWrapper>
  );
}
