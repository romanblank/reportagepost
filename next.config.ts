import type { NextConfig } from "next";

// ИНВАРИАНТ (GLOBAL-PLAN S4): X-Robots-Tag noindex на всех ответах до публичного
// запуска — дублирует robots.ts на случай, если краулер игнорирует robots.txt.
// Снимается только пунктом S4 (через PUBLIC_LAUNCH в src/lib/constants.ts).
const PUBLIC_LAUNCH = false;

const nextConfig: NextConfig = {
  output: "standalone", // компактный Docker-образ
  async headers() {
    if (PUBLIC_LAUNCH) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
