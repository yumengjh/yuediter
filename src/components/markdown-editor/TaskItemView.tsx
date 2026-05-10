import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Checkbox } from "antd";

export default function TaskItemView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper as="li" className="task-list-item">
      <Checkbox
        checked={node.attrs.checked}
        onChange={(e) => updateAttributes({ checked: e.target.checked })}
      />
      <NodeViewContent as="div" className="task-item-content" />
    </NodeViewWrapper>
  );
}
