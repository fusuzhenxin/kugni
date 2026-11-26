import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  output: "standalone",
  turbopack: { root: path.resolve(__dirname, "..") },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  trailingSlash: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/uploads/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/api/v1/:path*/`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
