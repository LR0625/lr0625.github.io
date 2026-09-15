/**
 * 成熟度的展示文案与顺序。
 * 单独成文件，避免组件和数据层互相 import 造成环。
 */

export const maturityOrder = ['iterating', 'shipped', 'concept'] as const;

export const maturityLabel: Record<(typeof maturityOrder)[number], string> = {
  iterating: '迭代中',
  shipped: '已交付',
  concept: '概念方案',
};

/**
 * 分组说明。写清楚每种成熟度的判定标准，
 * 招聘者不需要猜这几个标签是什么意思。
 */
export const maturityNote: Record<(typeof maturityOrder)[number], string> = {
  iterating: '已交付，并且正在根据真实用户反馈持续改版',
  shipped: '已交付，有可被他人访问或使用的成品',
  concept: '只有产品方案，没有可用实现',
};
