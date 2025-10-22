import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // IMPORTANT: Do not use `output: 'export'` (that disables API routes)
  output: "standalone", // good for Vercel/Node deployment
};

export default nextConfig;
