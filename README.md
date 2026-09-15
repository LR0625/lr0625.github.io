# 林润 · LR SPACE

个人作品集网站。定位是 **AI Product Builder Portfolio** —— 用可点击的产品和结构化的产品思考过程证明「做过」，而不是「会做」。

- 线上地址：<https://lrspace.netlify.app>（主站）
- 镜像：<https://lr0625.github.io>
- 身份：Robot Engineering × AI × Vibe Coding
- 目标读者：AI 产品岗招聘者

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Astro 5（静态输出） |
| 样式 | Tailwind CSS 4（CSS-first `@theme`） |
| 内容 | Astro Content Layer + MDX（Zod 校验） |
| 图片 | `astro:assets`（构建时生成 webp 多尺寸变体） |
| 语言 | TypeScript（strict） |

全站客户端 JS 只有约 **1.3 KB**（主题切换 + 滚动进入）。没有框架运行时。

## 本地开发

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # 产出到 dist/
npm run preview      # 预览构建产物
npm run check        # 类型检查
```

## 内容模型（核心）

`src/content.config.ts` 用**判别式联合**定义三种成熟度。这不是同一套字段的不同取值 —— 概念项目在类型层面就**没有能力**声明用户数、指标和 Demo：

| 成熟度 | 含义 | schema 约束 |
| --- | --- | --- |
| `iterating` | 已交付，正在按真实反馈迭代 | `users` 必填；`iterations` 至少 1 条，且每条必须写 `trigger`（什么触发的） |
| `shipped` | 已交付，有可被他人使用的成品 | `users` 可为 null；`iterations` 可为空 |
| `concept` | 只有方案，没有实现 | `users` / `iterations` / `metrics` / `links.demo` **在此 schema 中不存在** |

新增一个项目 = 在 `src/content/projects/` 加一个 `.mdx` 文件，不需要改任何组件。

内容优先级（字段顺序即优先级顺序）：

```
真实用户 > 真实问题 > 产品判断 > 真实产品 > 真实迭代 > 技术实现
```

### 已落实的原则

- **不编造数据。** 每个指标都带 `source` 字段，可被追问。
- **不编造版本号。** 首页只写 `Now building`，等真实存在版本号再显示。
- **概念必须标记。** `concept` 项目在列表和详情页都明确标注「没有可用实现」，并单列「明确不做」。
- **隐私。** 真实学生姓名、学号、邮箱一律不出现在站点任何位置；CLI 输出中的个人信息已脱敏。

## 目录结构

```
src/
├─ content.config.ts          # 内容模型（判别式联合）
├─ content/
│  ├─ projects/*.mdx          # 项目案例
│  └─ thinking/*.mdx          # 产品思考（观察 → 假设 → 验证 → 结论）
├─ data/                      # site / home / about 的纯数据
├─ lib/                       # 内容查询、SEO、成熟度定义
├─ styles/                    # tokens.css（设计令牌）+ global.css（排版尺度）
├─ components/
│  ├─ primitives/  sections/  cards/  layout/
│  └─ mdx/                    # Case Study 组件：Flow / Decision / Timeline / Callout
├─ layouts/BaseLayout.astro
└─ pages/                     # 首页 / projects / thinking / about / 404
```

## 部署

站点是**纯静态**产物，`dist/` 可以放到任何静态托管上。

### 关键：设置域名

`canonical`、`og:image`、`sitemap` 的绝对地址都由 `SITE_URL` 拼出来。**不设置的话分享卡片会指向占位域名，显示不出来。**

```powershell
$env:SITE_URL="https://你的域名"; npm run build
```

托管平台（Vercel / Cloudflare Pages）在环境变量里加 `SITE_URL` 即可。

### Cloudflare Pages / Vercel / Netlify

| 项 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node 版本 | 20 或更高 |
| 环境变量 | `SITE_URL` = 正式域名 |

### GitHub Pages

GitHub Pages 的项目站点会挂在 `/<仓库名>/` 子路径下，需要额外配置 Astro 的 `base`，并让站内所有链接带上该前缀。当前代码按**根路径部署**编写，因此推荐用上面几个平台或自定义域名。

## 素材说明

`src/assets/projects/` 下的截图来自真实项目，处理方式是**只读取、不修改原始项目文件**：超长截图裁掉空白画布、缩放到合适尺寸，再由 Astro 在构建时生成 webp 变体（最大单图 78 KB）。

原始项目不在此仓库中。
