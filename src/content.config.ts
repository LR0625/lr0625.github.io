import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 作品集内容模型
 * ============================================================
 * 设计原则：用 schema 结构性地阻止「编造证据」。
 *
 * 内容优先级（字段顺序即优先级顺序）：
 *   真实用户 > 真实问题 > 产品判断 > 真实产品 > 真实迭代 > 技术实现
 *
 * 三种成熟度是判别式联合（discriminated union），不是同一套字段的
 * 不同取值 —— 因为概念项目**不应该有能力**声明用户数、指标和 Demo。
 * 如果只是想「先填上」，类型系统会直接报错。
 */

// ---------------------------------------------------------------- 公共片段

/** 真实用户证据。概念项目必须为 null，不给「先写个数字」的机会。 */
const userEvidence = z.object({
  /** 谁在用。允许脱敏描述，如「中学教师」而非真实姓名。 */
  who: z.string(),
  /** 真实人数。不确定就不填，不要估。 */
  count: z.number().int().positive().optional(),
  /** 从什么时候开始用，如 "2025"。 */
  since: z.string().optional(),
  /** 补充说明，如「仅本人自用，无外部用户」。 */
  note: z.string().optional(),
});

/** 一次真实迭代。trigger 是必填的 —— 没有触发原因的改动不算迭代。 */
const iteration = z.object({
  when: z.string().optional(),
  /** 改了什么。 */
  change: z.string(),
  /** 什么触发的：某位用户的反馈 / 自查发现 / 数据异常。 */
  trigger: z.string(),
});

/**
 * 量化指标。
 * value 是字符串而不是数字，因为「32 人」和「26 套」量纲不同，
 * 而且我们不想为了排版而把不确定的数字硬凑成同一量纲。
 */
const metric = z.object({
  label: z.string(),
  value: z.string(),
  /** 这个数字怎么来的，招聘者可以追问。没有来源的指标不许写。 */
  source: z.string().optional(),
});

/**
 * 展示素材。
 * alt 必填 —— 没有 alt 的截图不许进内容库。
 * 图片走 astro:assets，源文件在 src/assets/，构建时自动生成
 * webp/avif 与多尺寸变体。
 */
const makeImage = (image: any) =>
  z.object({
    src: image(),
    alt: z.string(),
    caption: z.string().optional(),
    /** 该图是否适合作为卡片封面 */
    isCover: z.boolean().default(false),
  });

const linkSet = z.object({
  /**
   * 可点击的真实产品入口。这是最高优先级链接。
   * 允许绝对 URL，也允许以 / 开头的站内路径（例如本站托管的可运行 Demo）。
   */
  demo: z
    .string()
    .refine((v) => /^https?:\/\//.test(v) || v.startsWith('/'), {
      message: 'demo 必须是绝对 URL，或以 / 开头的站内路径',
    })
    .optional(),
  /** 可下载的交付物（APK / 单文件 HTML / PDF）。 */
  download: z.string().optional(),
  repo: z.string().url().optional(),
  /** 相关的产品思考长文（站内路径）。 */
  writing: z.string().optional(),
});

/** 所有项目共有的字段。 */
const base = {
  title: z.string(),
  /** 一句话价值主张。写「用户得到什么」，不写「我用了什么技术」。 */
  subtitle: z.string(),
  /** 列表与首页的排序权重，越小越靠前。同时作为项目编号（01、02…）。 */
  order: z.number(),
  featured: z.boolean().default(false),
  /** 展示标签。优先放用户/结果维度，技术栈放最后。 */
  tags: z.array(z.string()).default([]),
  /**
   * 本条目中是否还有未经本人确认的内容。
   * 未确认的内容在页面上会显示占位样式，绝不当成事实渲染。
   */
  needsReview: z.boolean().default(false),
};

// ---------------------------------------------------------------- 三种成熟度

/**
 * 已交付：有可被他人访问/使用的交付物。
 * 允许 users 为 null（例如工程类项目没有「用户」概念），
 * 但一旦填了 users.count，就必须是真数。
 */
const shippedSchema = (image: any) =>
  z.object({
    ...base,
    maturity: z.literal('shipped'),
    kind: z.enum(['product', 'engineering']),
    problem: z.string(),
    keyDecision: z.string(),
    users: userEvidence.nullable().default(null),
    iterations: z.array(iteration).default([]),
    metrics: z.array(metric).default([]),
    links: linkSet.default({}),
    stack: z.array(z.string()).default([]),
    gallery: z.array(makeImage(image)).default([]),
  });

/**
 * 迭代中：已交付 + 正在根据真实反馈改版。
 * iterations 至少 1 条 —— 宣称「迭代中」就必须拿得出改过什么、
 * 以及是什么触发的。这是全站最强的信号，所以门槛最高。
 */
const iteratingSchema = (image: any) =>
  z.object({
    ...base,
    maturity: z.literal('iterating'),
    kind: z.enum(['product', 'engineering']),
    problem: z.string(),
    keyDecision: z.string(),
    users: userEvidence,
    iterations: z.array(iteration).min(1),
    metrics: z.array(metric).default([]),
    links: linkSet.default({}),
    stack: z.array(z.string()).default([]),
    gallery: z.array(makeImage(image)).default([]),
  });

/**
 * 概念：只有产品方案，没有可用实现。
 * users / iterations / metrics / links.demo 在此 schema 中**根本不存在**，
 * 因此不可能被写出来，也不可能被误渲染。
 */
const conceptSchema = (image: any) =>
  z.object({
    ...base,
    maturity: z.literal('concept'),
    problem: z.string(),
    /** 洞察：我看到了什么别人没看到的。 */
    insight: z.string(),
    /** 方案：我打算做什么。 */
    proposal: z.string(),
    /** 我明确决定不做什么。取舍比功能列表更能体现判断力。 */
    nonGoals: z.array(z.string()).default([]),
    /** 当前真实状态，如「方案阶段，未开发」。 */
    statusNote: z.string(),
    /**
     * 概念项目的结构图（自绘流程图，不是产品截图）。
     * 只允许放设计产物，不允许放「假装是产品界面」的图。
     */
    diagrams: z.array(makeImage(image)).default([]),
  });

// ---------------------------------------------------------------- 集合

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.discriminatedUnion('maturity', [
      shippedSchema(image),
      iteratingSchema(image),
      conceptSchema(image),
    ]),
});

/**
 * Product Thinking。
 * 篇幅 400–1000 字，优先质量。固定骨架：
 *   观察 → 假设 → 验证方式 → 结论
 * 这个骨架本身就是内容 —— 招聘者读一篇就学会怎么读其余的。
 */
const thinking = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/thinking' }),
  schema: z.object({
    title: z.string(),
    /** 结论前置，一到两句。列表页只显示这一句。 */
    summary: z.string(),
    date: z.coerce.date(),
    order: z.number().default(0),
    tags: z.array(z.string()).default([]),
    /** 这篇思考来自哪个真实项目。没有真实来源的思考不写。 */
    fromProject: z.string().optional(),
    needsReview: z.boolean().default(false),
  }),
});

export const collections = { projects, thinking };
