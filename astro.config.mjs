import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  integrations: [preact()],
  output: 'static',
  // 部署到 GitHub Pages 的仓库子路径时取消下一行注释并改成仓库名；
  // 站内链接通过 src/consts.ts 的 withBase() 自动带上这个前缀。
  // base: '/repo-name',
});
