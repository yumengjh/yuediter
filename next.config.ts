import type { NextConfig } from "next";

const rawPath = process.env.NEXT_PUBLIC_DOC_PATH || "/doc";
const DOC_PATH = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_DOC_PATH: DOC_PATH,
  },
  async rewrites() {
    if (DOC_PATH === "/doc") return [];
    return [
      {
        source: `${DOC_PATH}/:slug`,
        destination: `/doc/:slug`,
      },
    ];
  },
};

export default nextConfig;
