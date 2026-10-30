export const SITE = {
  name: '自留地',
  latin: 'ZILIUDI',
  tagline: '写代码时随手会打开的地方',
  description:
    '一个自用的工作台：一组在线小工具、一个本地记事本，以及原样托管的静态页面。',
  author: '自留地的主人',
  contact: [
    { label: 'Email', value: '2138769411@qq.com', href: 'mailto:2138769411@qq.com' },
    { label: 'GitHub', value: 'github.com/usresse/hyc-tool', href: 'https://github.com/usresse/hyc-tool' },
  ],
};

/**
 * 给站内绝对路径加上部署前缀。
 * 默认部署在根路径时原样返回；若在 astro.config.mjs 里设置 base（如 GitHub Pages 子路径），
 * 所有链接会自动变成 /base/tools 这样的形式。
 */
export function withBase(path: string): string {
  if (/^[a-z]+:/i.test(path) || path.startsWith('#')) return path;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
}

export interface Tool {
  slug: string;
  title: string;
  desc: string;
  emoji: string;
  /** 工具页上的一句补充说明 */
  note: string;
}

export const TOOLS: Tool[] = [
  {
    slug: 'json',
    title: 'JSON 格式化',
    desc: '格式化、压缩、键排序、转义互转，报错时给出具体位置。',
    emoji: '🧾',
    note: '输入不会被保存，刷新即清空。',
  },
  {
    slug: 'timestamp',
    title: '时间戳转换',
    desc: '秒 / 毫秒自动识别，附相对时间与 RFC 2822，时区固定东八区。',
    emoji: '🕐',
    note: '时区固定为 Asia/Shanghai（UTC+8）。',
  },
  {
    slug: 'encode',
    title: '编码转换',
    desc: 'Base64、URL、JWT、Hash 摘要一次配齐。',
    emoji: '🔤',
    note: 'JWT 只解码不验签；MD5 为内置实现，SHA 走 crypto.subtle。',
  },
  {
    slug: 'regex',
    title: '正则测试',
    desc: '实时高亮匹配项，捕获组一目了然，还能预览替换结果。',
    emoji: '🧪',
    note: '内置常用模式库；高亮通过文本切片渲染，不注入 HTML。',
  },
  {
    slug: 'uuid',
    title: 'UUID 生成',
    desc: '批量生成 v4 / v7 / NIL UUID，支持大写与去连字符。',
    emoji: '🎲',
    note: 'v4 用 crypto.randomUUID；v7 按 RFC 9562，时间有序。',
  },
  {
    slug: 'cron',
    title: 'Cron 解析',
    desc: '把 5 / 6 段表达式翻译成人话，支持 @daily 等别名。',
    emoji: '⏱',
    note: '支持中英文描述，并推算接下来 5–20 次触发时间。',
  },
  {
    slug: 'diff',
    title: '文本对比',
    desc: '左右两段文本按行比对，高亮新增、删除与未变行。',
    emoji: '🔍',
    note: '适合对比配置、SQL、JSON 的改动。',
  },
  {
    slug: 'config',
    title: '配置转 JSON',
    desc: '把 application.yml 或 .properties 转成 JSON 看结构。',
    emoji: '⚙️',
    note: 'YAML 用 yaml 库解析，Properties 支持点号嵌套。',
  },
  {
    slug: 'password',
    title: '密码生成',
    desc: '长度、字符集可调，可排除易混字符，并估算强度。',
    emoji: '🔑',
    note: '用 crypto.getRandomValues 取随机数，不用 Math.random。',
  },
  {
    slug: 'qrcode',
    title: '二维码生成',
    desc: '把链接或一段文本变成可下载的 SVG 二维码。',
    emoji: '🔳',
    note: '纯本地生成 SVG，内容不经过任何服务器。',
  },
];

export interface Entry {
  path: string;
  title: string;
  desc: string;
  emoji: string;
  /** 卡片右下角的小标签，纯展示 */
  meta: string;
}

/**
 * 入口注册表：首页仪表盘、页头导航都从这里读取。
 *
 * 独立静态页约定：文件放 public/standalone/xxx/index.html（完全不用改原文件），
 * 然后二选一：
 *  - 直达：注册 { path: '/standalone/xxx/index.html' }（注意 dev 服务器不做目录索引解析，
 *    必须写到 index.html）；
 *  - 包装：在 src/pages/ 下建一个 /xxx 的 Astro 页，用 iframe 嵌入并带返回顶条，
 *    注册 { path: '/xxx' }。任务界面走的就是这种方式（见 src/pages/tasks.astro）。
 */
export const ENTRIES: Entry[] = [
  {
    path: '/tasks',
    title: '任务界面',
    desc: '原有的静态任务清单，原样放在 public/standalone/tasks/ 下，零改造接入。',
    emoji: '🗂',
    meta: 'STATIC',
  },
  {
    path: '/notes',
    title: '记事本',
    desc: '随手记一段代码、一个命令、一个踩坑点，存在本地。',
    emoji: '📝',
    meta: 'LOCAL',
  },
  {
    path: '/about',
    title: '关于',
    desc: '三句话，和能找到我的方式。',
    emoji: '🌱',
    meta: 'INFO',
  },
];

export interface NavItem {
  href: string;
  label: string;
}

export const NAV: NavItem[] = [
  { href: '/', label: '首页' },
  { href: '/tools', label: '工具箱' },
  ...ENTRIES.map((entry) => ({ href: entry.path, label: entry.title })),
];

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
