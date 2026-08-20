import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Upload de documents (factures, plans…) via Server Actions.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
