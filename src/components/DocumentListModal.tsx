"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Modal, Input, Button, Tag, Popconfirm, message, Empty, Tooltip } from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  TeamOutlined,
  GlobalOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useDocument } from "../contexts/DocumentContext";
import "./DocumentListModal.css";

interface DocumentListModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (docId: string) => void;
  onCreateNew: () => void;
  currentDocId?: string;
}

export function DocumentListModal({
  open,
  onClose,
  onSelect,
  onCreateNew,
  currentDocId,
}: DocumentListModalProps) {
  const { documents, updateDoc, deleteDoc, refreshDocs } = useDocument();
  const [searchText, setSearchText] = useState("");
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearchText("");
      setRenamingDocId(null);
      refreshDocs().catch(() => {});
    }
  }, [open, refreshDocs]);

  useEffect(() => {
    if (renamingDocId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingDocId]);

  const filtered = useMemo(() => {
    if (!searchText.trim()) return documents;
    const q = searchText.toLowerCase();
    return documents.filter((d) => d.title.toLowerCase().includes(q));
  }, [documents, searchText]);

  const handleStartRename = useCallback(
    (e: React.MouseEvent, docId: string, title: string) => {
      e.stopPropagation();
      setRenamingDocId(docId);
      setRenameValue(title);
    },
    [],
  );

  const handleSaveRename = useCallback(
    async (docId: string) => {
      const trimmed = renameValue.trim();
      setRenamingDocId(null);
      if (!trimmed) return;
      const doc = documents.find((d) => d.docId === docId);
      if (!doc || trimmed === doc.title) return;
      try {
        await updateDoc(docId, { title: trimmed });
        message.success("重命名成功");
      } catch {
        message.error("重命名失败");
      }
    },
    [renameValue, documents, updateDoc],
  );

  const handleDelete = useCallback(
    async (docId: string) => {
      try {
        await deleteDoc(docId);
        message.success("文档已删除");
      } catch {
        message.error("删除失败");
      }
    },
    [deleteDoc],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, docId: string) => {
      if (e.key === "Enter") {
        handleSaveRename(docId);
      } else if (e.key === "Escape") {
        setRenamingDocId(null);
      }
    },
    [handleSaveRename],
  );

  const visibilityIcon = (v?: string) => {
    switch (v) {
      case "workspace":
        return <TeamOutlined style={{ fontSize: 11, color: "var(--app-text-muted)" }} />;
      case "public":
        return <GlobalOutlined style={{ fontSize: 11, color: "var(--app-text-muted)" }} />;
      default:
        return <LockOutlined style={{ fontSize: 11, color: "var(--app-text-muted)" }} />;
    }
  };

  const statusLabel = (s?: string) => {
    switch (s) {
      case "draft":
        return <Tag color="default" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>草稿</Tag>;
      case "archived":
        return <Tag color="orange" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>归档</Tag>;
      default:
        return null;
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="文档管理"
      width={560}
      className="doc-list-modal"
      destroyOnHidden
      zIndex={1100}
    >
      <div className="doc-list__toolbar">
        <Input
          prefix={<SearchOutlined style={{ color: "var(--app-text-muted)" }} />}
          placeholder="搜索文档..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          size="small"
          className="doc-list__search"
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={() => {
            onClose();
            onCreateNew();
          }}
        >
          新建
        </Button>
      </div>

      <div className="doc-list__items">
        {filtered.length === 0 ? (
          <Empty
            description={searchText ? "没有匹配的文档" : "暂无文档"}
            style={{ padding: "40px 0" }}
          />
        ) : (
          filtered.map((doc) => (
            <div
              key={doc.docId}
              className={`doc-list__item ${
                currentDocId === doc.docId ? "doc-list__item--active" : ""
              }`}
              onClick={() => {
                if (renamingDocId === doc.docId) return;
                onSelect(doc.docId);
              }}
            >
              <span className="doc-list__item-icon">
                {doc.icon || <FileTextOutlined style={{ opacity: 0.4 }} />}
              </span>

              <div className="doc-list__item-body">
                {renamingDocId === doc.docId ? (
                  <Input
                    ref={renameInputRef as any}
                    size="small"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleSaveRename(doc.docId)}
                    onKeyDown={(e) => handleKeyDown(e, doc.docId)}
                    onClick={(e) => e.stopPropagation()}
                    className="doc-list__rename-input"
                  />
                ) : (
                  <span className="doc-list__item-title">{doc.title}</span>
                )}
                <span className="doc-list__item-meta">
                  {statusLabel(doc.status)}
                  {visibilityIcon(doc.visibility)}
                  <span className="doc-list__item-time">
                    {formatTime(doc.updatedAt)}
                  </span>
                </span>
              </div>

              <div className="doc-list__item-actions">
                <Tooltip title="重命名">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(e) => handleStartRename(e, doc.docId, doc.title)}
                  />
                </Tooltip>
                <Popconfirm
                  title="确定删除此文档？"
                  description="子文档将一并删除，此操作不可撤销。"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDelete(doc.docId);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Tooltip>
                </Popconfirm>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
