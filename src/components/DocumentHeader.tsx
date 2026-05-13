import { useEffect, useState, useCallback, useRef } from "react";
import {
  Select,
  Button,
  Typography,
  Tag,
  Spin,
  Input,
  Space,
  message,
  Tooltip,
} from "antd";
import {
  SaveOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LogoutOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useDocument } from "../contexts/DocumentContext";
import { useAuth } from "../contexts/AuthContext";
import "./DocumentHeader.css";

const { Text } = Typography;

interface DocumentHeaderProps {
  onSave: () => void;
  showTOC: boolean;
  onToggleTOC: (open: boolean) => void;
}

export function DocumentHeader({ onSave, showTOC, onToggleTOC }: DocumentHeaderProps) {
  const {
    currentDoc,
    documents,
    saveStatus,
    lastSavedAt,
    selectDoc,
    createDoc,
    updateDoc,
    refreshDocs,
  } = useDocument();
  const { user, logout } = useAuth();
  const [newDocTitle, setNewDocTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);

  // 标题编辑
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const handleDocChange = useCallback(
    async (docId: string) => {
      try {
        await selectDoc(docId);
      } catch {
        message.error("加载文档失败");
      }
    },
    [selectDoc],
  );

  const handleCreateDoc = useCallback(async () => {
    const title = newDocTitle.trim() || "无标题文档";
    setCreating(true);
    try {
      await createDoc(title);
      setNewDocTitle("");
      setShowNewInput(false);
      message.success("文档创建成功");
    } catch {
      message.error("创建文档失败");
    } finally {
      setCreating(false);
    }
  }, [newDocTitle, createDoc]);

  const startEditTitle = useCallback(() => {
    if (!currentDoc) return;
    setTitleValue(currentDoc.title);
    setEditingTitle(true);
  }, [currentDoc]);

  const cancelEditTitle = useCallback(() => {
    setEditingTitle(false);
    setTitleValue("");
  }, []);

  const saveTitle = useCallback(async () => {
    if (!currentDoc) return;
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === currentDoc.title) {
      cancelEditTitle();
      return;
    }
    setTitleSaving(true);
    try {
      await updateDoc(currentDoc.docId, { title: trimmed });
      setEditingTitle(false);
      message.success("标题已更新");
    } catch {
      message.error("更新标题失败");
    } finally {
      setTitleSaving(false);
    }
  }, [currentDoc, titleValue, updateDoc, cancelEditTitle]);

  const saveStatusLabel = {
    idle: null,
    saving: (
      <Space size={4}>
        <Spin size="small" />
        <Text type="secondary" style={{ fontSize: 11 }}>
          保存中...
        </Text>
      </Space>
    ),
    saved: (
      <Space size={4}>
        <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 11 }} />
        <Text type="secondary" style={{ fontSize: 11 }}>
          {lastSavedAt
            ? `${lastSavedAt.getHours().toString().padStart(2, "0")}:${lastSavedAt
                .getMinutes()
                .toString()
                .padStart(2, "0")} 已保存`
            : "已保存"}
        </Text>
      </Space>
    ),
    error: (
      <Space size={4}>
        <ExclamationCircleOutlined style={{ color: "#ff4d4f", fontSize: 11 }} />
        <Text type="danger" style={{ fontSize: 11 }}>
          保存失败
        </Text>
      </Space>
    ),
  };

  return (
    <div className="document-header">
      <div className="document-header-left">
        <Select
          className="document-header-select"
          placeholder="选择文档"
          value={currentDoc?.docId}
          onChange={handleDocChange}
          options={documents.map((d) => ({
            label: d.title,
            value: d.docId,
          }))}
          style={{ minWidth: 160 }}
          showSearch
          optionFilterProp="label"
          notFoundContent="暂无文档"
        />
        {showNewInput ? (
          <div className="header-new-doc">
            <Input
              placeholder="文档标题"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              onPressEnter={handleCreateDoc}
              size="small"
              style={{ width: 140 }}
              autoFocus
            />
            <Button
              type="primary"
              size="small"
              loading={creating}
              onClick={handleCreateDoc}
            >
              创建
            </Button>
            <Button
              size="small"
              onClick={() => {
                setShowNewInput(false);
                setNewDocTitle("");
              }}
            >
              取消
            </Button>
          </div>
        ) : (
          <Tooltip title="新建文档">
            <Button
              type="text"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => setShowNewInput(true)}
            />
          </Tooltip>
        )}
      </div>

      <div className="document-header-center">
        {currentDoc && (
          editingTitle ? (
            <div className="title-edit-group">
              <Input
                ref={titleInputRef as any}
                className="title-edit-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onPressEnter={saveTitle}
                onBlur={saveTitle}
                disabled={titleSaving}
                size="small"
              />
              {titleSaving && <Spin size="small" />}
            </div>
          ) : (
            <button
              className="title-display"
              onClick={startEditTitle}
              title="点击编辑标题"
            >
              <FileTextOutlined style={{ fontSize: 13, opacity: 0.5 }} />
              <span>{currentDoc.title}</span>
            </button>
          )
        )}
      </div>

      <div className="document-header-right">
        {saveStatusLabel[saveStatus]}
        <Tooltip title={showTOC ? "隐藏目录" : "显示目录"}>
          <Button
            type={showTOC ? "primary" : "text"}
            icon={<UnorderedListOutlined />}
            size="small"
            onClick={() => onToggleTOC(!showTOC)}
          />
        </Tooltip>
        <Tooltip title="手动保存">
          <Button
            type="text"
            icon={<SaveOutlined />}
            size="small"
            onClick={onSave}
            disabled={saveStatus === "saving"}
          />
        </Tooltip>
        <Tag
          className="document-header-user"
          closable={false}
          color="blue"
        >
          {user?.displayName || user?.username}
        </Tag>
        <Tooltip title="退出登录">
          <Button
            type="text"
            icon={<LogoutOutlined />}
            size="small"
            onClick={logout}
            danger
          />
        </Tooltip>
      </div>
    </div>
  );
}
