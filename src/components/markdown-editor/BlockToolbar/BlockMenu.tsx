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

const items: MenuProps['items'] = [
  { key: 'delete',   icon: <DeleteOutlined />,     label: '删除' },
  { key: 'copy',     icon: <CopyOutlined />,       label: '复制' },
  { key: 'cut',      icon: <ScissorOutlined />,    label: '剪切' },
  { type: 'divider' },
  { key: 'clear',    icon: <ClearOutlined />,      label: '清除格式' },
  { type: 'divider' },
  { key: 'addAbove', icon: <PlusCircleOutlined />, label: '在上方添加' },
  { key: 'addBelow', icon: <PlusCircleOutlined />, label: '在下方添加' },
  { type: 'divider' },
  { key: 'moveUp',   icon: <ArrowUpOutlined />,    label: '上移' },
  { key: 'moveDown', icon: <ArrowDownOutlined />,  label: '下移' },
];

interface BlockMenuProps {
  onClose: () => void;
}

export function BlockMenu({ onClose }: BlockMenuProps) {
  const handleClick: MenuProps['onClick'] = ({ key }) => {
    console.log(`[BlockMenu] 点击: ${key}`);
    onClose();
  };

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
