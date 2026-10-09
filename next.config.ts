import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Every remote host an <Image src> actually points at in this app:
    // Cloudinary for uploaded photos, Unsplash for the placeholder image
    // used when a post/item/claim has none.
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
