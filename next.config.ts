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
  allowedDevOrigins: [
    '0.0.0.0',
    '127.0.0.1',
    'localhost',
    '*.space-z.ai',
    '.space-z.ai',
    'preview-chat-11004390-ef1d-45a1-8ea3-8617894ae3d3.space-z.ai',
  ],
};

export default nextConfig;
