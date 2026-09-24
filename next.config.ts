import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return { beforeFiles: [{
      source: "/cards/:slug",
      destination: "/public-cards/:slug",
      missing: [
        { type: "cookie", key: "wp_user_session" },
        { type: "cookie", key: "wp_admin_session" },
      ],
    }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
