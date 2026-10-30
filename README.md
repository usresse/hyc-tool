# 自留地 · ZILIUDI

写代码时随手会打开的地方。一个自用的工作台：一组在线小工具、一个本地记事本、一个完整的任务清单。**全部静态生成，零后端，离线可用**。

## 技术栈

| 层 | 选型 |
|---|---|
| 构建 | [Astro 7](https://docs.astro.build/) · 静态站点生成（SSG） |
| 交互组件 | [Preact 10](https://preactjs.com/) 通过 `@astrojs/preact` 接入 |
| 语言 | TypeScript 6 strict（`astro/tsconfigs/strict` + JSX 为 Preact 适配） |
| 工具依赖 | cron-parser / cronstrue / diff / marked / yaml / qrcode-generator（本地打包，不请求外部 CDN） |

## 目录结构

```
个人网站/
├── astro.config.mjs          # 构建配置：output: static，集成 preact()
├── package.json              # scripts: dev / build / preview / check
├── tsconfig.json             # extends astro/tsconfigs/strict，jsx: preact-jsx
│
├── public/                   # 纯静态资源（构建时直接拷贝到 dist）
│   └── favicon.svg
│
└── src/
    ├── consts.ts             # ★ 唯一注册表：SITE / TOOLS[] / ENTRIES[] / NAV[] / withBase()
    │
    ├── styles/global.css     # 全站样式与 design tokens（--paper --surface --accent --radius 等）
    ├── layouts/BaseLayout.astro   # 统一的 <html> + 站点头部 + <main slot /> + 页脚
    │
    ├── components/
    │   ├── ToolCard.astro    # 首页仪表盘卡片
    │   ├── ToolPage.astro    # 工具页壳：面包屑 + page-head + <slot />
    │   ├── NoteEditor.tsx    # 记事本编辑器（Preact 岛屿组件）
    │   ├── tasks/TaskPanel.astro  # 任务界面：原始 DOM + 原脚本，CSS 已 scoped 到 .app-tasks
    │   └── tools/*.tsx       # 10 个工具的 Preact 组件
    │
    ├── assets/tasks/
    │   ├── task-app.css      # 原任务清单样式，经脚本逐条 scoped 到 .app-tasks，变量映射到自留地 tokens
    │   └── task-app.js       # 原任务清单 IIFE 脚本（主题变量仅写入 .app-tasks 作用域，不污染全站）
    │
    └── pages/
        ├── index.astro       # 首页：仪表盘（TOOLS + ENTRIES 从 consts.ts 读取）
        ├── about.astro       # 关于页
        ├── tasks.astro       # 任务界面（BaseLayout + TaskPanel）
        ├── notes/index.astro # 记事本
        ├── tools/index.astro # 工具箱索引
        └── tools/*.astro     # 10 个工具动态页（共享同一套模板，slug 由文件名推断）
```

### dist 结构（`npm run build` 产物）

```
dist/
├── index.html                # 首页
├── about/index.html          # 关于
├── tasks/index.html          # 任务界面
├── notes/index.html          # 记事本
├── tools/
│   ├── index.html
│   ├── json/index.html       # 每个工具一个目录
│   ├── regex/index.html
│   └── ...
├── favicon.svg
└── _astro/                   # ★ Vite hash 化资源
    ├── BaseLayout.C8d87luW.css
    ├── client.DdeJ_HAk.js       # Astro islands 运行时（~4KB）
    ├── ConfigTool.Bq-NAfxZ.js   # 每个工具组件一个独立 chunk（按需加载）
    ├── JsonFormatter.BMTq2MD_.js
    ├── task-app.YBdlKcRS.css    # 任务界面样式（?url 导入被 Vite 处理）
    └── task-app.UCK5-QHR.js     # 任务界面脚本（?url 导入被 Vite hash 化）
```

## 打包流程

```
npm run build     # → astro build → dist/
```

### 构建管线解析

1. **Astro SSG**：遍历 `src/pages/`，每个 `.astro` 文件生成一个静态 HTML 文件（目录式输出）。
2. **Vite 资产处理**：
   - `import foo from '...?url'` 导入的 CSS / JS 会被 Vite 输出到 `_astro/` 并加内容 hash（如 `task-app.YBdlKcRS.css`），`<link>` / `<script>` 的 href/src 自动替换成 hash 路径。
   - 这就是为什么 `src/assets/tasks/task-app.js` 不需要自己拷贝到 public——Astro + Vite 会处理好引用和输出。
3. **Preact Islands**：每个工具页的 `.tsx` 组件用 `client:load` / `client:visible` 等指令在客户端水合，不水合的部分仍是纯 HTML。运行时由 `@astrojs/preact` 注入。
4. **`public/` 直通**：里面的文件不经过任何处理，直接复制到 `dist/` 根。目前只有 favicon。

### 部署到子路径（GitHub Pages 等）

如果仓库名是 `hyc-tool`，取消 `astro.config.mjs` 里的注释并改成：

```js
base: '/hyc-tool',
```

然后 `npm run build`，所有站内链接通过 `src/consts.ts` 的 `withBase()` 自动带上前缀。

## 各页面实现模式

### 1. 工具页（10 个）

**文件**：`src/pages/tools/*.astro` + `src/components/tools/*.tsx`

**模式**：`.astro` 动态路由里用 `ToolPage.astro` 壳子包 `Preact` 组件：

```astro
---
import ToolPage from '../../components/ToolPage.astro';
import SomeTool from '../../components/tools/SomeTool.tsx';
---
<ToolPage slug="some">
  <SomeTool client:load />
</ToolPage>
```

工具的标题、描述、图标、补充说明都在 `src/consts.ts` 的 `TOOLS[]` 里维护，**加新工具只改两处**：`consts.ts` 里加一项 + `pages/tools/` 里加一个 `.astro` 文件。

### 2. 任务界面（/tasks）

**文件**：
- `src/pages/tasks.astro`：BaseLayout + 紧凑 page-head + `<TaskPanel />`
- `src/components/tasks/TaskPanel.astro`：原始 DOM 原样内联（无修改）
- `src/assets/tasks/task-app.css`：从原 `<style>` 块提取后，**逐条选择器加 `.app-tasks` 前缀**，消除全局污染
- `src/assets/tasks/task-app.js`：从原 `<script>` 块提取（IIFE 结构），仅修一处主题污染

**关键处理**：

- CSS 重写脚本会匹配所有以 `. # 字母 * 开头的选择器`，自动改成 `.app-tasks selector`。`:root` 变量块做 token 映射；`html[data-theme="dark"]` 块删除（深色由站点 `prefers-color-scheme` 统一处理）。
- `applyTheme()` 里原本把调色板写到 `document.documentElement.style`，**会污染全站主题色**。已改成只写 `document.querySelector('.app-tasks').style`，这样应用的绿/蓝/紫等调色板只在任务面板内生效。
- 所有 DOM id 保留原名（`todoInput` / `addBtn` / `viewTabs` 等），原 IIFE 通过 `getElementById` 绑定，不依赖 DOM 顺序。
- `<script src={taskJs} is:inline>`：`?url` 拿到 hash 化路径，`is:inline` 让浏览器直接执行，绕开 Astro/Preact 的客户端桥接（原脚本是纯 DOM 操作，不需要框架）。

### 3. 记事本（/notes）

`NoteEditor.tsx` Preact 组件，内容存在 `localStorage`。类似工具页模式，只是数据持久化。

## 开发命令

```bash
npm install     # 首次安装
npm run dev     # http://localhost:4321 热更新
npm run build   # 产出到 dist/
npm run preview # 预览 build 产物（http://localhost:4321）
npm run check   # TypeScript 类型检查
```

## 约定

- **静态优先**：优先用 Astro SSG 而不是 SPA。需要交互的小块才用 Preact + `client:xxx` 指令。
- **零外部依赖**：不请求 Google Fonts / CDN 图标库。字体走 `--font-body` / `--font-display` tokens，图标用 emoji 或纯 CSS。
- **数据不离开浏览器**：所有工具输入不存储、不请求后端；任务界面用 IndexedDB、记事后端用 localStorage。
- **加新工具流程**：
  1. `src/consts.ts` 的 `TOOLS[]` 里加一项（slug / title / desc / emoji / note）
  2. `src/components/tools/SlugTool.tsx` 里写 Preact 组件
  3. `src/pages/tools/slug.astro` 里引用（可以复制现有文件改个名字）
  4. `npm run build` 验证通过

## License

自用项目。数据只留在你的浏览器里。
