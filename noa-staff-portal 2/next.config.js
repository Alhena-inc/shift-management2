/** @type {import('next').NextConfig} */
const nextConfig = {
  // 超軽量化: 不要な機能をオフ
  poweredByHeader: false,
  reactStrictMode: true,
  // 画像最適化は使用しない（画像なしの軽量設計）
  images: { unoptimized: true },
}

module.exports = nextConfig
