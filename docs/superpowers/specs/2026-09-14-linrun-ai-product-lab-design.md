# 林润 · AI Product Lab —— 作品集网站设计文档

- 日期：2026-09-14
- 状态：v2 修订（用户审阅后）
- 类型：新建项目（架构级）

---

## 0. v2 修订：被本版取代的原始设计

用户审阅后提出 8 点修改，另追加「招聘者优先原则」。以下条款**取代**文档后续章节中的对应内容，冲突时以本节为准。

| # | 原设计（已废弃） | 修订后 |
|---|---|---|
| 1 | 成功标准只有「30 秒内理解身份」 | 拆成两级：**10 秒知道我是做什么的**（首屏必须出现 `机器人工程 × AI × Vibe Coding × Product`），**30 秒知道我凭什么适合 AI 产品** |
| 2 | 首页 Signal Bar：4 个大数字 + count-up | **删除**。真实产出分布在用户数/测试数/服务人数等不同量纲上，硬凑成个人数据仪表盘会显得模板化。指标只出现在它真正所属的项目内部，用小型标签呈现 |
| 3 | `Now: … App · v0.3 迭代中` | **删除版本号**。版本号未经确认不得出现。改为 `Now building：<项目名>`，等真实存在版本号后再显示 |
| 4 | 5 个项目统一六段式（Problem→Insight→Solution→Build→Evidence→Iteration） | 六段式降级为**大型案例的最大模板，而非强制模板**。不同项目长度必须不同：大型真实项目用完整案例，小型项目保持简洁 |
| 5 | `/thinking` 每篇 800–1500 字 | 改为 **400–1000 字，优先质量**。不是博客，是让招聘者快速理解产品判断 |
| 6 | 无 | 新增 **Live Demo First 原则**：Demo / Product 先于 Case Study。卡片上先给可点击入口，再给产品思考 |
| 7 | AI 叙事停留在「会用 ChatGPT / DeepSeek」 | Vibe Coding 升为**主叙事**，但不得做成 AI 炫技。表达为 `Think → Build → Test → Iterate`，即「用 AI 缩短了产品想法 → 可运行产品 的距离」 |
| 8 | 站点围绕「求职腾讯/AI 产品实习」组织 | **网站本体不得出现任何公司名或「目标岗位」字样**。它是专业作品集，不是为某家公司定制的作业；内容结构可以面向该类岗位优化 |

### 0.1 招聘者优先原则

网站最终服务于「AI 产品实习求职」，但不得做成针对某一家公司的定制求职页面。

分级目标：

1. 10 秒 —— 知道我是做什么的
2. 30 秒 —— 理解核心能力
3. 1 分钟 —— 看到真实作品
4. 2 分钟 —— 理解一个完整产品案例
5. 5 分钟 —— 形成「这个人真的会做 AI 产品」的判断

网站不是 CV 的视觉化版本。它的作用是：**「证明我做过，而不是声称我会。」**

优先级：真实产品、真实用户、真实迭代、真实数据 > 长篇文字；Live Demo > Case Study；案例顺序为 `Problem → Insight → Decision → Build → Evidence → Iteration`。

不得为了视觉效果制造：虚假数据、虚构用户、虚构版本、虚构产品成果、虚构 AI 能力。**数据不存在就不显示。项目只是 Concept 必须明确标记。任何无法由本人提供的信息确认的内容，不得自行补全。**

> 该原则已通过技术手段落地：见 `src/content.config.ts` —— 三种成熟度是判别式联合，`concept` 的 schema 中**根本不存在** `users` / `iterations` / `metrics` / `links.demo` 字段，因此不可能被写下或误渲染；`iterating` 要求 `iterations` 至少 1 条且每条必须填写 `trigger`（什么触发的），没有触发原因的改动不算迭代。

### 0.2 内容优先级（覆盖原文的字段重要性认知）

```
真实用户 > 真实问题 > 产品判断 > 真实产品 > 真实迭代 > 技术实现
```

而非技术栈优先。`src/content.config.ts` 的字段顺序与 `src/data/*` 的组织顺序均按此排列。

### 0.3 与后续章节的关系

§1–§13 中的**信息架构、组件结构、设计系统、技术方案、文件目录**继续有效。
其中 §3.2 首页结构图中的 ② Signal Bar、③ Current Status 的版本号写法，以及 §4.1 六段式的强制适用范围，以本节为准。

---

## 1. 项目目标

为「林润 · AI Product Lab」构建一个面向 AI 产品实习求职的作品集网站。它不是简历页，而是一个 **AI Product Builder Portfolio**：用可点击的产品和结构化的产品思考过程，证明求职者能够走完「用户问题 → 产品洞察 → 解决方案 → Vibe Coding 实现 → 用户反馈 → 迭代」的完整闭环。

**核心定位**：Robot Engineering × AI × Vibe Coding

### 1.1 成功标准

1. 招聘者在 **30 秒内**理解身份：机器人工程学生 + AI/Vibe Coding 产品实践者。
2. 招聘者能看到 **真实做过的产品**，而非纯文字描述。
3. 招聘者能在一个项目内看清完整的 **产品思考闭环**。
4. 站点在 **中国大陆网络环境下可访问**（面试官在腾讯工位能打开）。
5. 性能与可达性达标：Lighthouse 四项 ≥ 95，首页 JS ≤ 30KB gzip，LCP < 1.5s。

### 1.2 目标受众

- AI 产品经理招聘者
- 腾讯 / 互联网公司产品面试官
- AI 创业团队
- 对 AI Product Builder 感兴趣的从业者

---

## 2. 已确认的关键决策

| # | 决策项 | 结论 | 理由 |
|---|---|---|---|
| 1 | 技术栈 | **Astro 5 + Tailwind CSS 4 + MDX** | 逐路由静态 HTML，分享卡片与 SEO 正常；默认零 JS；构建产物为纯静态文件夹，可部署到任何平台（含国内对象存储） |
| 2 | 主题模式 | **亮色默认 + 暗色切换**（跟随系统，可手动覆盖） | 阅读长案例更舒适，贴近 editorial / 产品公司感 |
| 3 | 强调色 | **Signal Orange `#F0561D`** | 在满屏科技蓝的作品集中具备辨识度，明暗两主题均成立 |
| 4 | 语言 | **中文为主 + 关键信息英文点缀**，架构预留 i18n 字段 | 面向国内 AI 团队的最优解，写作成本最低，未来可无痛扩展 |
| 5 | 内容策略 | **先用结构化占位内容搭完整站，用户再逐项替换为真实内容** | 开发不被素材阻塞；schema 先行保证替换时零改代码 |
| 6 | 部署 | **Vercel 主站 + Cloudflare Pages 镜像**（同一份静态产物） | 双域名互备，最大程度规避 `vercel.app` 在大陆不可达的风险 |

### 2.1 一并采纳的次级决策

- **`/thinking/:slug` 详情页纳入 v1**：仅有列表页无法体现实质思考，且内容集合机制已具备，边际成本接近零。
- **导航栏固定 `Résumé ↗` 入口**：指向 `public/resume/林润-简历.pdf`，招聘者 1 次点击即可获取简历。
- **暗色模式在首版即实现**：通过 CSS 自定义属性（设计令牌）实现，前期成本约 10%，事后返工成本约 3 倍。
- **v1 不引入 React**：主题切换、数字动效、移动导航以原生 TypeScript 岛实现，依赖面最小化。
- **`/projects` 不做筛选器**：5 个项目不需要，YAGNI。
- **不引入中文 Web 字体**：使用系统中文回退栈，体积收益不成比例。

---

## 3. 信息架构

```
/                    首页             身份 + 证据 + 精选项目 + 思考入口 + 联系方式
/projects            项目总览          5 个项目，按产品成熟度分组
/projects/:slug      项目详情          统一六段式案例
/thinking            Product Thinking 列表
/thinking/:slug      思考详情          固定结构的短文
/about               关于我            叙事 + 能力 + 时间线 + 联系方式
/404                 兜底页
```

### 3.1 导航结构

- 主导航：`Projects` · `Thinking` · `About`
- 右侧固定动作：`Résumé ↗`（简历 PDF）+ `ThemeToggle`
- 移动端：折叠为全屏面板，触控目标 ≥ 44px
- 全站 `SkipLink` 指向主内容区

### 3.2 首页纵向结构

顺序即优先级，决定 30 秒成败：

```
┌─ Header（sticky；半透明毛玻璃；滚动后出现 1px 发丝分割线）
│
├─ ① Hero —— 文案按用户原文，不加装饰
│     林润
│     AI Product Builder
│     Robot Engineering × AI × Vibe Coding
│     把真实问题快速变成可以被使用、验证和迭代的产品。
│     [View Projects]  [About Me]
│
├─ ② Signal Bar —— 4 个数字，滚动进入时轻微 count-up
│     数值来源：src/data/metrics.ts（人工维护，须为真实数据）
│     结构示意：[产品数] · [用户数] · [迭代轮次] · [最快交付时长]
│
├─ ③ Current Status —— 一行实时信号
│     ● Now: AI 工作与薪资管理 App · v0.3 迭代中
│
├─ ④ Selected Work —— 2 张大卡（横向布局，含截图）
│     每张卡直接陈述「用户问题」，不罗列技术栈
│
├─ ⑤ Thinking Teaser —— 3 条思考标题
├─ ⑥ About Teaser —— 2 行定位 + 头像 + 进入 About
├─ ⑦ Contact —— 邮箱/微信一键复制 + 简历下载
└─ Footer
```

**设计理由**：用户要求的极简文字首屏予以保留（一字不改），但紧贴其下加入「证据条」，使「身份」与「证明」在约 1.2 屏内同时完成。Selected Work 只放 2 张：5 张同样的卡片会把「精选」降级为「列表」，注意力被摊平。

---

## 4. 内容模型

### 4.1 统一案例结构（本方案的核心架构决策）

5 个项目共用同一套六段骨架。招聘者读完第一个项目即掌握阅读范式，其后四个项目的阅读效率呈数量级提升；同时该结构与用户要求的「产品思考闭环」逐项对应。

| 段落 | 回答的问题 | 传递给招聘者的信号 |
|---|---|---|
| `01` Problem | 谁、在什么场景、多痛 | 是否从用户出发 |
| `02` Insight | 我发现了什么别人没看到的 | 洞察力 |
| `03` Solution | 我决定做什么，**以及不做什么** | 判断力 / 取舍 |
| `04` Build | 怎么在 N 天内用 Vibe Coding 做出来 | AI 执行力 |
| `05` Evidence | 用户原话 / 数据 / 验证方式 | 验证意识 |
| `06` Iteration | 改了什么，结果如何 | 迭代闭环 |

每页顶部固定一条元信息带：`角色 · 周期 · 状态 · 关键技术`，并配一句**一句话价值主张**（非项目简介）。

### 4.2 内容集合 Schema

内容以类型化集合管理（Astro Content Layer + Zod 校验），而非散装 Markdown。

```ts
// src/content.config.ts（概念示意）
projects: {
  slug: string,
  title: string,
  tagline: string,                 // 用户问题的一句话陈述
  role: string,
  timeline: string,                // 如 "2025.03 – 2025.05"
  status: 'shipped' | 'iterating' | 'prototype',
  category: ('ai-product' | 'vibe-coding' | 'robotics')[],
  featured: boolean,
  order: number,
  problem: string,                 // 卡片上直接展示
  metrics: { label: string, value: string, suffix?: string }[],
  stack: string[],
  links: { demo?: string, repo?: string, writeup?: string },
  cover: ImageMetadata,
  gallery: ImageMetadata[],
  // i18n 预留
  locale: 'zh' | 'en',
}

thinking: {
  slug: string,
  title: string,
  summary: string,
  date: Date,
  tags: string[],
  readingTime: number,
  locale: 'zh' | 'en',
}
```

**收益**：
- 新增项目 = 新增一个 `.mdx` 文件，无需改动任何组件。
- 首页数字从项目数据自动聚合，改一处全站同步。
- 字段错误在构建期即报错，而非上线后发现。
- i18n 字段已预留，未来做双语无需重构。

### 4.3 数据真实性原则（硬约束）

**绝不编造用户数据。** 招聘者一旦发现一个假数据，整站可信度归零。

- 有真实数据的项目：正常展示数字。
- 无真实数据的项目：以「验证方式」替代「结果数字」，例如用 `每周 3 次用户访谈` 代替 `1,200 用户`。
- 状态字段诚实标注：`已上线` / `验证中` / `原型`。

诚实本身就是产品成熟度的信号。

### 4.4 首版内容清单（占位，待用户替换）

| # | 项目 | slug（建议） | 类型 |
|---|---|---|---|
| 1 | AI 工作与薪资管理应用 | `ai-work-salary` | `ai-product` |
| 2 | Vibe Coding 创作者社区 | `vibe-coding-community` | `vibe-coding` |
| 3 | 个人健身数据管理 App | `fitness-tracker` | `ai-product` |
| 4 | AI 自动化生日祝福工具 | `ai-birthday-wish` | `ai-product` |
| 5 | 机器人项目 | `robotics-arm` | `robotics` |

---

## 5. 页面规格

### 5.1 `/projects`

- 5 个项目按**产品成熟度**分组（`已上线` / `验证中` / `原型`），而非按技术分类。这一分组本身即产品思维的展示。
- 卡片展示：封面图、一句话用户问题、状态标签、1–2 个关键指标。
- 不做筛选器（YAGNI）。

### 5.2 `/about`

明确避开三样东西：技能百分比进度条、大段自传、「热爱技术」类空话。

结构：
1. 3 行定位陈述
2. **我能做什么** —— 动词短语（如「用 AI 把想法在 48 小时内变成可点击原型」）
3. 时间线
4. 联系方式

叙事主线：**「我既懂物理世界的约束，也能用 AI 把想法快速变成产品。」**
这是相对于纯文科/纯商科 AI PM 候选人不可复制的优势。

### 5.3 `/thinking`

每篇 800–1500 字，固定结构：`观察 → 假设 → 验证方式 → 结论`。
该板块是全站最能体现产品 sense 的部分，价值高于 About 页。

---

## 6. 组件结构

```
layout/     Header  Footer  MobileNav  SkipLink
sections/   Hero  SignalBar  CurrentStatus  SelectedWork
            ThinkingTeaser  AboutTeaser  ContactCTA
cards/      ProjectCard  ProjectCardWide  ThinkingCard  MetricCard
primitives/ Container  Section  Stack  Heading  Text  Tag  Button
            IconLink  Divider  Eyebrow
ui/         ThemeToggle  CountUp  Reveal  CopyButton  Toc  ImageFrame
```

### 6.1 隔离原则

- `primitives` 完全无业务逻辑，只接收 props。
- `cards` 只认内容类型（Project / Thinking）。
- `sections` 负责编排组合。

换视觉不改内容，换内容不碰视觉。每个单元可独立理解与替换。

### 6.2 客户端脚本预算

`Reveal`（滚动进入）与 `CountUp`（数字动效）各约 30 行原生 TypeScript，不引入动画库。
`ThemeToggle` 与 `MobileNav` 同为原生岛。全站客户端 JS 目标 ≤ 30KB gzip。

---

## 7. 设计系统

### 7.1 颜色

以黑、白、灰为基底。强调色 `#F0561D` 仅出现在 4 个位置，约占 3% 像素：

1. 主 CTA 按钮
2. 导航激活指示
3. 关键数字
4. 链接下划线 / 焦点环

设计令牌以 CSS 自定义属性定义，明暗两套值：

```css
/* 示意 */
--bg, --bg-subtle, --surface
--border, --border-strong
--text, --text-secondary, --text-tertiary
--accent, --accent-contrast, --accent-subtle
```

### 7.2 字体

- 拉丁字母与数字：`Inter`（自托管可变字体，约 100KB）
- 中文回退栈：`PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC`
- 数字统一 `font-variant-numeric: tabular-nums`，使指标对齐
- **不引入中文 Web 字体**

### 7.3 尺度

| 项目 | 规格 |
|---|---|
| 栅格 | 12 列 |
| 最大宽 | 1200px |
| 正文行宽 | 68ch |
| 模块间距 | `clamp(64px, 10vw, 160px)` |
| 圆角 | 8–12px |
| 分割线 | 1px `rgba(0,0,0,.08)` |
| 层级手段 | 留白与字重为主，不用阴影和渐变 |

排版比例约 1.25，基准 16px，Hero 使用 `clamp(2.75rem, 6vw, 4.5rem)`。

### 7.4 动效

仅保留 4 处，全部可被 `prefers-reduced-motion` 降级为纯淡入：

| 动效 | 时长 |
|---|---|
| 卡片 hover | 150ms |
| 区块进入 | 250ms |
| 图片 reveal | 400ms |
| 数字 count-up | 600ms |

统一缓动 `cubic-bezier(.16, 1, .3, 1)`。
**不做**：视差、粒子、3D、scroll-jacking、渐变光晕、无意义装饰动画。

### 7.5 响应式

| 断点 | 布局 |
|---|---|
| `< 640px` | 单列，移动导航面板 |
| `640–1024px` | 平板，2 列卡片 |
| `> 1024px` | 桌面，12 栅格 |

移动端触控目标 ≥ 44px。

### 7.6 可达性

- 语义化 landmark 结构
- 焦点环使用强调色，始终可见
- 导航使用 `aria-current`
- 对比度 ≥ 4.5:1
- `SkipLink` 跳至主内容
- 所有图片含 `alt`，装饰图 `alt=""`

---

## 8. 技术方案

### 8.1 技术选型

| 层 | 选型 |
|---|---|
| 框架 | Astro 5 |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`，CSS-first `@theme` 配置） |
| 内容 | Astro Content Layer + MDX |
| 语言 | TypeScript（strict） |
| 图片 | `astro:assets`（AVIF/WebP 优化，显式尺寸防 CLS） |
| SEO | `@astrojs/sitemap` + 逐页 meta + JSON-LD |
| 包管理 | npm |

**v1 不引入 `@astrojs/react`**。将来需要嵌入交互式 Demo 时再按需添加。

### 8.2 架构边界

- **内容层**（`src/content/`）：纯数据，不引用组件。
- **数据层**（`src/data/`）：站点元信息、导航、指标、经历、技能，纯 TypeScript 常量。
- **查询层**（`src/lib/content.ts`）：封装排序、筛选、关联查询，组件不直接读文件系统。
- **表现层**（`src/components/`）：只接 props 与内容类型。
- **页面层**（`src/pages/`）：负责编排与路由参数解析。

### 8.3 性能预算

| 指标 | 目标 |
|---|---|
| LCP | < 1.5s |
| 首页 JS | ≤ 30KB gzip |
| Lighthouse | 四项 ≥ 95 |
| CLS | ≈ 0 |

### 8.4 部署

- 主站：Vercel（连接 Git 仓库自动构建）
- 镜像：Cloudflare Pages（同一份 `dist/` 静态产物）
- 明确规避：仅依赖 `*.vercel.app` 域名（大陆网络下经常不可达）
- 静态产物亦兼容国内对象存储 + CDN（若未来需要 ICP 备案方案）

---

## 9. 文件目录

```
个人网站/
├─ public/
│  ├─ favicon.svg
│  ├─ resume/林润-简历.pdf
│  ├─ og/                            # 分享卡片图
│  └─ images/projects/<slug>/        # 项目截图（webp/avif）
├─ src/
│  ├─ content.config.ts              # ★ 内容集合 + Zod schema（核心）
│  ├─ content/
│  │  ├─ projects/                   # 5 个 .mdx
│  │  └─ thinking/                   # 思考文章 .mdx
│  ├─ data/                          # site.ts nav.ts metrics.ts experience.ts skills.ts
│  ├─ styles/                        # tokens.css global.css prose.css
│  ├─ components/
│  │  ├─ layout/  sections/  cards/  primitives/  ui/
│  ├─ layouts/                       # BaseLayout PageLayout CaseStudyLayout
│  ├─ lib/                           # content.ts seo.ts format.ts
│  └─ pages/
│     ├─ index.astro
│     ├─ projects/index.astro
│     ├─ projects/[slug].astro
│     ├─ thinking/index.astro
│     ├─ thinking/[slug].astro
│     ├─ about.astro
│     └─ 404.astro
├─ docs/superpowers/specs/           # 设计文档（本文件）
├─ astro.config.mjs
├─ tsconfig.json
├─ package.json
└─ README.md
```

---

## 10. 实施顺序

1. 项目脚手架 + 设计令牌 + 全局样式
2. 布局层：BaseLayout / Header / Footer / MobileNav
3. 内容集合 Schema + 5 个项目占位内容
4. 首页（Hero → SignalBar → SelectedWork → Teaser → Contact）
5. 项目详情页（六段式案例）
6. `/projects` 总览
7. `/thinking` 列表与详情
8. `/about`
9. 响应式、可达性、`prefers-reduced-motion` 打磨
10. 性能与 SEO 收尾（OG 图、sitemap、JSON-LD）
11. 部署（Vercel + Cloudflare Pages）

---

## 11. 明确的范围边界（v1 不做）

- 不做筛选/搜索
- 不做后台 CMS
- 不做评论、订阅、RSS
- 不做多语言完整切换（仅预留字段）
- 不做 3D / 粒子 / 视差
- 不做联系方式表单（用邮箱一键复制 + 简历下载替代）

---

## 12. 待用户提供的关键素材

以下素材缺失时会使用占位内容，不阻塞开发：

1. 5 个项目的真实截图（每个项目建议 2–4 张，含手机/浏览器界面）
2. 5 个项目的真实指标数据与用户反馈原话（若无则改用「验证方式」表述）
3. 个人头像照片
4. 简历 PDF 文件
5. 真实的 GitHub / Demo 链接
6. 联系方式：邮箱、微信、GitHub、其他
7. 教育背景与实习经历的时间线
