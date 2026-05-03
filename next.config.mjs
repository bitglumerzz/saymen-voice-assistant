/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Размер CSV-загрузок может быть большим
  serverExternalPackages: ["pg"],
};

export default nextConfig;
