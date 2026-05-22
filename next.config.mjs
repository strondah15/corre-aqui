import { dirname } from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const localNetworkHosts = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface?.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: localNetworkHosts,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
