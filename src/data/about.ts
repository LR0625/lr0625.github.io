/**
 * About 页内容。
 *
 * 明确不做三件事：
 *   1. 技能百分比进度条（无法验证，且招聘者不据此判断）
 *   2. 大段自传（没有信息量）
 *   3. 「热爱技术 / 学习能力强」这类无法证伪的自我评价
 *
 * 事实来源：简历（2026-09-14）+ 本地项目素材审计。
 * 所有时间与数字均可追溯到具体文件。
 */

/** 三行定位。第一行说身份，第二行说不可替代性，第三行说方向。 */
export const positioning = [
  '机器人工程本科在读，深圳技术大学 2025.09 – 2029.06。',
  '既理解物理世界的约束（方程式赛车高压安全回路、PCB、嵌入式），也能用 AI 把想法快速变成可运行的产品。',
  '关注 AI 产品、Vibe Coding 与创作者生态，希望把工程思维和用户视角放在同一个岗位上用。',
];

/**
 * 我能做什么 —— 动词短语。
 * 每一条都必须能对应到作品集里一个具体的项目，否则不许写。
 */
export const capabilities = [
  {
    text: '把一个模糊的用户抱怨，拆成可以被验证的产品假设',
    evidence: '「好几个按键都用不了」→ 发现测试盲区，补 85 条真实点击断言',
    project: 'work-salary',
  },
  {
    text: '用 AI 把想法在几天内变成能跑的东西，而不是停在方案里',
    evidence: '纯前端离线 Android 应用，无后端无登录，已给 2 位教师真实使用',
    project: 'work-salary',
  },
  {
    text: '在两套数据对不上时，先统一定义口径，再改代码',
    evidence: '打卡 ∪ 课表，重叠只算一次；收敛成唯一判定函数',
    project: 'work-salary',
  },
  {
    text: '判断什么时候不该用 AI，并说清楚为什么',
    evidence: '班级生日祝福主动选择模板渲染而非模型生成，理由是失败代价不对称',
    project: 'birthday-agent',
  },
];

/**
 * 时间线。只放可核实的节点。
 * source 字段记录这个节点依据什么文件确认的 —— 防止自己以后记错。
 */
export const timeline = [
  {
    when: '2025.09',
    title: '入学 · 深圳技术大学 机器人工程',
    detail: '本科，预计 2029.06 毕业',
    source: '简历',
  },
  {
    when: '2025 – 至今',
    title: '学院职业生涯服务站 · 项目部部长',
    detail: '负责项目策划与执行，参与学院双选会筹备与现场组织，累计服务 300+ 名师生',
    source: '简历',
  },
  {
    when: '2025 – 至今',
    title: 'AI 工作与薪资管理应用',
    detail: '面向中学教师的工时记录工具，2 位教师 + 本人高频使用，按反馈持续迭代',
    source: '项目 README + 简历',
  },
  {
    when: '2026.07 – 2026.08',
    title: '极光车队 · 电子系统',
    detail: '方程式赛车高压安全回路：规则学习、IMD-AMS 真值表、KiCad 抄板、TSAL 工程',
    source: '车队资料目录时间戳',
  },
  {
    when: '2026.08',
    title: '傻子立几 · 高中立体几何智能建模',
    detail: '拍照 → 多模态识别 → 3D 建模 → 分步解析，已上线 GitHub Pages',
    source: 'GitHub 仓库 + 线上地址',
  },
  {
    when: '2026.08',
    title: '个人健身数据管理 App v1.1.0',
    detail: '4 天循环增肌计划 + 日历记录，个人自用工具',
    source: 'APK 元数据',
  },
  {
    when: '2026.09',
    title: '班级助理 · 26 级机器人工程 3 班',
    detail: '面向 32 名大一新生；策划并落地校园沉浸式破冰活动',
    source: '简历 + 班级资料',
  },
  {
    when: '2026.09',
    title: 'AI 自动化生日祝福工具上线',
    detail: 'GitHub Actions 无人值守运行，32 名同学生日当天各收到一封独立邮件',
    source: 'git log + 项目配置',
  },
];

/**
 * 技能。按「用来做什么」分组，不按熟练度排序。
 * 只列作品集里能被验证的东西 —— 会被默认具备的（Git、基础电路）不写，
 * 写得越长越像技术炫技，反而稀释真正的差异点。
 */
export const skills = [
  {
    group: 'AI / 产品',
    items: [
      'Vibe Coding 工作流',
      'Prompt 设计与迭代',
      '需求拆解与产品迭代',
      '创作者社区生态设计',
    ],
  },
  {
    group: '开发',
    items: [
      'Python',
      'C / C++',
      'JavaScript（原生，无框架）',
      'Flutter',
      'Capacitor（Web → Android）',
      'STM32 嵌入式',
    ],
  },
  {
    group: '硬件 / 工程',
    items: [
      'KiCad 原理图与 PCB',
      'CATIA',
      '高压安全回路（TSAL / BSPD / IMD / AMS）',
    ],
  },
];

export const education = {
  school: '深圳技术大学',
  major: '机器人工程（本科）',
  period: '2025.09 – 2029.06',
  gpa: '3.5',
};

/** 作品集网站之外的公开入口。 */
export const links = {
  github: 'https://github.com/LR0625',
  email: 'lr8330lr@gmail.com',
  resume: '/resume/林润-简历.pdf',
};
