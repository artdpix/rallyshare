/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rally/shared'],
  allowedDevOrigins: ['192.168.5.138', 'localhost'],
};

module.exports = nextConfig;
