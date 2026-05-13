import { useEffect, useState, useCallback } from "react";
import {
  Space,
  Select,
  Button,
  Typography,
  Tag,
  Spin,
  Input,
  message,
  Tooltip,
} from "antd";
import {
  SaveOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useDocument } from "../contexts/DocumentContext";
import { useAuth } from "../contexts/AuthContext";
import "./DocumentHeader.css";

const { Text } = Typography;

interface DocumentHeaderProps {
  onSave: () => void;
}

export function DocumentHeader({ onSave }: DocumentHeaderProps) {
  const {
    currentDoc,
    documents,
    saveStatus,
    lastSavedAt,
    selectDoc,
    createDoc,
    refreshDocs,
  } = useDocument();
  const { user, logout } = useAuth();
  const [newDocTitle, setNewDocTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

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

  const saveStatusLabel = {
    idle: null,
    saving: (
      <Space size={4}>
        <Spin size="small" />
        <Text type="secondary" style={{ fontSize: 12 }}>
          保存中...
        </Text>
      </Space>
    ),
    saved: (
      <Space size={4}>
        <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 12 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
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
        <ExclamationCircleOutlined style={{ color: "#ff4d4f", fontSize: 12 }} />
        <Text type="danger" style={{ fontSize: 12 }}>
          保存失败
        </Text>
      </Space>
    ),
  };

  return (
    <div className="document-header">
      <div className="document-header-left">
        <FileTextOutlined style={{ fontSize: 16, color: "#1677ff" }} />
        <Select
          className="document-header-select"
          placeholder="选择文档"
          value={currentDoc?.docId}
          onChange={handleDocChange}
          options={documents.map((d) => ({
            label: d.title,
            value: d.docId,
          }))}
          style={{ minWidth: 180 }}
          showSearch
          optionFilterProp="label"
          notFoundContent="暂无文档"
        />
        {showNewInput ? (
          <Space.Compact style={{ marginLeft: 8 }}>
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
          </Space.Compact>
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

      <div className="document-header-right">
        {saveStatusLabel[saveStatus]}
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
