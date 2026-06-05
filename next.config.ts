import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'images.unsplash.com' },
      { hostname: 'cdn.shopify.com' },
      { hostname: 'yjelwuevrxfiloodtzlb.supabase.co' },
    ],
  },
};

export default nextConfig;
