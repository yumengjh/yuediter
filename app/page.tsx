"use client";

import dynamic from "next/dynamic";

const EditorPage = dynamic(() => import("@/components/EditorPage"), {
  ssr: false,
  loading: () => (
    <div className="app-container">
      <div className="skeleton-container">
        <div className="skeleton-item skeleton-title" />
        <div className="skeleton-item skeleton-text" />
        <div className="skeleton-item skeleton-text" />
        <div className="skeleton-item skeleton-text-mid" />
        <div className="skeleton-item skeleton-text-short" />
      </div>
    </div>
  ),
});

export default function Page() {
  return <EditorPage />;
}
