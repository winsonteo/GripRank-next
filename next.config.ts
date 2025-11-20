/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/results",
        destination: "/boulder/leaderboard",
        permanent: true, // tells browsers & search engines it's a stable redirect (HTTP 308)
      },
    ];
  },
};

module.exports = nextConfig;
