const nextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add path import if needed
  serverExternalPackages: ['better-sqlite3'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
