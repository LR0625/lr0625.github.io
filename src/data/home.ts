/**
 * 首页内容。
 *
 * 首页只回答两个问题：
 *   10 秒 —— 我是做什么的（hero）
 *   30 秒 —— 我凭什么适合做 AI 产品（process + selectedWork）
 *
 * 因此首页**不做** Signal Bar / 数据仪表盘。
 * 那种「4 个大数字」需要一个统一的量纲，而真实的产出分布在
 * 用户数、测试数、服务人数等不同维度上，硬凑会变成学生作品集模板。
 * 指标只出现在它真正所属的那个项目里。
 */

export const hero = {
  /** 原文照用，不做改写 */
  name: '林润',
  role: 'AI Product Builder',
  axes: 'Robot Engineering × AI × Vibe Coding',
  promise: '把真实问题快速变成可以被使用、验证和迭代的产品。',
  primaryCta: { label: 'View Projects', href: '/projects' },
  secondaryCta: { label: 'About Me', href: '/about' },
} as const;

/**
 * 30 秒层：工作方式。
 * Vibe Coding 是主叙事，但重点不是「我会用哪个模型」，
 * 而是「我用 AI 缩短了从想法到可运行产品的距离」。
 */
export const process = {
  title: 'Think → Build → Test → Iterate',
  steps: [
    {
      key: 'Think',
      label: '想清楚',
      detail: '把用户的抱怨拆成可以被验证的假设，而不是直接开始写功能',
    },
    {
      key: 'Build',
      label: '做出来',
      detail: '用 AI 把假设变成能点击、能给别人用的东西，而不是停在文档里',
    },
    {
      key: 'Test',
      label: '验证',
      detail: '给真实的人用，看他们卡在哪，而不是看功能是否全部实现',
    },
    {
      key: 'Iterate',
      label: '迭代',
      detail: '按反馈改版，每一轮改动都能追溯到一次具体的用户反馈',
    },
  ],
} as const;

/**
 * 当前在做。
 * 不写版本号 —— 版本号如果是编的，整页可信度都会受影响。
 */
export const currentStatus = {
  label: 'Now building',
  project: 'AI 工作与薪资管理应用',
} as const;

/**
 * 首页精选：只放最有说服力的，不为了「完整」把所有项目堆上来。
 * 选取标准按内容优先级：真实用户 > 真实问题 > 产品判断 > 真实产品。
 *
 * work-salary  —— 有真实用户 + 有多轮反馈驱动的迭代（最强信号）
 * sha-zi-li-ji —— 有可点击的线上地址 + 唯一真正调用大模型的产品（Live Demo First）
 */
export const selectedWork = {
  title: 'Selected Work',
  slugs: ['work-salary', 'sha-zi-li-ji'],
} as const;

/** 其余项目不占首页版面，只在 Projects 页完整列出。 */
export const moreWorkLink = { label: 'All projects', href: '/projects' } as const;

/** 首页思考区只放 3 条，结论前置。 */
export const thinkingTeaser = {
  title: 'Product Thinking',
  slugs: ['why-salary-funnel', 'why-not-ai-birthday', 'clickable-vs-correct'],
} as const;

/** About 摘要：只给两行，详情在 /about。 */
export const aboutTeaser = {
  title: 'About',
  lines: [
    '机器人工程本科在读，深圳技术大学。',
    '既理解物理世界的约束，也能用 AI 把想法快速变成可运行的产品。',
  ],
  cta: { label: 'More about me', href: '/about' },
} as const;

/** 联系区。招聘者要能立刻拿到联系方式与简历。 */
export const contact = {
  title: 'Contact',
  lead: '正在寻找 AI 产品方向的实习机会。',
} as const;

/* 成熟度的顺序、标签与说明统一放在 src/lib/maturity.ts —— 那里同时被
   数据层和组件层引用，避免出现两份不一致的定义。 */
