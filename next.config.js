/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
