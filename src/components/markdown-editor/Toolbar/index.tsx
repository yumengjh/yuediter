import { useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Dropdown, Tooltip, message, Input, Modal, Space, ColorPicker, Divider } from "antd";
import type { Editor } from "@tiptap/react";
import {
  UndoOutlined,
  RedoOutlined,
  ClearOutlined,
  EditOutlined,
  BoldOutlined,
  ItalicOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  CheckSquareOutlined,
  LinkOutlined,
  CodeOutlined,
  DownOutlined,
  BgColorsOutlined,
  TableOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import { useMarkdownEditor } from "../EditorContext";
import {
  titleLevelItems,
  fontSizeItems,
  codeLanguageItems,
  orderedListTypeItems,
  defaultColor,
  solidColors,
  gradientColors,
} from "./data";
import TablePicker from "./TablePicker";
import "./style.css";

function QuoteIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5 3.871 3.871 0 0 1-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5 3.871 3.871 0 0 1-2.748-1.179z" />
    </svg>
  );
}

type ToolbarItem = {
  id: string;
  label: string;
  content: ReactNode;
  type?: "dropdown" | "color-picker" | "table-picker";
};

export default function Toolbar() {
  const editor = useMarkdownEditor();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [selectedBgColor, setSelectedBgColor] = useState("#FFFF00");
  const tiptap = editor as Editor | null;
  const editorReady = Boolean(tiptap);
  const [, forceUpdate] = useState(0);
  const colorSelectTimeoutRef = useRef<number | null>(null);
  const bgColorSelectTimeoutRef = useRef<number | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState<Record<string, boolean>>({});
  const [tablePickerOpen, setTablePickerOpen] = useState(false);

  useEffect(() => {
    if (!tiptap) return;

    const rerender = () => {
      forceUpdate((v) => v + 1);
    };

    tiptap.on("transaction", rerender);
    tiptap.on("selectionUpdate", rerender);

    return () => {
      tiptap.off("transaction", rerender);
      tiptap.off("selectionUpdate", rerender);
    };
  }, [tiptap]);

  const openLinkModal = () => {
    if (!tiptap) return;
    const { from, to } = tiptap.state.selection;
    const selectedText = tiptap.state.doc.textBetween(from, to);
    const existingLink = tiptap.getAttributes("link");

    setLinkValue(existingLink.href || selectedText || "");
    setLinkModalOpen(true);
  };

  const applyLink = () => {
    if (!tiptap) return;
    const url = linkValue.trim();

    if (url) {
      const href = url.match(/^https?:\/\//) ? url : `https://${url}`;
      tiptap.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      tiptap.chain().focus().unsetLink().run();
    }

    setLinkModalOpen(false);
    setLinkValue("");
  };

  const handleClick = (id: string) => () => {
    if (!tiptap) return;
    switch (id) {
      case "undo":
        tiptap.chain().focus().undo().run();
        break;
      case "redo":
        tiptap.chain().focus().redo().run();
        break;
      case "clearFormat":
        tiptap.chain().focus().unsetAllMarks().clearNodes().run();
        break;
      case "cursor":
        tiptap.chain().focus().run();
        break;
      case "bold":
        tiptap.chain().focus().toggleBold().run();
        break;
      case "italic":
        tiptap.chain().focus().toggleItalic().run();
        break;
      case "strike":
        tiptap.chain().focus().toggleStrike().run();
        break;
      case "underline":
        tiptap.chain().focus().toggleUnderline().run();
        break;
      case "align-left":
        tiptap.chain().focus().setTextAlign("left").run();
        break;
      case "align-center":
        tiptap.chain().focus().setTextAlign("center").run();
        break;
      case "align-right":
        tiptap.chain().focus().setTextAlign("right").run();
        break;
      case "align-justify":
        tiptap.chain().focus().setTextAlign("justify").run();
        break;
      case "bullet-list":
        tiptap.chain().focus().toggleBulletList().run();
        break;
      case "check-list":
        tiptap.chain().focus().toggleTaskList().run();
        break;
      case "blockquote":
        tiptap.chain().focus().toggleBlockquote().run();
        break;
      case "code-block":
        tiptap.chain().focus().toggleCodeBlock().run();
        break;
      case "divider":
        tiptap.chain().focus().setHorizontalRule().run();
        break;
      case "link":
        openLinkModal();
        break;
      default:
        break;
    }
  };

  const getCurrentHeadingKey = (): string => {
    if (!tiptap) return "0";
    for (let i = 1; i <= 6; i++) {
      if (tiptap.isActive("heading", { level: i as 1 | 2 | 3 | 4 | 5 | 6 })) {
        return `${i}`;
      }
    }
    return "0";
  };

  const getCurrentCodeLanguage = (): string => {
    if (!tiptap || !tiptap.isActive("codeBlock")) return "text";
    const language = tiptap.getAttributes("codeBlock")?.language;
    if (typeof language === "string" && language.trim()) {
      return language.trim().toLowerCase();
    }
    return "text";
  };

  const dropdownHandlers: Record<string, (key: string) => void> = {
    "text-mode": (key: string) => {
      if (!tiptap) return;
      const level = Number(key);
      if (level === 0) {
        tiptap.chain().focus().setParagraph().run();
      } else if (level >= 1 && level <= 6) {
        tiptap
          .chain()
          .focus()
          .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
          .run();
      }
    },
    "font-size": (key: string) => {
      if (!tiptap) return;
      const size = key.replace("px", "");
      tiptap.chain().focus().setFontSize(size).run();
    },
    "text-align": (key: string) => {
      if (!tiptap) return;
      tiptap
        .chain()
        .focus()
        .setTextAlign(key as "left" | "center" | "right" | "justify")
        .run();
    },
    "ordered-list": (key: string) => {
      if (!tiptap) return;
      if (!tiptap.isActive("orderedList")) {
        tiptap.chain().focus().toggleOrderedList().run();
      }
      const listItems = document.querySelectorAll(".tiptap-editor ol li");
      listItems.forEach((item) => {
        (item as HTMLElement).style.listStyleType = key;
      });
    },
    "code-language": (key: string) => {
      if (!tiptap) return;
      if (!tiptap.isActive("codeBlock")) {
        tiptap.chain().focus().setCodeBlock({ language: key }).run();
        return;
      }
      tiptap.chain().focus().updateAttributes("codeBlock", { language: key }).run();
    },
  };

  const handleColorSelect = useCallback(
    (color: string) => {
      if (!tiptap) return;

      setSelectedColor(color);

      if (colorSelectTimeoutRef.current) {
        clearTimeout(colorSelectTimeoutRef.current);
      }

      colorSelectTimeoutRef.current = window.setTimeout(() => {
        tiptap.chain().focus().setColor(color).run();
      }, 300);
    },
    [tiptap],
  );

  const handleBgColorSelect = useCallback(
    (color: string) => {
      if (!tiptap) return;

      setSelectedBgColor(color);

      if (bgColorSelectTimeoutRef.current) {
        clearTimeout(bgColorSelectTimeoutRef.current);
      }

      bgColorSelectTimeoutRef.current = window.setTimeout(() => {
        tiptap.chain().focus().toggleHighlight({ color }).run();
      }, 300);
    },
    [tiptap],
  );

  useEffect(() => {
    return () => {
      if (colorSelectTimeoutRef.current !== null) {
        window.clearTimeout(colorSelectTimeoutRef.current);
      }
      if (bgColorSelectTimeoutRef.current !== null) {
        window.clearTimeout(bgColorSelectTimeoutRef.current);
      }
    };
  }, []);

  const handleGradientSelect = (gradientId: string) => {
    message.info(`渐变色选择功能暂未实现。选择的渐变: ${gradientId}`);
  };

  const handleTableInsert = useCallback(
    (rows: number, cols: number) => {
      if (!tiptap) return;
      tiptap
        .chain()
        .focus()
        .insertTable({ rows, cols, withHeaderRow: true })
        .run();
      setTablePickerOpen(false);
    },
    [tiptap],
  );

  const isActive = (id: string): boolean => {
    if (!tiptap) return false;
    switch (id) {
      case "bold":
        return tiptap.isActive("bold");
      case "italic":
        return tiptap.isActive("italic");
      case "strike":
        return tiptap.isActive("strike");
      case "underline":
        return tiptap.isActive("underline");
      case "align-left":
        return (tiptap.getAttributes("textAlign")?.textAlign || "left") === "left";
      case "align-center":
        return (tiptap.getAttributes("textAlign")?.textAlign || "left") === "center";
      case "align-right":
        return (tiptap.getAttributes("textAlign")?.textAlign || "left") === "right";
      case "align-justify":
        return (tiptap.getAttributes("textAlign")?.textAlign || "left") === "justify";
      case "bullet-list":
        return tiptap.isActive("bulletList");
      case "check-list":
        return tiptap.isActive("taskList");
      case "ordered-list":
        return tiptap.isActive("orderedList");
      case "blockquote":
        return tiptap.isActive("blockquote");
      case "code-block":
        return tiptap.isActive("codeBlock");
      case "divider":
        return tiptap.isActive("horizontalRule");
      default:
        return false;
    }
  };

  const getCurrentHeadingLevel = (): string => {
    if (!tiptap) return "正文";
    for (let i = 1; i <= 6; i++) {
      if (tiptap.isActive("heading", { level: i as 1 | 2 | 3 | 4 | 5 | 6 })) {
        return `标题 ${i}`;
      }
    }
    return "正文";
  };

  const getCurrentFontSize = (): string => {
    if (!tiptap) return "15px";
    const textStyle = tiptap.getAttributes("textStyle");
    const fontSize = textStyle?.fontSize;
    if (fontSize) {
      return `${fontSize}px`;
    }
    return "15px";
  };

  const alignItems = [
    { key: "left", label: "左对齐", icon: <AlignLeftOutlined /> },
    { key: "center", label: "居中", icon: <AlignCenterOutlined /> },
    { key: "right", label: "右对齐", icon: <AlignRightOutlined /> },
    {
      key: "justify",
      label: "两端对齐",
      icon: <AlignLeftOutlined style={{ transform: "scaleX(-1)" }} />,
    },
  ].map((item) => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
  }));

  const getCurrentAlignment = (): { label: string; icon: ReactNode; key: string } => {
    if (!tiptap) {
      return { label: "左对齐", icon: <AlignLeftOutlined />, key: "left" };
    }
    const align = (tiptap.getAttributes("paragraph")?.textAlign ||
      tiptap.getAttributes("heading")?.textAlign ||
      "left") as string;
    const alignMap: Record<string, { label: string; icon: ReactNode }> = {
      left: { label: "左对齐", icon: <AlignLeftOutlined /> },
      center: { label: "居中", icon: <AlignCenterOutlined /> },
      right: { label: "右对齐", icon: <AlignRightOutlined /> },
      justify: {
        label: "两端对齐",
        icon: <AlignLeftOutlined style={{ transform: "scaleX(-1)" }} />,
      },
    };
    return { ...(alignMap[align] || alignMap.left), key: align };
  };

  const getCurrentOrderedListType = (): string => {
    if (!tiptap || !tiptap.isActive("orderedList")) {
      return "decimal";
    }
    return "decimal";
  };

  const toolbarGroups: ToolbarItem[][] = [
    [
      { id: "undo", label: "撤销", content: <UndoOutlined /> },
      { id: "redo", label: "重做", content: <RedoOutlined /> },
      { id: "clearFormat", label: "清除格式", content: <ClearOutlined /> },
    ],
    [{ id: "cursor", label: "光标", content: <EditOutlined /> }],
    [
      {
        id: "text-mode",
        label: "标题",
        content: <span className="text-label heading-text">{getCurrentHeadingLevel()}</span>,
        type: "dropdown",
      },
      {
        id: "font-size",
        label: "字号",
        content: <span className="text-label">{getCurrentFontSize()}</span>,
        type: "dropdown",
      },
    ],
    [
      { id: "bold", label: "加粗", content: <BoldOutlined /> },
      { id: "italic", label: "斜体", content: <ItalicOutlined /> },
      { id: "strike", label: "删除线", content: <StrikethroughOutlined /> },
      { id: "underline", label: "下划线", content: <UnderlineOutlined /> },
    ],
    [
      {
        id: "text-color",
        label: "文字颜色",
        content: (
          <span className="color-icon-wrap">
            <EditOutlined />
            <span className="color-icon-indicator" style={{ backgroundColor: selectedColor }} />
          </span>
        ),
        type: "color-picker",
      },
      {
        id: "bg-color",
        label: "背景颜色",
        content: (
          <span className="color-icon-wrap">
            <BgColorsOutlined />
            <span className="color-icon-indicator" style={{ backgroundColor: selectedBgColor }} />
          </span>
        ),
        type: "color-picker",
      },
    ],
    [
      {
        id: "text-align",
        label: "对齐",
        content: <span className="dropdown-icon-text">{getCurrentAlignment().icon}</span>,
        type: "dropdown",
      },
    ],
    [
      { id: "bullet-list", label: "无序列表", content: <UnorderedListOutlined /> },
      {
        id: "ordered-list",
        label: "有序列表",
        content: (
          <span className="dropdown-icon-text">
            <OrderedListOutlined />
            <span className="text-label">
              {orderedListTypeItems.find((item) => item.key === getCurrentOrderedListType())
                ?.description || "数字"}
            </span>
          </span>
        ),
        type: "dropdown",
      },
      { id: "check-list", label: "待办列表", content: <CheckSquareOutlined /> },
    ],
    [
      { id: "blockquote", label: "引用", content: <QuoteIcon /> },
      { id: "divider", label: "分割线", content: <MinusOutlined /> },
      {
        id: "code-language",
        label: "代码语言",
        content: <CodeOutlined />,
        type: "dropdown",
      },
      { id: "link", label: "链接", content: <LinkOutlined /> },
      { id: "table", label: "表格", content: <TableOutlined />, type: "table-picker" },
    ],
  ];

  return (
    <div className="toolbar">
      {toolbarGroups.map((group, index) => (
        <div className="toolbar-group" key={`toolbar-group-${index}`}>
          {group.map((item) =>
            item.type === "dropdown" ? (
              <Tooltip
                key={item.id}
                placement="bottom"
                title={item.label}
                trigger="hover"
                mouseEnterDelay={0.5}
                open={tooltipOpen[item.id]}
                onOpenChange={(open) => {
                  setTooltipOpen((prev) => ({ ...prev, [item.id]: open }));
                }}
              >
                <Dropdown
                  overlayClassName={item.id === "text-align" ? "align-dropdown" : undefined}
                  dropdownRender={
                    item.id === "text-align"
                      ? () => {
                          const current = getCurrentAlignment().key;
                          return (
                            <div className="align-menu-panel">
                              <div className="align-menu-row">
                                {alignItems.map((alignItem) => {
                                  const active = alignItem.key === current;
                                  return (
                                    <Tooltip
                                      key={alignItem.key}
                                      title={alignItem.label}
                                      placement="bottom"
                                    >
                                      <button
                                        type="button"
                                        className={
                                          active ? "align-menu-btn is-active" : "align-menu-btn"
                                        }
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          dropdownHandlers["text-align"]?.(alignItem.key);
                                        }}
                                      >
                                        {alignItem.icon}
                                      </button>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                      : undefined
                  }
                  menu={{
                    items:
                      item.id === "text-mode"
                        ? titleLevelItems.map((levelItem) => {
                            const active = levelItem.key === getCurrentHeadingKey();
                            return {
                              key: levelItem.key,
                              label: (
                                <div
                                  className={
                                    active ? "heading-menu-item is-active" : "heading-menu-item"
                                  }
                                >
                                  <div className="heading-menu-left">
                                    <span className="heading-menu-check">{active ? "✓" : ""}</span>
                                    <span
                                      className={
                                        levelItem.key === "0"
                                          ? "heading-menu-label is-body"
                                          : `heading-menu-label is-${levelItem.size}`
                                      }
                                    >
                                      {levelItem.label}
                                    </span>
                                  </div>
                                  <div className="heading-menu-shortcut">{levelItem.shortcut}</div>
                                </div>
                              ),
                            };
                          })
                        : item.id === "text-align"
                          ? alignItems.map((alignItem) => {
                              const currentAlign = getCurrentAlignment();
                              return {
                                key: alignItem.key,
                                label: alignItem.icon,
                                ...(alignItem.key === currentAlign.key
                                  ? { icon: <span className="menu-check-mark">✓</span> }
                                  : {}),
                              };
                            })
                          : item.id === "ordered-list"
                            ? orderedListTypeItems.map((listItem) => ({
                                ...listItem,
                                label: `${listItem.label} ${listItem.description}`,
                                ...(listItem.key === getCurrentOrderedListType()
                                  ? { icon: <span className="menu-check-mark">✓</span> }
                                  : {}),
                              }))
                            : item.id === "font-size"
                              ? fontSizeItems.map((sizeItem) => {
                                  const active = sizeItem.key === getCurrentFontSize();
                                  return {
                                    key: sizeItem.key,
                                    label: (
                                      <div className="font-size-menu-item">
                                        <span className="font-size-menu-check">
                                          {active ? "✓" : ""}
                                        </span>
                                        <span className="font-size-menu-label">
                                          {sizeItem.label}
                                        </span>
                                      </div>
                                    ),
                                  };
                                })
                              : item.id === "code-language"
                                ? codeLanguageItems.map((langItem) => {
                                    const active = langItem.key === getCurrentCodeLanguage();
                                    return {
                                      key: langItem.key,
                                      label: langItem.label,
                                      ...(active
                                        ? { icon: <span className="menu-check-mark">✓</span> }
                                        : {}),
                                    };
                                  })
                                : fontSizeItems,
                    onClick: ({ key }: { key: string }) => {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                      const handler = dropdownHandlers[item.id];
                      if (handler) handler(key);
                    },
                  }}
                  trigger={["click"]}
                  disabled={!editorReady}
                  onOpenChange={(open) => {
                    if (open) {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }
                  }}
                >
                  <button
                    type="button"
                    className="dropdown-trigger-button"
                    disabled={!editorReady}
                    aria-label={item.label}
                    onClick={() => {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }}
                  >
                    <span className="dropdown-text">{item.content}</span>
                    <span className="dropdown-caret">
                      <DownOutlined className="dropdown-arrow" />
                    </span>
                  </button>
                </Dropdown>
              </Tooltip>
            ) : item.type === "color-picker" ? (
              <Tooltip
                key={item.id}
                placement="bottom"
                title={item.label}
                trigger="hover"
                mouseEnterDelay={0.5}
                open={tooltipOpen[item.id]}
                onOpenChange={(open) => {
                  setTooltipOpen((prev) => ({ ...prev, [item.id]: open }));
                }}
              >
                <Dropdown
                  placement="bottomLeft"
                  align={{ offset: [0, 4] }}
                  overlayClassName="toolbar-color-dropdown"
                  onOpenChange={(open) => {
                    if (open) {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }
                  }}
                  dropdownRender={() => {
                    const isBgColor = item.id === "bg-color";
                    const currentColor = isBgColor ? selectedBgColor : selectedColor;
                    const handleSelect = isBgColor ? handleBgColorSelect : handleColorSelect;

                    return (
                      <div className="color-picker-dropdown">
                        <div className="color-picker-section">
                          <div className="color-picker-header">
                            <span>默认</span>
                          </div>
                          <div className="color-grid">
                            {solidColors.map((row, rowIndex) => (
                              <div key={rowIndex} className="color-grid-row">
                                {row.map((color) => (
                                  <div
                                    key={color}
                                    className={`color-swatch ${currentColor === color ? "selected" : ""}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleSelect(color)}
                                    title={color}
                                  >
                                    {currentColor === color && (
                                      <span className="color-checkmark">✓</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="color-picker-section">
                          <div className="color-picker-header">
                            <span>渐变色</span>
                          </div>
                          <div className="gradient-grid">
                            {gradientColors.map((gradient) => (
                              <div
                                key={gradient.id}
                                className="gradient-swatch"
                                style={{
                                  background: `linear-gradient(to right, ${gradient.colors[0]}, ${gradient.colors[1]})`,
                                }}
                                onClick={() => handleGradientSelect(gradient.id)}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="color-picker-section">
                          <div className="color-picker-header">
                            <span>最近使用自定义颜色</span>
                          </div>
                          <div className="color-picker-empty">暂无</div>
                        </div>

                        <Divider style={{ margin: "6px 0" }} />

                        <div className="color-picker-section">
                          <div className="color-picker-header-advanced">
                            <div className="color-picker-header">
                              <BgColorsOutlined style={{ fontSize: "12px" }} />
                              <span>更多颜色</span>
                            </div>
                            <div className="color-picker-advanced">
                              <ColorPicker
                                value={currentColor}
                                onChange={(color) => {
                                  const hexColor = color.toHexString();
                                  if (isBgColor) {
                                    setSelectedBgColor(hexColor);
                                  } else {
                                    setSelectedColor(hexColor);
                                  }
                                  handleSelect(hexColor);
                                }}
                                showText
                                size="small"
                                getPopupContainer={(triggerNode) => {
                                  const dropdown = triggerNode.closest(
                                    ".ant-dropdown",
                                  ) as HTMLElement;
                                  return dropdown || document.body;
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  trigger={["click"]}
                  disabled={!editorReady}
                >
                  <button
                    type="button"
                    className="dropdown-trigger-button"
                    disabled={!editorReady}
                    aria-label={item.label}
                    onClick={() => {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }}
                  >
                    <span className="dropdown-text">{item.content}</span>
                    <span className="dropdown-caret">
                      <DownOutlined className="dropdown-arrow" />
                    </span>
                  </button>
                </Dropdown>
              </Tooltip>
            ) : item.type === "table-picker" ? (
              <Tooltip
                key={item.id}
                placement="bottom"
                title={item.label}
                trigger="hover"
                mouseEnterDelay={0.5}
                open={tooltipOpen[item.id]}
                onOpenChange={(open) => {
                  setTooltipOpen((prev) => ({ ...prev, [item.id]: open }));
                }}
              >
                <Dropdown
                  placement="bottomLeft"
                  align={{ offset: [0, 4] }}
                  overlayClassName="toolbar-table-dropdown"
                  open={tablePickerOpen}
                  onOpenChange={(open) => {
                    setTablePickerOpen(open);
                    if (open) {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }
                  }}
                  dropdownRender={() => <TablePicker onSelect={handleTableInsert} />}
                  trigger={["click"]}
                  disabled={!editorReady}
                >
                  <button
                    type="button"
                    className="dropdown-trigger-button"
                    disabled={!editorReady}
                    aria-label={item.label}
                    onClick={() => {
                      setTooltipOpen((prev) => ({ ...prev, [item.id]: false }));
                    }}
                  >
                    <span className="dropdown-text">{item.content}</span>
                    <span className="dropdown-caret">
                      <DownOutlined className="dropdown-arrow" />
                    </span>
                  </button>
                </Dropdown>
              </Tooltip>
            ) : (
              <button
                key={item.id}
                type="button"
                className={`toolbar-button ${isActive(item.id) ? "active" : ""}`}
                disabled={!editorReady}
                aria-label={item.label}
                onClick={handleClick(item.id)}
              >
                <Tooltip placement="bottom" title={item.label}>
                  <span className="toolbar-content">{item.content}</span>
                </Tooltip>
              </button>
            ),
          )}
        </div>
      ))}

      <Modal
        title="插入链接"
        open={linkModalOpen}
        onOk={applyLink}
        onCancel={() => setLinkModalOpen(false)}
        okText="应用"
        cancelText="取消"
      >
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://example.com"
            allowClear
          />
        </Space>
      </Modal>
    </div>
  );
}
