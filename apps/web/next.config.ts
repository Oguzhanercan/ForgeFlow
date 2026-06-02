import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@forgeflow/ui", "@forgeflow/contracts"],
  allowedDevOrigins: ["localhost", "127.0.0.1", "0.0.0.0"]
};

export default nextConfig;

