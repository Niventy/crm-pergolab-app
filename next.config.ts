import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Accès au serveur de dev depuis une autre machine du réseau local (sinon
  // Next bloque les ressources /_next/* en cross-origin → page non interactive).
  allowedDevOrigins: ["192.168.1.210", "localhost"],
  experimental: {
    // Upload de documents (factures, plans…) via Server Actions.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
