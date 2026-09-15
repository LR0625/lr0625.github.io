import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/**
 * 站点地址。
 *
 * canonical、sitemap、og:image 的绝对地址都由它拼出来，所以部署到哪个域名
 * 就必须把哪个域名填进来，否则分享卡片会指向一个不存在的地址。
 *
 * 两种设置方式：
 *   1. 本地构建：  $env:SITE_URL="https://your-domain.com"; npm run build
 *   2. 托管平台：  在平台的环境变量里加 SITE_URL（Vercel / Cloudflare Pages 都支持）
 */
const SITE_URL = process.env.SITE_URL;

if (!SITE_URL) {
  console.warn(
    '\n\x1b[33m⚠  未设置 SITE_URL\x1b[0m\n' +
      '   canonical / og:image / sitemap 将指向占位域名 linrun.example.com，\n' +
      '   分享到微信或飞书时卡片会显示不出来。\n\n' +
      '   部署前设置一下：\n' +
      '     PowerShell:  $env:SITE_URL="https://你的域名"; npm run build\n' +
      '     托管平台:    在环境变量里添加 SITE_URL\n',
  );
}

export default defineConfig({
  site: SITE_URL || 'https://linrun.example.com',

  output: 'static',
  integrations: [mdx(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },

  build: {
    // 小样式表内联进 HTML，减少首屏请求；大样式表仍然外链
    inlineStylesheets: 'auto',
  },

  // 静态站点不做预取，避免无意义的额外请求
  prefetch: false,
});
