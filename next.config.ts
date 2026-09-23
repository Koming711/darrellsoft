import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  /**
   * Strip Prisma engine binaries (~20MB/file) dari bundle serverless.
   * Aman karena production memakai driver adapter (@prisma/adapter-pg) —
   * engine tidak pernah di-load saat runtime. Local dev tidak terpengaruh
   * (exclude hanya berlaku pada build output tracing).
   */
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/@prisma/engines/**",
      "./node_modules/.prisma/client/libquery_engine-*",
      "./node_modules/.prisma/client/*.so.node",
    ],
    "/**": [
      "./node_modules/@prisma/engines/**",
      "./node_modules/.prisma/client/libquery_engine-*",
      "./node_modules/.prisma/client/*.so.node",
    ],
  },
  allowedDevOrigins: [
    '0.0.0.0',
    '127.0.0.1',
    'localhost',
    '.space-z.ai',
    'preview-chat-67f99cb9-bcdb-4abe-b206-401508beb8b4.space-z.ai',
  ],
};

export default nextConfig;
