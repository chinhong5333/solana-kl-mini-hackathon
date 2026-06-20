import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this project. A stray lockfile higher up
  // (htdocs/yarn.lock) would otherwise make Next infer the wrong root.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
