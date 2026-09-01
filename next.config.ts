import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/final-order-pdf": ["./assets/**/*", "./node_modules/pdfkit/js/standard-fonts/**/*"]
  },
  poweredByHeader: false
};

export default nextConfig;
