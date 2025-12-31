import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': ['./bin/yt-dlp-linux'],
  },
};

export default nextConfig;
