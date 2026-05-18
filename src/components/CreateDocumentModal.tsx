"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Modal, Form, Input, Select, Button, message } from "antd";
import {
  LockOutlined,
  TeamOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { useDocument } from "../contexts/DocumentContext";
import "./CreateDocumentModal.css";

interface CreateDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateDocumentModal({
  open,
  onClose,
  onCreated,
}: CreateDocumentModalProps) {
  const { createDoc } = useDocument();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setIcon("");
      setVisibility("private");
      setCategory("");
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      message.warning("请输入文档标题");
      return;
    }
    setSubmitting(true);
    try {
      await createDoc({
        title: trimmed,
        icon: icon.trim() || undefined,
        visibility,
        category: category.trim() || undefined,
      });
      message.success("文档创建成功");
      onClose();
      onCreated?.();
    } catch {
      message.error("创建文档失败");
    } finally {
      setSubmitting(false);
    }
  }, [title, icon, visibility, category, createDoc, onClose, onCreated]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="新建文档"
      width={480}
      className="create-doc-modal"
      destroyOnHidden
      zIndex={1200}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitting}
          onClick={handleSubmit}
        >
          创建
        </Button>,
      ]}
    >
      <Form layout="vertical" size="small">
        <Form.Item label="标题" required>
          <Input
            ref={titleRef as any}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onPressEnter={handleSubmit}
            placeholder="输入文档标题"
            maxLength={255}
          />
        </Form.Item>

        <Form.Item label="图标">
          <Input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="输入 emoji，如 📄"
            maxLength={10}
          />
        </Form.Item>

        <Form.Item label="可见性">
          <Select
            value={visibility}
            onChange={setVisibility}
            options={[
              {
                value: "private",
                label: (
                  <span>
                    <LockOutlined /> 私有
                  </span>
                ),
              },
              {
                value: "workspace",
                label: (
                  <span>
                    <TeamOutlined /> 工作空间
                  </span>
                ),
              },
              {
                value: "public",
                label: (
                  <span>
                    <GlobalOutlined /> 公开
                  </span>
                ),
              },
            ]}
          />
        </Form.Item>

        <Form.Item label="分类">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="文档分类"
            maxLength={50}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
