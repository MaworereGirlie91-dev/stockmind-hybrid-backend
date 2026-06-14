import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.robokorda.duckdns.org' },
    ],
  },
};

export default nextConfig;
