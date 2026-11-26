/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server (.next/standalone/server.js) for the droplet's Docker image.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
