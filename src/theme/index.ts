import type { ThemeConfig } from "antd";

export const COLORS = {
  primary: "#1890ff",
  primaryHover: "#40a9ff",
  primaryActive: "#096dd9",
  primaryLight: "#bae0ff",
  primaryBorder: "#4096ff",
  primaryBg: "#eff6ff",
  primaryText: "#1d4ed8",
  primaryUnderline: "#3b82f6",
  primaryGlow: "rgba(24, 144, 255, 0.2)",

  accentGreen: "#1fb46a",
  accentYellow: "#ffe58f",

  // Toolbar colors (黑白灰极简)
  toolbarBg: "#ffffff",
  toolbarBorder: "#e5e7eb",
  toolbarText: "#333333",
  toolbarTextMuted: "#999999",
  toolbarIcon: "#666666",
  toolbarIconHover: "#333333",
  toolbarHoverBg: "#f5f5f5",
  toolbarActiveBg: "#f0f0f0",
  toolbarActiveText: "#111111",
} as const;

export const editorTheme: ThemeConfig = {
  token: {
    colorPrimary: COLORS.primary,
    colorLink: COLORS.primaryActive,
    colorSuccess: COLORS.accentGreen,
    colorWarning: "#faad14",
    colorError: "#ff4d4f",

    colorBgContainer: "#ffffff",
    colorBgLayout: "#f9fafb",
    colorBgElevated: "#ffffff",
    colorBorder: "#d9d9d9",
    colorBorderSecondary: "#e5e7eb",
    colorText: "#262626",
    colorTextSecondary: "#595959",
    colorTextTertiary: "#8c8c8c",
    colorTextQuaternary: "#bfbfbf",

    borderRadius: 6,
    fontFamily: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
  },
  components: {
    Dropdown: {
      colorBgElevated: "#ffffff",
      controlItemBgHover: "#f5f5f5",
      controlItemBgActive: "#f0f0f0",
      colorText: "#333333",
      colorTextSecondary: "#666666",
    },
    Tooltip: {
      colorBgDefault: "#333333",
      colorTextLightSolid: "#ffffff",
    },
  },
};

// Toolbar-specific theme for components inside toolbar
export const toolbarTheme: ThemeConfig = {
  token: {
    colorPrimary: "#333333",
    colorLink: "#333333",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#e5e7eb",
    colorText: "#333333",
    colorTextSecondary: "#666666",
    colorTextTertiary: "#999999",
    controlItemBgHover: "#f5f5f5",
    controlItemBgActive: "#f0f0f0",
  },
};
