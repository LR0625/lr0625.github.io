/**
 * 站点级信息。
 * 这里只放"全站唯一"的事实，任何在多个页面重复出现的内容都不属于这个文件。
 */

export const site = {
  /** 首页第一屏 —— 10 秒定位层 */
  name: '林润',
  nameEn: 'LIN RUN',

  /**
   * 站点名。出现在 <title> 后缀、页脚、分享卡片上。
   * 与简历上的作品集链接（lrspace.netlify.app）保持一致 ——
   * 招聘者从简历点进来时，URL 和页面上的名字对得上。
   */
  brand: 'LR SPACE',

  /** 身份标签。首屏必须在这一行里完成定位。 */
  role: 'AI Product Builder',

  /** 定位轴：机器人工程 × AI × Vibe Coding × Product */
  axes: 'Robot Engineering × AI × Vibe Coding',

  /** 一句话价值主张（用户提供，未经改写） */
  promise: '把真实问题快速变成可以被使用、验证和迭代的产品。',

  /**
   * 站点地址**不在这里定义**。
   * 唯一来源是 astro.config.mjs 的 `site`（构建时由环境变量 SITE_URL 注入），
   * 避免 canonical / sitemap / og:image 各自指向不同域名。
   */
  locale: 'zh-CN',

  /** 导航。Résumé 是全站性价比最高的一个按钮，必须常驻。 */
  nav: [
    { label: 'Projects', href: '/projects' },
    { label: 'Thinking', href: '/thinking' },
    { label: 'About', href: '/about' },
  ],

  /** 简历：招聘者最想拿走的文件，1 次点击可达 */
  resume: '/resume/林润-简历.pdf',

  contact: {
    email: 'lr8330lr@gmail.com',
    github: 'https://github.com/LR0625',
    /** 用户确认公开（2026-09-14） */
    phone: '13531228330',
    wechat: null as string | null,
  },
} as const;

export type Site = typeof site;
