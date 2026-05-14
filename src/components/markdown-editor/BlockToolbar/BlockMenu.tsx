import { useMemo, useCallback } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  CopyOutlined,
  ScissorOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClearOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import { useMarkdownEditor } from '../EditorContext';

interface BlockMenuProps {
  onClose: () => void;
  hoveredBlock: HTMLElement | null;
}

export function BlockMenu({ onClose, hoveredBlock }: BlockMenuProps) {
  const editor = useMarkdownEditor();

  const canMoveUp = useMemo(() => {
    if (!hoveredBlock) return false;
    return hoveredBlock.previousElementSibling !== null;
  }, [hoveredBlock]);

  const canMoveDown = useMemo(() => {
    if (!hoveredBlock) return false;
    return hoveredBlock.nextElementSibling !== null;
  }, [hoveredBlock]);

  const swapBlocks = useCallback((direction: 'up' | 'down') => {
    if (!editor || !hoveredBlock) return;

    const targetBlock = direction === 'up'
      ? hoveredBlock.previousElementSibling as HTMLElement | null
      : hoveredBlock.nextElementSibling as HTMLElement | null;

    if (!targetBlock) return;

    try {
      const { view } = editor;
      const { state } = view;
      const { doc } = state;

      // posAtDOM → 找到块节点的精确位置
      const hoveredResolved = doc.resolve(view.posAtDOM(hoveredBlock, 0));
      const targetResolved = doc.resolve(view.posAtDOM(targetBlock, 0));

      // before(1) 获取顶层块节点起始位置，after(1) 获取结束位置
      const hoveredStart = hoveredResolved.before(1);
      const hoveredEnd = hoveredResolved.after(1);
      const targetStart = targetResolved.before(1);
      const targetEnd = targetResolved.after(1);

      // 确保 earlier 在前
      const [startA, endA, startB, endB] = hoveredStart < targetStart
        ? [hoveredStart, hoveredEnd, targetStart, targetEnd]
        : [targetStart, targetEnd, hoveredStart, hoveredEnd];

      // 取出两个节点
      const nodeA = doc.nodeAt(startA);
      const nodeB = doc.nodeAt(startB);
      if (!nodeA || !nodeB) return;

      const tr = state.tr;
      // 替换 [startA, endB] 为 [nodeB, nodeA] —— 交换位置
      tr.replaceWith(startA, endB, [nodeB, nodeA]);
      view.dispatch(tr);
    } catch (err) {
      console.error('[BlockMenu] 移动块失败:', err);
    }
  }, [editor, hoveredBlock]);

  const items: MenuProps['items'] = useMemo(() => [
    { key: 'delete',   icon: <DeleteOutlined />,     label: '删除' },
    { key: 'copy',     icon: <CopyOutlined />,       label: '复制' },
    { key: 'cut',      icon: <ScissorOutlined />,    label: '剪切' },
    { type: 'divider' },
    { key: 'clear',    icon: <ClearOutlined />,      label: '清除格式' },
    { type: 'divider' },
    { key: 'addAbove', icon: <PlusCircleOutlined />, label: '在上方添加' },
    { key: 'addBelow', icon: <PlusCircleOutlined />, label: '在下方添加' },
    { type: 'divider' },
    { key: 'moveUp',   icon: <ArrowUpOutlined />,    label: '上移',   disabled: !canMoveUp },
    { key: 'moveDown', icon: <ArrowDownOutlined />,  label: '下移',   disabled: !canMoveDown },
  ], [canMoveUp, canMoveDown]);

  const handleClick: MenuProps['onClick'] = useCallback(({ key }) => {
    switch (key) {
      case 'moveUp':
        swapBlocks('up');
        break;
      case 'moveDown':
        swapBlocks('down');
        break;
      default:
        console.log(`[BlockMenu] 点击: ${key}`);
    }
    onClose();
  }, [swapBlocks, onClose]);

  return (
    <div className="block-menu-popover">
      <Menu
        items={items}
        onClick={handleClick}
        selectable={false}
        style={{ border: 'none', borderRadius: 6 }}
      />
    </div>
  );
}
