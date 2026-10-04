import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 构建输出目录故意不叫 `.next`。
   *
   * 原因：发布到云沙箱时，`.next` / `dist` / `build` 这类构建产物不会随源码上传
   * （实测报错：Could not find a production build in the '.next' directory），
   * 而沙箱启动窗口只有 60 秒，来不及现场跑一次 next build。
   * 换成 `webapp/` 后会随源码一起上传，线上启动只需 1~2 秒。
   *
   * 代价：`webapp/` 属于构建产物但必须留在目录里（不要加进 .gitignore）。
   * 改完代码后要先 `npm run build:web` 再重新发布，否则线上跑的还是旧产物。
   */
  distDir: "webapp",
  experimental: {
    // 构建产物要跟着源码上传，所以不生成 58MB 的 Turbopack 文件系统缓存
    // （next start 不需要它，关掉能显著减小每次发布的上传量）
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
