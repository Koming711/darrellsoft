import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dilayani sebagai mini-service di belakang app utama: semua request
  // /produk-app/* dari app utama (next.config rewrites) diteruskan ke sini.
  basePath: "/produk-app",
  // Kunci root workspace ke folder ini — tanpa ini Turbopack menganggap
  // /home/z/my-project sbg root (karena package-lock.json di sana) dan
  // memuat .env milik app utama, sehingga DB yang terpakai salah.
  turbopack: {
    root: __dirname,
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
