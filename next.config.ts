import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "prisma",
  ],
  outputFileTracingIncludes: {
    "/*": [
      "./prisma/**/*.prisma",
      "./src/generated/prisma/**/*",
    ],
  },
  async headers() {
    return [
      {
        // Service worker must never be cached or iOS will keep showing stale
        // push handlers — see Next.js PWA guide.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/(.*)",
          destination: "/api/file-serve?p=$1",
        },
      ],
    };
  },
};

export default nextConfig;
