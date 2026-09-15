import { getCollection, type CollectionEntry } from 'astro:content';
import { maturityOrder } from './maturity';

export type Project = CollectionEntry<'projects'>;
export type Thinking = CollectionEntry<'thinking'>;
export type Maturity = (typeof maturityOrder)[number];

/** 全部项目，按 order 升序。 */
export async function getProjects(): Promise<Project[]> {
  const all = await getCollection('projects');
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getThinking(): Promise<Thinking[]> {
  const all = await getCollection('thinking');
  return all.sort(
    (a, b) =>
      a.data.order - b.data.order ||
      b.data.date.getTime() - a.data.date.getTime(),
  );
}

/** 按 slug 精确取，未命中返回 undefined（页面负责 404）。 */
export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const all = await getCollection('projects');
  return all.find((p) => p.id === slug);
}

export async function getThinkingBySlug(slug: string) {
  const all = await getCollection('thinking');
  return all.find((t) => t.id === slug);
}

/**
 * 首页精选。
 * 只取 featured，**不因为某个项目没被选中就往里补** ——
 * 首页只展示最有说服力的项目，凑数会稀释重点。
 */
export async function getFeaturedProjects(): Promise<Project[]> {
  const all = await getProjects();
  return all.filter((p) => p.data.featured);
}

/** 按成熟度分组，组内保持 order 顺序；空组直接丢弃。 */
export async function getProjectsByMaturity() {
  const all = await getProjects();

  return maturityOrder
    .map((maturity) => ({
      maturity,
      items: all.filter((p) => p.data.maturity === maturity),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * 判断项目是否带有「证据类」字段。
 * concept 的 schema 里没有 users / iterations / metrics，
 * 所以这里返回 false 的项目一定没有可展示的量化证据。
 */
export function hasEvidence(p: Project): boolean {
  return p.data.maturity !== 'concept';
}

/** 类型收窄：拿到 users / iterations / metrics / links / stack。 */
export function isEvidenceProject(
  p: Project,
): p is Extract<Project, { data: { maturity: 'shipped' | 'iterating' } }> {
  return p.data.maturity === 'shipped' || p.data.maturity === 'iterating';
}

/** 站内思考文章的链接。 */
export function thinkingHref(slug: string) {
  return `/thinking/${slug}/`;
}

export function projectHref(slug: string) {
  return `/projects/${slug}/`;
}
