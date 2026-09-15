import { site } from '../data/site';

export interface SeoInput {
  /** 页面标题，不含站名后缀。 */
  title?: string;
  description?: string;
  /** 站内路径，用于 canonical。如 '/projects/' */
  path: string;
  type?: 'website' | 'article';
  /** 绝对或相对图片路径。 */
  image?: string;
  noindex?: boolean;
}

export interface Seo {
  fullTitle: string;
  description: string;
  canonical: string;
  image: string;
  type: 'website' | 'article';
  noindex: boolean;
}

/**
 * 站点地址的唯一来源是 astro.config.mjs 的 `site`（由环境变量 SITE_URL 注入）。
 * canonical、og:image、JSON-LD 全部从它拼出来 —— 不在这里另设默认值，
 * 否则会出现「sitemap 指向 A、分享卡片指向 B」的不一致。
 */
function requireSiteUrl(siteUrl: URL | undefined): URL {
  if (!siteUrl) {
    throw new Error(
      '未设置站点地址。请在 astro.config.mjs 中配置 site，或构建时传入 SITE_URL。',
    );
  }
  return siteUrl;
}

export function buildSeo(input: SeoInput, siteUrl: URL | undefined): Seo {
  const base = requireSiteUrl(siteUrl);
  const { title, description, path, type = 'website', image, noindex = false } = input;

  const fullTitle = title
    ? `${title} · ${site.brand}`
    : `${site.name} · ${site.brand} — ${site.role}`;

  return {
    fullTitle,
    description: description ?? site.promise,
    canonical: new URL(path, base).href,
    image: image
      ? new URL(image, base).href
      : new URL('/og/default.png', base).href,
    type,
    noindex,
  };
}

/**
 * 结构化数据。只声明能被本页内容验证的事实 ——
 * 不写职位、不写公司，避免出现网页与实际不符的 SEO 声明。
 */
export function personJsonLd(siteUrl: URL | undefined) {
  const base = siteUrl?.href ?? '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    alternateName: site.nameEn,
    jobTitle: site.role,
    description: site.promise,
    url: base,
    email: `mailto:${site.contact.email}`,
    sameAs: [site.contact.github],
  };
}
