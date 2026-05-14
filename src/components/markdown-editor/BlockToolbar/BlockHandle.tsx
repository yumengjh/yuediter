import './style.css';

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="2" r="1.2" />
      <circle cx="10" cy="2" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="12" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </svg>
  );
}

interface BlockHandleProps {
  onClick: () => void;
}

export function BlockHandle({ onClick }: BlockHandleProps) {
  return (
    <button
      className="block-handle__btn"
      onClick={onClick}
      title="点击打开菜单"
    >
      <DragHandleIcon />
    </button>
  );
}
