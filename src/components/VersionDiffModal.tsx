"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Modal, Select, Button, Spin, Tag, Empty, message } from "antd";
import { SwapOutlined, CloseCircleOutlined } from "@ant-design/icons";
import htmldiff from "htmldiff-js";
import {
  getRevisions,
  getVersionContent,
  getVersionDiff,
  type Revision,
  type DiffSummary,
} from "../services/document";
import {
  versionTreeToHtml,
  annotateBlockChanges,
} from "../services/version-html";
import "./VersionDiffModal.css";

interface VersionDiffModalProps {
  open: boolean;
  onClose: () => void;
  docId: string;
}

export function VersionDiffModal({ open, onClose, docId }: VersionDiffModalProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);

  // 单版本查看
  const [selectedVer, setSelectedVer] = useState<number | null>(null);
  const [singleHtml, setSingleHtml] = useState("");
  const [loadingSingle, setLoadingSingle] = useState(false);

  // Diff 对比
  const [fromVer, setFromVer] = useState<number | null>(null);
  const [toVer, setToVer] = useState<number | null>(null);
  const [diffHtml, setDiffHtml] = useState("");
  const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [contentLoaded, setContentLoaded] = useState(false);

  // 内容缓存：version → HTML
  const [contentCache] = useState(() => new Map<number, string>());

  // Modal 打开时禁止页面滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // 加载修订列表
  useEffect(() => {
    if (!open || !docId) return;
    contentCache.clear();
    setLoadingRevisions(true);
    setSelectedVer(null);
    setSingleHtml("");
    setContentLoaded(false);
    setFromVer(null);
    setToVer(null);
    setDiffHtml("");
    setDiffSummary(null);

    getRevisions(docId, 1, 100)
      .then((res) => {
        const sorted = [...res.items].sort((a, b) => b.docVer - a.docVer);
        setRevisions(sorted);
        // 默认选中最新版本
        if (sorted.length > 0) {
          setSelectedVer(sorted[0].docVer);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRevisions(false));
  }, [open, docId]);

  // 加载单个版本内容
  const loadVersion = useCallback(
    async (ver: number) => {
      const cached = contentCache.get(ver);
      if (cached) {
        setSingleHtml(cached);
        return cached;
      }
      setLoadingSingle(true);
      try {
        const resp = await getVersionContent(docId, ver);
        const html = resp.tree ? versionTreeToHtml(resp.tree) : "";
        contentCache.set(ver, html);
        setSingleHtml(html);
        setContentLoaded(true);
        return html;
      } catch {
        setSingleHtml("");
        setContentLoaded(true);
        return "";
      } finally {
        setLoadingSingle(false);
      }
    },
    [docId, contentCache],
  );

  // 点击版本列表项
  const handleSelectVersion = useCallback(
    (ver: number) => {
      setSelectedVer(ver);
      setContentLoaded(false);
      // 清除 diff 状态，回到单版本预览模式
      setDiffHtml("");
      setDiffSummary(null);
      loadVersion(ver);
    },
    [loadVersion],
  );

  // 取消对比
  const handleCancelDiff = useCallback(() => {
    setDiffHtml("");
    setDiffSummary(null);
    // 恢复显示当前选中版本的内容
    if (selectedVer !== null) {
      const cached = contentCache.get(selectedVer);
      if (cached) setSingleHtml(cached);
    }
  }, [selectedVer, contentCache]);

  // 初始自动加载最新版本
  useEffect(() => {
    if (selectedVer !== null && !contentLoaded && !loadingSingle) {
      loadVersion(selectedVer);
    }
  }, [selectedVer, contentLoaded, loadingSingle, loadVersion]);

  // 执行 Diff 对比
  const handleCompare = useCallback(async () => {
    if (fromVer === null || toVer === null) return;
    if (fromVer > toVer) {
      message.warning("起始版本不能大于目标版本，请检查选择顺序");
      return;
    }
    setLoadingDiff(true);
    setDiffHtml("");
    setDiffSummary(null);
    try {
      const diffResp = await getVersionDiff(docId, fromVer, toVer);

      // 转换两个版本为 HTML（优先用缓存）
      let fromHtml = contentCache.get(fromVer);
      if (!fromHtml && diffResp.fromContent?.tree) {
        fromHtml = versionTreeToHtml(diffResp.fromContent.tree);
        contentCache.set(fromVer, fromHtml);
      }

      let toHtml = contentCache.get(toVer);
      if (!toHtml && diffResp.toContent?.tree) {
        toHtml = versionTreeToHtml(diffResp.toContent.tree);
        contentCache.set(toVer, toHtml);
      }

      if (fromHtml && toHtml) {
        // htmldiff-js 产生合并 diff（ins/del 内联标记）
        const merged = htmldiff.execute(fromHtml, toHtml);
        // 注入块级变更高亮
        const annotated = annotateBlockChanges(merged, diffResp.changes);
        setDiffHtml(annotated);
      }

      setDiffSummary(diffResp.summary);
    } catch {
      setDiffHtml("<p>对比失败，请重试</p>");
    } finally {
      setLoadingDiff(false);
    }
  }, [docId, fromVer, toVer, contentCache]);

  // 版本选项列表
  const versionOptions = useMemo(
    () =>
      revisions.map((r) => ({
        value: r.docVer,
        label: `v${r.docVer} — ${formatTime(r.createdAt)}`,
      })),
    [revisions],
  );

  // 从/to 版本条信息
  const fromRevision = useMemo(
    () => revisions.find((r) => r.docVer === fromVer),
    [revisions, fromVer],
  );
  const toRevision = useMemo(
    () => revisions.find((r) => r.docVer === toVer),
    [revisions, toVer],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="版本对比"
      width="100vw"
      styles={{ body: { padding: 0 } }}
      className="version-diff-modal"
      destroyOnClose
      zIndex={1100}
    >
      <div className="version-diff">
        {/* 左侧版本列表 */}
        <aside className="version-diff__sidebar">
          <div className="version-diff__sidebar-header">
            版本历史 {revisions.length > 0 ? `(${revisions.length})` : ""}
          </div>
          <div className="version-diff__sidebar-list">
            {loadingRevisions ? (
              <div className="version-diff__loading">
                <Spin />
              </div>
            ) : revisions.length === 0 ? (
              <div className="version-diff__empty">暂无版本</div>
            ) : (
              revisions.map((rev) => (
                <div
                  key={rev.docVer}
                  className={`version-diff__sidebar-item ${
                    selectedVer === rev.docVer
                      ? "version-diff__sidebar-item--active"
                      : ""
                  }`}
                  onClick={() => handleSelectVersion(rev.docVer)}
                >
                  <span className="version-diff__sidebar-ver">
                    v{rev.docVer}
                  </span>
                  <div className="version-diff__sidebar-info">
                    <div className="version-diff__sidebar-time">
                      {formatTime(rev.createdAt)}
                    </div>
                    {rev.message && (
                      <div className="version-diff__sidebar-msg">
                        {rev.message}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* 右侧主区域 */}
        <main className="version-diff__main">
          {/* 工具栏 */}
          <div className="version-diff__toolbar">
            <span className="version-diff__toolbar-label">从</span>
            <Select
              size="small"
              placeholder="选择版本"
              value={fromVer}
              onChange={setFromVer}
              options={versionOptions}
              style={{ minWidth: 180 }}
              showSearch
              optionFilterProp="label"
            />
            <SwapOutlined className="version-diff__toolbar-arrow" />
            <span className="version-diff__toolbar-label">到</span>
            <Select
              size="small"
              placeholder="选择版本"
              value={toVer}
              onChange={setToVer}
              options={versionOptions}
              style={{ minWidth: 180 }}
              showSearch
              optionFilterProp="label"
            />
            <Button
              type="primary"
              size="small"
              onClick={handleCompare}
              loading={loadingDiff}
              disabled={fromVer === null || toVer === null || fromVer === toVer}
            >
              对比
            </Button>

            {diffSummary && (
              <div className="version-diff__toolbar-summary">
                {diffSummary.added > 0 && (
                  <Tag className="version-diff__summary-tag version-diff__summary-tag--added">
                    +{diffSummary.added} 新增
                  </Tag>
                )}
                {diffSummary.deleted > 0 && (
                  <Tag className="version-diff__summary-tag version-diff__summary-tag--deleted">
                    -{diffSummary.deleted} 删除
                  </Tag>
                )}
                {diffSummary.modified > 0 && (
                  <Tag className="version-diff__summary-tag version-diff__summary-tag--modified">
                    ~{diffSummary.modified} 修改
                  </Tag>
                )}
                {diffSummary.moved > 0 && (
                  <Tag className="version-diff__summary-tag version-diff__summary-tag--moved">
                    ↕{diffSummary.moved} 移动
                  </Tag>
                )}
                <Button
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={handleCancelDiff}
                >
                  取消对比
                </Button>
              </div>
            )}
          </div>

          {/* 版本信息条 */}
          {selectedVer !== null && !diffHtml && (
            <div className="version-diff__version-bar">
              <strong>v{selectedVer}</strong>
              <span>
                {revisions.find((r) => r.docVer === selectedVer)?.createdAt
                  ? formatTime(
                      revisions.find((r) => r.docVer === selectedVer)!.createdAt,
                    )
                  : ""}
              </span>
              <span>
                {revisions.find((r) => r.docVer === selectedVer)?.message || ""}
              </span>
            </div>
          )}

          {fromRevision && toRevision && diffHtml && (
            <div className="version-diff__version-bar">
              <strong>v{fromRevision.docVer}</strong>
              <span>{formatTime(fromRevision.createdAt)}</span>
              <span style={{ margin: "0 4px", color: "var(--app-text-muted)" }}>
                →
              </span>
              <strong>v{toRevision.docVer}</strong>
              <span>{formatTime(toRevision.createdAt)}</span>
            </div>
          )}

          {/* 内容区 */}
          <div className="version-diff__content">
            {loadingSingle || loadingDiff ? (
              <div className="version-diff__loading">
                <Spin />
              </div>
            ) : diffHtml ? (
              <div
                className="version-diff__diff-view"
                dangerouslySetInnerHTML={{ __html: diffHtml }}
              />
            ) : singleHtml ? (
              <div
                className="version-diff__preview"
                dangerouslySetInnerHTML={{ __html: singleHtml }}
              />
            ) : (
              <Empty
                description="选择一个版本查看内容"
                style={{ marginTop: 120 }}
              />
            )}
          </div>
        </main>
      </div>
    </Modal>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
