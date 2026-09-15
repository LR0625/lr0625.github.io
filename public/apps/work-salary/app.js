/* ============================================================
   zmh的上班日记
   上班/下班打卡、工作时段与备注、日历、课表、工资统计、打卡鼓励语
   数据只存在设备本地，没有后端、没有账号。
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'worklog.demo.v1';          // 打卡记录
  var SETTINGS_KEY = 'worklog.demo.settings.v1'; // 设置（月工资）
  var COURSES_KEY = 'worklog.demo.courses.v1';   // 课表（与工时记录完全分开存）
  /* 数据结构版本：改动课程/设置结构时 +1，老数据在读取时自动迁移（不删任何东西）
     1 -> 2：课表的「周次」从「中文文本」增加结构化字段 weekNums（文本只留给显示用）
     2 -> 3：工资从「一个月工资」变成「按月独立的 月工资 + 目标工时」，
             用来算「工资进度 = 月工资 × 工时 ÷ 目标工时」。默认值仍留在原字段上，
             各月的独立设置放在 settings.salaryMonths（老数据不会被动过） */
  var DATA_VERSION = 3;
  var NOTE_MAX = 100;                            // 备注最长字数
  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var MIN = 60000, HOUR = 3600000, SEC = 1000;

  /* ============================================================
     一、时间与格式化（纯函数）
     ============================================================ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 本地日期键，例如 2026-05-20 */
  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** "2026-05-20" -> Date（当天 00:00） */
  function keyToDate(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function startOfDay(key) { return keyToDate(key).getTime(); }

  function endOfDay(key) {
    var d = keyToDate(key);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  /** "09:02" + 某一天 -> 时间戳 */
  function hmToMs(key, hm) {
    var d = keyToDate(key), p = hm.split(':');
    d.setHours(+p[0], +p[1], 0, 0);
    return d.getTime();
  }

  /** 09:02 */
  function fmtHM(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 09:02:31 */
  function fmtHMS(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /** 5月20日 星期三 */
  function fmtDateLine(d) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
  }

  /** "2026-05-20" -> 5月20日 星期三 */
  function fmtDayKey(key) {
    var d = keyToDate(key);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
  }

  function splitMs(ms) {
    var minutes = Math.floor(Math.max(0, ms) / MIN);
    return { h: Math.floor(minutes / 60), m: minutes % 60 };
  }

  /** 03小时25分钟 */
  function fmtDur(ms) {
    var p = splitMs(ms);
    return pad2(p.h) + '小时' + pad2(p.m) + '分钟';
  }

  /** 大字号总工时 */
  function durHTML(ms) {
    var p = splitMs(ms);
    return '<b>' + pad2(p.h) + '</b><span>小时</span>' +
           '<b>' + pad2(p.m) + '</b><span>分钟</span>';
  }

  /** 8h42m —— 日历格子太窄，用紧凑写法 */
  function fmtDurCompact(ms) {
    var p = splitMs(ms);
    if (p.h === 0) return p.m + 'm';
    if (p.m === 0) return p.h + 'h';
    return p.h + 'h' + pad2(p.m) + 'm';
  }

  /** ¥8000 / ¥8000.50 */
  function fmtMoney(n) {
    var r = Math.round(n * 100) / 100;
    return '¥' + (Math.abs(r % 1) < 0.005 ? String(Math.round(r)) : r.toFixed(2));
  }

  /** ¥8000.00 —— 一定带两位小数（工资池的「分子 / 分母」统一用这个写法） */
  function fmtMoney2(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return '¥' + v.toFixed(2);
  }

  /** ¥47.47 / 小时 */
  function fmtRate(n) {
    return '¥' + n.toFixed(2);
  }

  /** 42.86% —— 百分比只留两位小数，绝不会出现 NaN / Infinity */
  function fmtPercent(p) {
    var v = Number(p);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 100) v = 100;
    return v.toFixed(2) + '%';
  }

  /** 68小时34分钟 —— 大数字不加前导 0，读起来更像人话 */
  function fmtDurPlain(ms) {
    var p = splitMs(ms);
    if (p.h === 0 && p.m === 0) return '0分钟';
    if (p.h === 0) return p.m + '分钟';
    if (p.m === 0) return p.h + '小时';
    return p.h + '小时' + p.m + '分钟';
  }

  /** 2小时17分钟24秒 —— 算工资进度时按秒算，显示也给到秒 */
  function fmtDurSec(ms) {
    var total = Math.max(0, Math.floor(ms / SEC));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (h > 0) return h + '小时' + pad2(m) + '分钟' + pad2(s) + '秒';
    if (m > 0) return m + '分钟' + pad2(s) + '秒';
    return s + '秒';
  }

  /** 秒级小数：目标时薪用到（¥0.833333 / 分钟） */
  function fmtRate6(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) v = 0;
    return '¥' + v.toFixed(6);
  }

  function fmtRate7(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) v = 0;
    return '¥' + v.toFixed(7);
  }

  /** "8000" / "8,000.5" / "¥8000" -> 8000.5；非法返回 null */
  function parseMoney(s) {
    if (typeof s !== 'string') s = String(s == null ? '' : s);
    s = s.replace(/[,\s¥￥]/g, '');
    if (s === '') return null;
    if (!/^\d*(\.\d*)?$/.test(s)) return null;
    var n = Number(s);
    return (isFinite(n) && n >= 0) ? n : null;
  }

  /** 备注是用户输入，拼进 innerHTML 前必须转义 */
  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ============================================================
     二、数据层
     db = { "2026-05-20": [ { start, end, note }, ... ] }
     end === null 表示这一段还在进行中；note 可选，缺失表示没有备注
     数组始终按 start 升序
     ============================================================ */

  var db = {};
  var storageOK = true;
  var today = dayKey();

  /** 备注：去掉首尾空白，空字符串表示「没有备注」 */
  function cleanNote(v) {
    return (typeof v === 'string') ? v.trim().slice(0, NOTE_MAX) : '';
  }

  /** "2026-9-4" / "2026/09/04" / "2026年9月4日" -> "2026-09-04"；不合法返回空 */
  function cleanDate(v) {
    var m = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/.exec(String(v == null ? '' : v));
    if (!m) return '';
    var mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return m[1] + '-' + pad2(mo) + '-' + pad2(d);
  }

  /* ---------- 读 ---------- */

  function sanitize(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;

    Object.keys(raw).forEach(function (key) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      var list = raw[key];
      if (!Array.isArray(list)) return;

      var clean = [];
      list.forEach(function (item) {
        if (!item || typeof item.start !== 'number' || !isFinite(item.start)) return;
        var end = (typeof item.end === 'number' && isFinite(item.end)) ? item.end : null;
        if (end !== null && end < item.start) end = item.start;

        var entry = { start: item.start, end: end };
        var note = cleanNote(item.note);
        if (note) entry.note = note;      // 没有备注就不写这个字段
        if (item.est) entry.est = 1;      // 「忘了点下班、时间是按 23:59 估的」标记，要留着
        clean.push(entry);
      });

      clean.sort(function (a, b) { return a.start - b.start; });

      // 一天最多只允许一段「进行中」，保留开始最晚的那一段
      var openIdx = -1;
      for (var i = 0; i < clean.length; i++) if (clean[i].end === null) openIdx = i;
      for (var j = 0; j < clean.length; j++) {
        if (j !== openIdx && clean[j].end === null) clean[j].end = clean[j].start;
      }

      if (clean.length) out[key] = clean;
    });

    return out;
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      db = raw ? sanitize(JSON.parse(raw)) : {};
    } catch (e) {
      storageOK = false;
      db = {};
    }
  }

  function save() {
    if (!storageOK) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      storageOK = false;
    }
  }

  /* ---------- 设置：月工资 + 本月目标工时（按月各自独立） ---------- */

  var settings = {
    monthlySalary: null,     // 默认月工资（没有单独设置过的月份用它）
    targetHours: null,       // 默认目标工时（小时，> 0；没有就是「还没设置」）
    salaryMonths: {},        // { '2026-09': { salary: 8000, targetHours: 160 } } 各月独立，永不互相覆盖
    ttView: 'grid', semesterStart: '', periods: null, periodLen: 40, periodGap: 10
  };

  /** 某个月的键：'2026-09' */
  function monthKey(y, m) { return y + '-' + pad2(m + 1); }

  /** '2026-09-14' -> '2026-09' */
  function monthKeyOfDay(day) { return String(day || '').slice(0, 7); }

  /** 目标工时（小时）：必须是有限正数，否则当没设置（界面上就提示去设置） */
  function cleanTargetHours(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    if (n > 1000) return null;                     // 一个月不可能有 1000 小时
    var r = Math.round(n * 100) / 100;             // 允许 160.5 这种
    return r > 0 ? r : null;                       // 极小值舍入成 0 也要当「没设置」，不能留下 0
  }

  /** 单个「月工资」金额：允许 0（工资为 0 就正常显示 0），不合法返回 null */
  function cleanSalary(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n) || n < 0) return null;
    if (n > 100000000) return null;
    return Math.round(n * 100) / 100;
  }

  /** 各月独立设置：只留合法的月份键和字段，其它一律丢掉 */
  function cleanSalaryMonths(o) {
    var out = {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(o).forEach(function (k) {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      var v = o[k];
      if (!v || typeof v !== 'object') return;
      var one = {};
      var sal = cleanSalary(v.salary);
      if (sal !== null) one.salary = sal;
      var th = cleanTargetHours(v.targetHours);
      if (th !== null) one.targetHours = th;
      if (!Object.keys(one).length) return;
      out[k] = one;
    });
    return out;
  }

  /** 默认设置 + 把外部来的对象洗干净（读本地存储、从备份恢复都走这里） */
  function cleanSettings(o) {
    var s = {
      monthlySalary: null, targetHours: null, salaryMonths: {},
      ttView: 'grid', semesterStart: '', periods: null, periodLen: 40, periodGap: 10,
      dataVersion: DATA_VERSION
    };
    if (o && typeof o === 'object') {
      /* 月工资走和「按月设置」同一套校验：0 合法、超过 1 亿或不合法一律当没设置
         （以前这里只判了 > 0，一份被手改过的备份能把 ¥5e+298 这种数显示到页面上） */
      s.monthlySalary = cleanSalary(o.monthlySalary);
      s.targetHours = cleanTargetHours(o.targetHours);
      s.salaryMonths = cleanSalaryMonths(o.salaryMonths);
      if (o.ttView === 'list' || o.ttView === 'grid') s.ttView = o.ttView;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(o.semesterStart || ''))) s.semesterStart = o.semesterStart;
      if (Array.isArray(o.periods) && o.periods.length) {
        var rows = [];
        o.periods.forEach(function (r) {
          if (!Array.isArray(r)) return;
          var a = cleanTime(r[0]), b = cleanTime(r[1]);
          rows.push([a, b]);
        });
        if (rows.length) s.periods = rows;
      }
      if (parseInt(o.periodLen, 10) >= 10) s.periodLen = parseInt(o.periodLen, 10);
      if (parseInt(o.periodGap, 10) >= 0) s.periodGap = parseInt(o.periodGap, 10);
    }
    return s;
  }

  function loadSettings() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(SETTINGS_KEY);
      settings = cleanSettings(raw ? JSON.parse(raw) : null);
    } catch (e) {
      settings = cleanSettings(null);
    }
    /* 顺带把「数据结构版本」记号写回（老数据读进来就算完成迁移） */
    if (JSON.stringify(settings) !== raw) saveSettings();
  }

  function saveSettings() {
    if (!storageOK) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      storageOK = false;
    }
  }

  /* ---------- 查询 ---------- */

  /** 某天的全部段（不会创建） */
  function sessionsOf(day) {
    var list = db[day];
    return Array.isArray(list) ? list : [];
  }

  /** 某天正在进行中的那一段 -> { idx, s }，没有则 null */
  function openSessionOf(day) {
    var list = sessionsOf(day);
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].end === null) return { idx: i, s: list[i] };
    }
    return null;
  }

  /**
   * 某天累计工时（进行中的一段按当前时刻累加）
   * 注意：这是「打卡记录的简单相加」，只用于判断有没有记录这类内部逻辑。
   * 界面上显示的工时一律用 dayWorkMs()（打卡 ∪ 课表，重叠只算一次）。
   */
  function punchSumMs(day, now) {
    var sum = 0, list = sessionsOf(day);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      sum += (s.end === null ? now : s.end) - s.start;
    }
    return Math.max(0, sum);
  }

  /** 某个月合计 -> { ms, days } */
  function monthStats(y, m, now) {
    var days = new Date(y, m + 1, 0).getDate(), ms = 0, count = 0;
    for (var d = 1; d <= days; d++) {
      var key = y + '-' + pad2(m + 1) + '-' + pad2(d);
      var dayMs = dayWorkMs(key, now);      // 含课表时间，重叠已剔除
      if (dayMs <= 0) continue;
      ms += dayMs;
      count++;
    }
    return { ms: ms, days: count };
  }

  /**
   * 实际平均时薪 = 月工资 ÷ 当月累计实际工作小时数
   *
   * ⚠️ 这个数只用于统计：工作越多它越低，容易被误会成「工资在缩水」，
   * 所以界面上它排在最后，并且明确标了「仅统计」。
   * 页面主指标已经换成 salaryProgress()（工资进度）。
   *
   * 工时不足 1 分钟、工资没设置或为 0 时返回 null（界面显示「—」）
   */
  function hourlyRate(monthMs, salary) {
    var s = (salary === undefined) ? settings.monthlySalary : salary;
    if (s === null || s === undefined || !isFinite(s) || s <= 0) return null;
    if (monthMs < MIN) return null;
    return s / (monthMs / HOUR);
  }

  /* ============================================================
     七之前：工资进度（工资池）
     ------------------------------------------------------------
         工资进度 = 月工资 × 已工作工时 ÷ 本月目标工时
     上限就是月工资（超额工作不再涨，但会单独显示「额外工作」）。

     三条铁律（改这块之前先看一眼）：
     1. 计算只有 salaryProgress() 一个入口，页面里不许各算各的；
     2. 目标工时为 0 / 未设置时，宁可显示「去设置」，也绝不显示 NaN / Infinity；
     3. 每个月的 月工资 + 目标工时 各自独立（settings.salaryMonths），
        改 9 月绝不会动到 10 月，历史上的月份也永远保留当时的值。
     ============================================================ */

  /**
   * 某个月的工资计划 -> { key, salary, salarySet, targetHours, targetSet, targetMs, explicit* }
   * 这个月单独设置过就用这个月的，否则用默认值（settings.monthlySalary / targetHours）。
   */
  function salaryPlan(y, m) {
    var key = monthKey(y, m);
    var mo = (settings.salaryMonths && settings.salaryMonths[key]) || null;
    var salary = (mo && mo.salary !== undefined) ? mo.salary : settings.monthlySalary;
    var target = (mo && mo.targetHours !== undefined) ? mo.targetHours : settings.targetHours;

    var salarySet = (salary !== null && salary !== undefined && isFinite(salary) && salary >= 0);
    var targetSet = (target !== null && target !== undefined && isFinite(target) && target > 0);

    return {
      key: key,
      salary: salarySet ? Number(salary) : 0,
      salarySet: salarySet,
      targetHours: targetSet ? Number(target) : 0,
      targetSet: targetSet,
      targetMs: targetSet ? Math.round(Number(target) * HOUR) : 0,
      explicitSalary: !!(mo && mo.salary !== undefined),
      explicitTarget: !!(mo && mo.targetHours !== undefined),
    };
  }

  /**
   * 工资进度（纯函数 · 全 App 唯一入口）
   *
   *   工资进度 = min(月工资, 月工资 × 已工作工时 ÷ 目标工时)
   *
   * workedMs 按毫秒算，所以秒级精度天然就有（2小时17分钟24秒 就是 2.29 小时）。
   * -> { ok, reason, salary, targetHours, targetMs, workedMs, amount, percent,
   *      extraMs, remainMs, capped, perHour, perMin, perSec }
   */
  function salaryProgress(plan, workedMs) {
    var worked = Number(workedMs);
    if (!isFinite(worked) || worked < 0) worked = 0;

    var out = {
      ok: false, reason: '',
      salary: 0, targetHours: 0, targetMs: 0,
      workedMs: worked,
      amount: 0, percent: 0,
      extraMs: 0, remainMs: 0, capped: false,
      perHour: 0, perMin: 0, perSec: 0
    };

    if (!plan || !plan.salarySet) { out.reason = 'no-salary'; return out; }   // 连工资都没设
    out.salary = plan.salary;
    if (!plan.targetSet || !(plan.targetMs > 0)) { out.reason = 'no-target'; return out; }  // 目标工时没设 -> 提示去设置

    out.targetHours = plan.targetHours;
    out.targetMs = plan.targetMs;
    /* 目标工时 > 0 已经保证过，这里不会除以 0 */
    out.perHour = plan.salary / plan.targetHours;
    out.perMin = plan.salary / (plan.targetHours * 60);
    out.perSec = plan.salary / (plan.targetHours * 3600);

    out.capped = (worked >= plan.targetMs);
    out.extraMs = Math.max(0, worked - plan.targetMs);
    out.remainMs = Math.max(0, plan.targetMs - worked);

    var counted = Math.min(worked, plan.targetMs);        // 超出的部分不再计入进度
    out.amount = out.capped ? out.salary : (plan.salary * counted) / plan.targetMs;
    if (!isFinite(out.amount) || out.amount < 0) out.amount = 0;

    /* 百分比 = 工资进度 ÷ 月工资；月工资是 0 的时候进度就是 0（不做 0÷0） */
    out.percent = (plan.salary > 0) ? Math.min(100, (out.amount / plan.salary) * 100) : 0;

    out.ok = true;
    out.reason = 'ok';
    return out;
  }

  /** 当前月份的工资进度（页面直接用这个） */
  function salaryNow(now) {
    var d = new Date(now || Date.now());
    return salaryOfMonth(d.getFullYear(), d.getMonth(), now);
  }

  /** 指定月份的工资进度（「我的」页翻历史月份用） */
  function salaryOfMonth(y, m, now) {
    var at = now || Date.now();
    var plan = salaryPlan(y, m);
    var st = monthStats(y, m, at);
    var info = salaryProgress(plan, st.ms);
    info.plan = plan;
    info.workedMs = st.ms;
    info.days = st.days;
    info.year = y;
    info.month = m;
    return info;
  }

  /**
   * 「新增了多少工资进度」的统一算法：现在的进度 − 之前那一刻的进度
   *
   * 注意：不能用「把时间倒回某一天再重算一遍月累计」的做法 —— 一段已经点过下班的
   * 记录不再受 now 影响，倒回去重算会把它也算进去，差额永远是 0（下班文案就永远不会
   * 报出今天赚了多少）。所以这里用「当前累计 − 这段时间贡献的工时」来算，稳。
   *
   * 已经满额时新增就是 0 —— 绝不会出现「已经满了还说 +¥286」。
   */
  function addedOver(info, beforeWorkedMs) {
    if (!info || !info.ok) return 0;
    var before = salaryProgress(info.plan, Math.max(0, beforeWorkedMs));
    if (!before.ok) return 0;
    var diff = info.amount - before.amount;
    return (isFinite(diff) && diff > 0) ? diff : 0;
  }

  /** 今天这一天新增的工资进度（下班打卡文案用） */
  function todayAddedProgress(info, now) {
    var at = now || Date.now();
    return addedOver(info, info.workedMs - dayWorkMs(today, at));
  }

  /** 正在进行中的这一段新增的工资进度（整点提示用） */
  function sessionAddedProgress(info, sessionStart, now) {
    var at = now || Date.now();
    var inSession = Math.max(0, dayWorkMs(today, at) - dayWorkMs(today, sessionStart));
    return addedOver(info, info.workedMs - inSession);
  }

  function isCurrentMonth(y, m) {
    var d = new Date();
    return y === d.getFullYear() && m === d.getMonth();
  }

  /* ---------- 写 ---------- */

  function ensureDay(day) {
    if (!Array.isArray(db[day])) db[day] = [];
    return db[day];
  }

  function sortDay(day) {
    if (Array.isArray(db[day])) {
      db[day].sort(function (a, b) { return a.start - b.start; });
    }
  }

  /** 新增（idx < 0）或修改某一段；note 为空字符串表示删除备注。
      她亲手改过时间 -> 这一段就不再是「估的」（清掉 est 标记）。 */
  function saveSession(day, idx, startMs, endMs, note) {
    var list = ensureDay(day);
    var item = { start: startMs, end: endMs };
    var clean = cleanNote(note);
    if (clean) item.note = clean;

    if (idx >= 0 && idx < list.length) list[idx] = item;
    else list.push(item);
    sortDay(day);
    save();
  }

  function deleteSession(day, idx) {
    var list = sessionsOf(day);
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    if (!list.length) delete db[day];
    save();
  }

  /**
   * 跨天收尾：只允许「今天」存在进行中的一段。
   *
   * 昨天忘了点下班 -> 先按当天 23:59 收尾（否则会一直累计下去），
   * 但**必须打上 est 标记**：界面上会写成「没点下班 · 按 23:59 估的」，
   * 并在打开 App 时弹出来请她改成实际下班时间。
   * 以前这里是静默收尾 —— 07:50 到校、忘了点下班，那天就成 16 小时，
   * 月累计和实际时薪全被带偏，而界面上一点提示都没有。
   */
  function repairOpenSessions() {
    var tk = dayKey(), changed = false;
    Object.keys(db).forEach(function (key) {
      if (key === tk || !Array.isArray(db[key])) return;
      var dayEnd = endOfDay(key);
      db[key].forEach(function (s) {
        if (s.end === null) {
          s.end = Math.max(s.start, dayEnd);
          s.est = 1;                 // 估的，等她确认
          changed = true;
        }
      });
    });
    if (changed) save();
  }

  /** 最近几天里「估出来的收尾」那一段（用来弹窗请她修正），没有则 null */
  function guessSessionToFix() {
    var todayMs = startOfDay(dayKey());
    var keys = Object.keys(db).filter(function (k) { return k < dayKey(); }).sort().reverse();
    for (var i = 0; i < keys.length; i++) {
      var day = keys[i];
      if (todayMs - startOfDay(day) > 3 * 86400000) break;      // 只提醒最近 3 天，老账不烦她
      var list = db[day];
      for (var j = list.length - 1; j >= 0; j--) {
        if (list[j].est) return { day: day, idx: j, s: list[j] };
      }
    }
    return null;
  }

  /* ============================================================
     三、校验
     ============================================================ */

  /** 返回错误文案，null 表示可以保存 */
  function validate(day, startMs, endMs, selfIdx) {
    var now = Date.now(), tol = 90 * 1000;   // 容一点误差，刚好点到现在这一分钟也能存

    if (startMs < startOfDay(day) || startMs > endOfDay(day)) return '时间要落在这一天之内';
    if (startMs > now + tol) return '开始时间不能晚于当前时间';

    if (endMs === null) {
      if (day !== today) return '补录过去的日期时，需要填写结束时间';
      var open = openSessionOf(day);
      if (open && open.idx !== selfIdx) return '这一天已经有一段在进行中了，同一时间只能有一段';
      return null;
    }

    if (endMs > endOfDay(day)) return '时间要落在这一天之内';
    if (endMs > now + tol) return '结束时间不能晚于当前时间';
    if (endMs <= startMs) return '结束时间要晚于开始时间';
    return null;
  }

  /** 与已有区间重叠 -> 提醒文案（不阻止保存），没有则 null */
  function overlapWarning(day, startMs, endMs, selfIdx) {
    var now = Date.now();
    var e = endMs === null ? now : endMs;
    var list = sessionsOf(day);

    for (var i = 0; i < list.length; i++) {
      if (i === selfIdx) continue;
      var s = list[i];
      var se = s.end === null ? now : s.end;
      if (startMs < se && s.start < e) {
        return '与已有的 ' + fmtHM(s.start) + '–' +
               (s.end === null ? '进行中' : fmtHM(se)) +
               ' 有重叠，合计时重叠的那部分只算一次';
      }
    }
    return null;
  }

  /** 新增时的默认时间：尽量贴合「忘了打卡」的真实情况 */
  function defaultRange(day) {
    var now = Date.now();
    var list = sessionsOf(day);
    var last = list.length ? list[list.length - 1] : null;
    var open = openSessionOf(day);

    // 今天、而且当前没有进行中的一段 -> 默认「从刚才干到现在，还没下班」
    if (day === today && !open) {
      var s0 = (last && last.end !== null) ? last.end : now - 3 * HOUR;
      return clampRange(day, s0, null);
    }
    if (last && last.end !== null) return clampRange(day, last.end, last.end + 3 * HOUR);
    return clampRange(day, hmToMs(day, '09:00'), hmToMs(day, '12:00'));
  }

  function clampRange(day, start, end) {
    var dStart = startOfDay(day);
    var upper = Math.min(endOfDay(day), Date.now());
    if (start > upper - MIN) start = Math.max(dStart, upper - MIN);
    if (start < dStart) start = dStart;
    if (end !== null) {
      if (end > upper) end = upper;
      if (end <= start) end = Math.min(upper, start + MIN);
    }
    return { start: start, end: end };
  }

  /* ============================================================
     三、课表数据层（与工时记录完全独立）
     courses = [ { id, courseName, teacher, location, weekday 1-7,
                   startTime "HH:MM", endTime "HH:MM", weeks, remark } ]
     空字符串表示「没有填」，界面上显示为「未设置」，绝不编造内容
     ============================================================ */

  var courses = [];
  var WD_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  function wdName(wd) { return WD_NAMES[wd] || ''; }

  /** 今天对应的 1-7（周一=1 … 周日=7） */
  function todayWeekday() {
    var d = new Date().getDay();
    return d === 0 ? 7 : d;
  }

  function cstr(v, max) {
    return (typeof v === 'string') ? v.trim().slice(0, max) : '';
  }

  /** 把输入规整成 HH:MM；不合法返回空字符串 */
  function cleanTime(v) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim());
    if (!m) return '';
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return '';
    return pad2(h) + ':' + pad2(mi);
  }

  /** "08:00" 加 100 分钟 -> "09:40" */
  function addMinutes(hm, mins) {
    if (!hm) return '';
    var p = hm.split(':');
    var total = (+p[0]) * 60 + (+p[1]) + mins;
    total = Math.max(0, Math.min(23 * 60 + 59, total));
    return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
  }

  var courseSeq = 0;

  function newCourseId() {
    courseSeq++;
    return 'c' + Date.now().toString(36) + '-' + courseSeq;
  }

  /** 手动填的时间和作息表里的某一节差多少分钟内算「同一节」 */
  var PERIOD_MATCH_TOLERANCE = 15;

  /**
   * 按上课时间认这是「第几节」—— 依据就是作息时间表。
   * 认不出（没设作息表、或时间和每一节都对不上）返回 0。
   * 优先级：开始+结束完全一样 > 开始时间一样 > 开始时间最接近的（15 分钟内）
   */
  function matchPeriodByTime(start, end) {
    var list = periods();
    if (!list || !start) return 0;
    var s = hmToMin(start);
    if (s < 0) return 0;
    var best = 0, bestDiff = PERIOD_MATCH_TOLERANCE + 1;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || !row[0]) continue;
      var ps = hmToMin(row[0]);
      if (ps < 0) continue;
      var d = Math.abs(ps - s);
      if (d > PERIOD_MATCH_TOLERANCE) continue;
      if (d === 0 && end && row[1] && hmToMin(row[1]) === hmToMin(end)) return i + 1;
      if (d < bestDiff) { bestDiff = d; best = i + 1; }
    }
    return best;
  }

  function cleanCourse(src, id) {
    var out = {
      id: id || cstr(src && src.id, 40) || newCourseId(),
      courseName: cstr(src && src.courseName, 40),
      teacher: cstr(src && src.teacher, 20),
      location: cstr(src && src.location, 30),
      weekday: (function (w) { return (w >= 1 && w <= 7) ? w : 0; })(parseInt(src && src.weekday, 10)),
      startTime: cleanTime(src && src.startTime),
      endTime: cleanTime(src && src.endTime),
      /* 周次：认得出就统一写成标准写法（13到23 -> 13-23周），认不出就原样留着，
         界面会提醒她「这句看不懂」——绝不再默默当成「每周都上」（那是会多算工时的） */
      weeks: (function (raw) {
        var t = cstr(raw, 20);
        var w = parseWeeks(t, true);
        return w ? weeksToText(w) : t;
      })(src && src.weeks),
      remark: cstr(src && src.remark, 40),
      date: cleanDate(src && src.date),                                    // 有日期 = 只在那一天
      period: (function (n) { return (n >= 1 && n <= 20) ? n : 0; })(parseInt(src && src.period, 10)),
      weekNums: null,                                                      // 下面按 weeks 算出来
    };
    /* 周次的两份表示：
       · weeks    —— 只用来显示（「1-16周」「单周」「13-23周」）
       · weekNums —— 只用来判断（'all' | 'odd' | 'even' | [4,8] | null）
       逻辑一律看 weekNums，绝不再每次去解析中文字符串。
       老数据（只有 weeks）在这里自动迁移：认得出就补上 weekNums，认不出就留 null，
       界面会提醒「这句看不懂」，而不是默默当成每周都上。
       （万一只有 weekNums 没有 weeks，就把显示文本反向补出来。） */
    var spec = (src && src.weekNums !== undefined && src.weekNums !== null)
      ? src.weekNums
      : weeksToSpec(out.weeks);
    if (spec !== 'all' && spec !== 'odd' && spec !== 'even') {
      if (Array.isArray(spec)) {
        spec = spec.map(function (n) { return parseInt(n, 10); })
          .filter(function (n) { return n >= 1 && n <= 30; })
          .sort(function (a, b) { return a - b; });
        var uniq = [];
        spec.forEach(function (n) { if (uniq.indexOf(n) < 0) uniq.push(n); });
        spec = uniq.length ? uniq : null;
      } else {
        spec = null;
      }
    }
    /* 两份表示打架时（旧备份、被手工改过的数据），以「她看得见的那行文本」为准：
       否则会出现「课表上写着 5-8 周、实际却按 1-16 周在算」这种自相矛盾。
       文本认不出（null）时不动结构 —— 宁可保留，也别把有效的周次抹掉。 */
    if (out.weeks) {
      var fromText = weeksToSpec(out.weeks);
      if (fromText !== null && !sameWeeksSpec(spec, fromText)) spec = fromText;
    }
    out.weekNums = spec;
    if (!out.weeks && spec) out.weeks = weeksToTextFromSpec(spec);
    /* 有「第几节」但没填时间时，用作息时间表补上（改作息表能一次性全部更新） */
    if (out.period && (!out.startTime || !out.endTime)) {
      var pt = periodTime(out.period);
      if (pt) { out.startTime = pt.start; out.endTime = pt.end; }
    }
    /* 反过来：有时间就按作息表自动认「第几节」——
       手动加的课也能落到课表对应的节次那一行，不会多出来一行；
       时间是明确填的、却和作息表每一节都对不上（她自己改过），就以她填的时间为准，
       不显示一个错的节次。没填时间时保留原来的节次（比如导入时还没设作息表）。 */
    if (out.startTime) {
      out.period = matchPeriodByTime(out.startTime, out.endTime);
    }
    return out;
  }

  function sanitizeCourses(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      out.push(cleanCourse(item));
    });
    return out;
  }

  function loadCourses() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(COURSES_KEY);
      courses = raw ? sanitizeCourses(JSON.parse(raw)) : [];
    } catch (e) {
      courses = [];
    }
    sortCourses();
    /* 迁移并写回：老数据只有「周次」文本（比如 "4周"），这里补上结构化字段 weekNums 存回去。
       只补字段，不动任何显示内容，也不动工时记录 —— 万一写失败也不影响使用（内存里已经算好了）。 */
    if (courses.length) {
      var cleaned = JSON.stringify(courses);
      if (cleaned !== raw) saveCourses();
    }
  }

  function saveCourses() {
    if (!storageOK) return;
    try {
      window.localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
    } catch (e) {
      storageOK = false;
    }
  }

  /** 排序：按星期，再按开始时间；没填时间的排最后 */
  function sortCourses() {
    courses.sort(function (a, b) {
      var wa = a.weekday || 99, wb = b.weekday || 99;
      if (wa !== wb) return wa - wb;
      var ta = a.startTime || '99:99', tb = b.startTime || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (a.courseName || '') < (b.courseName || '') ? -1 : 1;
    });
  }

  function findCourse(id) {
    for (var i = 0; i < courses.length; i++) if (courses[i].id === id) return courses[i];
    return null;
  }

  function indexOfCourse(id) {
    for (var i = 0; i < courses.length; i++) if (courses[i].id === id) return i;
    return -1;
  }

  /**
   * 字段问题自查（对应「识别失败不要编内容，要提示用户检查」的要求）
   * hard：明确是错的，不让导入
   * soft：可以留空，界面显示「未设置」，允许导入后再补
   */
  function courseIssues(c) {
    var hard = [], soft = [];
    if (!c.courseName) hard.push('课程名称为空');
    if (c.startTime && c.endTime && c.endTime <= c.startTime) hard.push('结束时间早于开始时间');
    /* 「学校导出的那种」：有日期 + 有第几节，教师/地点/周次本来就没有，别报成缺信息 */
    var schoolRow = !!(c.date && c.period);
    if (!c.date && !(c.weekday >= 1 && c.weekday <= 7)) soft.push('星期');
    if (!c.period && (!c.startTime || !c.endTime)) soft.push('上课时间');
    if (!schoolRow) {
      if (!c.teacher) soft.push('教师');
      if (!c.location) soft.push('地点');
      if (!c.date && !c.weeks) soft.push('周次');
    }
    /* 填了周次但认不出：界面必须提醒，否则会被当成「每周都上」，工时就算多了 */
    if (weeksUnclear(c.weeks)) soft.push('周次看不懂（现在按每周都上处理）');
    return { hard: hard, soft: soft };
  }

  /** 「地点 · 教师 · 周次」，没填的不占位 */
  function courseMetaText(c) {
    var parts = [];
    if (c.location) parts.push(c.location);
    if (c.teacher) parts.push(c.teacher);
    if (c.weeks) parts.push(c.weeks);
    return parts.join(' · ');
  }

  /** 「第1节 08:00–08:40」/ 「08:00–08:40」/ 「第1节」（还没设作息表） */
  function courseTimeText(c) {
    var p = c.period ? '第' + c.period + '节' : '';
    if (c.startTime && c.endTime) {
      var t = c.startTime + '–' + c.endTime;
      return p ? p + ' ' + t : t;
    }
    return p || '--:--';
  }

  /* ============================================================
     四、DOM 引用
     ============================================================ */

  var els = {};
  var CHEVRON = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';

  function cacheEls() {
    var ids = ['screens', 'dateText', 'liveClock', 'heroTotal', 'statusChip', 'statusText',
      'statusSub', 'btnIn', 'btnOut', 'logList', 'logCount',
      'logEmpty', 'todayAdd', 'yesterdayAdd', 'toast', 'calPrev', 'calNext', 'calToday', 'calTitle',      'calGrid', 'calMonthSum', 'calMonthDays', 'daySheet', 'dayTitle', 'daySum',
      'dayList', 'dayEmpty', 'dayAdd', 'dayClose', 'editSheet', 'editTitle', 'editSub',
      'editStart', 'editEnd', 'editHint', 'editMsg', 'editDelete', 'editSave', 'editClose',
      'editNote',
      'mePrev', 'meNext', 'meToday', 'meMonth', 'hoursLabel', 'salaryEdit', 'salaryValue',
      'salaryHint', 'statHours', 'statDays', 'statRate', 'rateUnit', 'rateHint',
      'salarySheet', 'salarySub', 'salaryInput', 'salaryMsg', 'salaryPreview',
      'salarySave', 'salaryClose',
      /* 工资进度（工资池） */
      'payTitle', 'payAmount', 'payNow', 'payOf', 'payBarFill', 'payPercent', 'payMore', 'payHint',
      'hoursSecHint', 'statTarget', 'targetHint', 'statGoalRate', 'goalRateUnit', 'goalRateHint',
      'poolCard', 'poolMonth', 'poolNow', 'poolGoal', 'poolBarFill', 'poolPercent', 'poolSub',
      'poolNote', 'poolSetup',
      'targetInput', 'salaryMonthNote', 'salaryFillLast', 'salaryDefault',
      'ttImport', 'ttSummary', 'ttSummaryText', 'ttSummarySub', 'ttList', 'ttEmpty', 'ttAddOne',
      'ttWeekLoad',
      'ttSwitch', 'ttGrid', 'ttGridWrap', 'ttNav', 'ttNavText', 'ttPrev', 'ttNext', 'ttThisWeek',
      'pasteSheet', 'pasteInput', 'pasteMsg', 'pasteParse', 'pasteClose', 'importPaste',
      'ttWeek', 'ttWeekText', 'ttWeekBtn', 'weekSheet', 'weekInput', 'weekMsg', 'weekSave',
      'weekClear', 'weekClose', 'tipLine', 'noteQuick',
      'ttPeriod', 'ttPeriodText', 'ttPeriodBtn', 'periodSheet', 'periodList', 'periodMsg',
      'periodSave', 'periodReset', 'periodClose', 'pbStart', 'pbGap', 'pbCount', 'pbLen', 'pbFill',
      'importScreen', 'importBack', 'importCount', 'importList', 'importEmpty', 'importAdd',
      'importBody', 'mergeBox', 'mergeTitle', 'mergeSub', 'mergeKeep', 'mergeReplace', 'mergeCancel',
      'importCancel', 'importConfirm',
      'courseSheet', 'courseTitle', 'courseSub', 'courseName', 'courseStart', 'courseEnd',
      'courseWeekdays', 'courseTeacher', 'courseLocation', 'courseWeeks', 'courseRemark',
      'coursePeriodField', 'coursePeriods', 'coursePeriodHint', 'coursePeriodLbl', 'courseWeeksHint',
      'courseMsg', 'courseActions', 'courseDelete', 'courseSave', 'courseSaveNext', 'courseClose',
      'backupBtn', 'backupSheet', 'backupSub', 'backupText', 'backupMake', 'backupFile',
      'backupRestore', 'backupMsg', 'backupStat', 'backupClose', 'backupDone', 'backupReset',
      'heroMsg'];
    ids.forEach(function (id) { els[id] = document.getElementById(id); });
    els.editActions = els.editDelete.parentNode;
  }

  /* ============================================================
     五、轻提示
     ============================================================ */

  var toastTimer = null;

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 2400);
  }

  function hideToast() {
    els.toast.classList.remove('is-show');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }

  /* ============================================================
     六、打卡（第一阶段核心）
     ============================================================ */

  function punchIn() {
    if (openSessionOf(today)) {
      toast('你已经在工作中了，请先点「下班打卡」');
      return false;
    }
    var now = Date.now();
    ensureDay(today).push({ start: now, end: null });
    sortDay(today);
    save();
    renderAll();
    // 首页那句话换成这次的打卡反馈
    setHeroMessage(pickPunchMessage('in', messageContext(now)), true);
    return true;
  }

  function punchOut() {
    var open = openSessionOf(today);
    if (!open) {
      toast('还没有上班记录，请先点「上班打卡」');
      return false;
    }
    var now = Date.now();
    open.s.end = now;
    save();
    renderAll();
    setHeroMessage(pickPunchMessage('out', messageContext(now)), true);
    return true;
  }

  /* ============================================================
     七、渲染
     ============================================================ */

  var state = {
    view: 'today',
    monthY: 0, monthM: 0,   // 当前查看的月份（日历与「我的」共用）
    selectedDay: null,      // 日历里选中的那一天
    edit: null,             // { day, idx }，idx < 0 表示新增
    pending: [],            // 导入课表时待确认的课程
    courseTarget: null,     // 课程弹层当前在改哪一门
    courseWd: 0,            // 课程弹层里选中的星期
    heroMsg: '',            // 首页常驻的那句鼓励语
    ttView: 'grid',         // 课表显示方式：grid（周视图）/ list（列表）
    ttWeekOffset: 0,        // 课表周视图在看哪一周：0 本周，-1 上周，1 下周
    courseSel: [],          // 课程表单里选中的节次（可以多选）
    mergeIncoming: null,    // 导入时等她选「合并 / 替换」的那批课程
    mergePlan: null,        // 合并预览结果 { added, updated, same }
    resetArmed: false,      // 「清空数据」是否已经点过第一次（要连点两次）
  };

  /* ---------- 一条记录 ---------- */

  function rowHTML(s, i, now) {
    var live = (s.end === null);
    var endAt = live ? now : s.end;
    var note = cleanNote(s.note);
    var est = (!live && s.est);

    return '<li class="log-row' + (live ? ' is-live' : '') + (est ? ' is-est' : '') +
             '" data-i="' + i + '"' +
             ' role="button" tabindex="0" aria-label="' + fmtHM(s.start) + ' 到 ' +
             (live ? '现在' : fmtHM(endAt)) + '，' + fmtDur(endAt - s.start) +
             (est ? '，这一段没点下班，时间是按当天 23:59 估的，请点击改成实际下班时间' : '') +
             (note ? '，备注：' + note : '') + '，点击可修改">' +
        '<span class="log-dot" aria-hidden="true"></span>' +
        '<span class="log-main">' +
          '<span class="log-line">' +
            '<span class="log-range">' + fmtHM(s.start) + '<span class="log-dash">–</span>' +
              (live ? '<span class="log-now">进行中</span>' : fmtHM(endAt)) + '</span>' +
            '<span class="log-dur' + (live ? ' js-live-dur' : '') + '">' +
              fmtDur(endAt - s.start) + '</span>' +
          '</span>' +
          (est
            ? '<span class="log-note log-est">没点下班 · 按 23:59 估的，点这里改成实际下班时间</span>'
            : (note ? '<span class="log-note">' + escapeHTML(note) + '</span>' : '')) +
        '</span>' +
        '<span class="log-chevron" aria-hidden="true">' + CHEVRON + '</span>' +
      '</li>';
  }

  /* ---------- 今日页 ---------- */

  /** 某一天里「课表带来的时段」那一行。
      plan=true 是「计划视图」（日历明细用：那天排了什么就列什么，哪怕还没到点），
      plan=false 是「工时视图」（今日页用：还没开始的课先不列）。 */
  function classRowHTML(cs, covered, future) {
    var c = cs.course;
    var stateTag = future ? '<span class="log-tag is-future">还没到</span>'
      : (cs.live ? '<span class="log-now">上课中</span>' : '');
    return '<li class="log-row is-class' + (cs.live ? ' is-live' : '') + (future ? ' is-future' : '') +
             '" data-course="' + c.id + '"' +
             ' role="button" tabindex="0" aria-label="课程 ' + escapeHTML(c.courseName || '') +
             ' ' + fmtHM(cs.start) + ' 到 ' + (cs.live ? '现在' : fmtHM(cs.end)) + '，点击可修改这门课">' +
        '<span class="log-dot is-class" aria-hidden="true"></span>' +
        '<span class="log-main">' +
          '<span class="log-line">' +
            '<span class="log-range">' + fmtHM(cs.start) + '<span class="log-dash">–</span>' +
              fmtHM(cs.end) + stateTag +
              '<span class="log-tag">课程</span></span>' +
            '<span class="log-dur">' + fmtDur(cs.end - cs.start) + '</span>' +
          '</span>' +
          '<span class="log-note">' + escapeHTML(c.courseName || '未命名课程') +
            (c.location ? ' · ' + escapeHTML(c.location) : '') +
            (covered ? ' <span class="log-covered">（已含在打卡时段里，不重复计）</span>' : '') +
            (future ? ' <span class="log-covered">（这天还没到，先按课表列出，不计入工时）</span>' : '') +
          '</span>' +
        '</span>' +
        '<span class="log-chevron" aria-hidden="true"></span>' +
      '</li>';
  }

  /**
   * 把「打卡段 + 课程段」合并成按时间排好的一列。
   * plan=true  -> 课程用 plannedClasses()（日历明细，和周视图同一口径）
   * plan=false -> 课程用 classSpans()（今日页，只列已经该算工时的）
   */
  function dayRowList(day, now, plan) {
    var list = sessionsOf(day);
    var punchMerged = mergeSpans(punchSpans(day, now));
    var classes = plan ? plannedClasses(day) : classSpans(day, now);
    var isFutureDay = (day > today);
    var rows = [];
    list.forEach(function (s, i) {
      rows.push({ t: 'p', i: i, start: s.start, s: s });
    });
    classes.forEach(function (cs) {
      var covered = punchMerged.some(function (sp) { return cs.start >= sp.start && cs.end <= sp.end; });
      rows.push({ t: 'c', start: cs.start, cs: cs, covered: covered, future: isFutureDay });
    });
    rows.sort(function (a, b) { return a.start - b.start; });
    return { rows: rows, punchCount: list.length, classCount: classes.length, future: isFutureDay };
  }

  function renderToday(now) {
    var list = sessionsOf(today);
    var open = openSessionOf(today);

    els.dateText.textContent = fmtDateLine(new Date());
    els.heroTotal.innerHTML = durHTML(dayWorkMs(today, now));

    var chip = els.statusChip;
    chip.classList.remove('is-working', 'is-idle', 'is-empty');
    if (open) {
      chip.classList.add('is-working');
      els.statusText.textContent = '当前工作中';
      els.statusSub.textContent = '本次已工作 ' + fmtDur(now - open.s.start);
    } else {
      var last = list.length ? list[list.length - 1] : null;
      if (last) {
        chip.classList.add('is-idle');
        els.statusText.textContent = '当前未在工作';
        els.statusSub.textContent = '上次下班 ' + fmtHM(last.end);
      } else {
        chip.classList.add('is-empty');
        els.statusText.textContent = '今天还没有记录';
        els.statusSub.textContent = '点「上班打卡」开始';
      }
    }

    var working = !!open;
    els.btnIn.classList.toggle('is-primary', !working);
    els.btnIn.classList.toggle('is-muted', working);
    els.btnOut.classList.toggle('is-primary', working);
    els.btnOut.classList.toggle('is-muted', !working);
    els.btnIn.setAttribute('aria-disabled', working ? 'true' : 'false');
    els.btnOut.setAttribute('aria-disabled', working ? 'false' : 'true');

    var info = dayRowList(today, now);
    els.logList.innerHTML = info.rows.map(function (r) {
      return r.t === 'p' ? rowHTML(r.s, r.i, now) : classRowHTML(r.cs, r.covered);
    }).join('');

    var cnt = info.punchCount + ' 段';
    if (info.classCount) cnt += ' + ' + info.classCount + ' 门课';
    els.logCount.textContent = cnt;
    els.logEmpty.hidden = info.rows.length > 0;

    /* 课表替今天补的时间，明确说一句，免得用户看不懂工时怎么来的。
       没有要说的就不占那一行（以前这里常驻一句「点任意一条记录…」的废话）。 */
    var extra = classExtraMs(today, now);
    if (els.tipLine) {
      els.tipLine.textContent = extra > 0
        ? '今日工时＝打卡时段＋课程时段，重叠只算一次。课表今天帮你补了 ' + fmtDur(extra) + '。'
        : '';
      els.tipLine.hidden = extra <= 0;
    }

    /* 昨天完全没记录 -> 给一个「补昨天」的捷径（不然要进日历翻到昨天） */
    if (els.yesterdayAdd) {
      var yKey = dateKeyPlus(today, -1);
      els.yesterdayAdd.hidden = sessionsOf(yKey).length > 0;
    }

    if (state.heroMsg) els.heroMsg.textContent = state.heroMsg;

    renderPool(now);
  }

  /* ---------- 日历 ---------- */

  function renderCalendar() {
    var now = Date.now();
    var y = state.monthY, m = state.monthM;
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;      // 周一为一周第一天
    var days = new Date(y, m + 1, 0).getDate();
    var tk = dayKey();
    var html = '', monthMs = 0, activeDays = 0;

    els.calTitle.textContent = y + '年' + (m + 1) + '月';

    for (var b = 0; b < lead; b++) html += '<span class="cal-blank"></span>';

    for (var d = 1; d <= days; d++) {
      var key = y + '-' + pad2(m + 1) + '-' + pad2(d);
      var ms = dayWorkMs(key, now);          // 含课表时间；只上课没打卡的日子也算有数据
      var has = ms > 0;
      if (has) { monthMs += ms; activeDays++; }

      var cls = 'cal-day' +
        (has ? ' has-data' : '') +
        (key === tk ? ' is-today' : '') +
        (key === state.selectedDay ? ' is-selected' : '');

      html += '<button type="button" class="' + cls + '" data-day="' + key + '"' +
                ' aria-label="' + (m + 1) + '月' + d + '日' +
                (has ? '，共 ' + fmtDur(ms) : '，没有记录') + '">' +
                '<span class="cal-dnum">' + d + '</span>' +
                (has ? '<span class="cal-dur">' + fmtDurCompact(ms) + '</span>' : '') +
              '</button>';
    }

    var tail = (7 - ((lead + days) % 7)) % 7;
    for (var t = 0; t < tail; t++) html += '<span class="cal-blank"></span>';

    els.calGrid.innerHTML = html;
    els.calMonthSum.textContent = fmtDur(monthMs);
    els.calMonthDays.textContent = activeDays ? '有记录 ' + activeDays + ' 天' : '本月还没有记录';
    els.calToday.hidden = isCurrentMonth(y, m);
  }

  /** 日历页每秒只更新「今天」那一格与月合计，避免整个宫格重绘 */
  function refreshCalendarLive(now) {
    var cell = els.calGrid.querySelector('[data-day="' + today + '"]');
    if (!cell) return;                     // 当前显示的月份里没有今天
    var durEl = cell.querySelector('.cal-dur');
    if (durEl) durEl.textContent = fmtDurCompact(dayWorkMs(today, now));
    var st = monthStats(state.monthY, state.monthM, now);
    els.calMonthSum.textContent = fmtDur(st.ms);
  }

  /* ---------- 我的：工资进度（工资池）+ 统计 ---------- */

  /* 每秒都会调一次下面这些渲染函数，所以每次写 DOM 之前都先比一下：
     内容没变就一个字节都不写 —— 页面不会因为每秒刷新而整块重排。 */
  function setText(el, text) {
    if (!el) return;
    var t = (text === null || text === undefined) ? '' : String(text);
    if (el.textContent !== t) el.textContent = t;
  }

  function setHTML(el, html) {
    if (!el) return;
    var h = (html === null || html === undefined) ? '' : String(html);
    if (el.innerHTML !== h) el.innerHTML = h;
  }

  /** 进度条宽度：0~100，非法值一律当 0（不会出现 NaN%） */
  function setWidth(el, pct) {
    if (!el) return;
    var v = Number(pct);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 100) v = 100;
    var s = v.toFixed(2) + '%';
    if (el.style.width !== s) el.style.width = s;
  }

  function setEmpty(el, isEmpty) {
    if (!el) return;
    el.classList.toggle('is-empty', !!isEmpty);
  }

  /** 首页的「工资池」卡片。
      这一屏已经有今日工时和两个打卡按钮，所以文案能省就省：
      完整的那句免责声明只在「我的」页出现一次，这里用「不是实发工资」六个字。 */
  function renderPool(now) {
    if (!els.poolCard) return;
    var at = now || Date.now();
    var info = salaryNow(at);
    var d = new Date(at);
    setText(els.poolMonth, ' · ' + (d.getMonth() + 1) + '月');

    /* 没设置好：只提示去设置。绝不显示 ¥0 / NaN 这种假数据 */
    if (!info.ok) {
      setText(els.poolNow, '—');
      setText(els.poolGoal, '');
      setWidth(els.poolBarFill, 0);
      setText(els.poolPercent, '—');
      setText(els.poolSub, info.reason === 'no-salary' ? '没设月工资和目标工时' : '没设本月目标工时');
      setText(els.poolNote, '设置之后，这里会随工作时间变满。');
      setEmpty(els.poolCard, true);
      return;
    }

    setEmpty(els.poolCard, false);
    setText(els.poolNow, fmtMoney2(info.amount));
    setText(els.poolGoal, ' / ' + fmtMoney2(info.salary));
    setWidth(els.poolBarFill, info.percent);
    setText(els.poolPercent, fmtPercent(info.percent));

    if (info.capped) {
      setText(els.poolSub, '已满 · 额外工作 ' + fmtDurPlain(info.extraMs));
      setText(els.poolNote, '多出来的不再计入进度 · 不是实发工资');
    } else {
      setText(els.poolSub, '本月 ' + fmtDurPlain(info.workedMs) + ' / 目标 ' + info.targetHours + ' 小时');
      setText(els.poolNote, '还差 ' + fmtDurPlain(info.remainMs) + ' 到满 · 不是实发工资');
    }
  }

  function renderMe(now) {
    var at = now || Date.now();
    var y = state.monthY, m = state.monthM;
    var info = salaryOfMonth(y, m, at);
    var plan = info.plan;
    var ml = isCurrentMonth(y, m) ? '本月' : (m + 1) + '月';

    setText(els.meMonth, y + '年' + (m + 1) + '月');
    els.meToday.hidden = isCurrentMonth(y, m);

    /* ---- 第一优先：工资进度 ---- */
    setText(els.payTitle, ml + '工资进度');
    if (info.ok) {
      var now2 = fmtMoney2(info.amount), goal2 = fmtMoney2(info.salary);
      setText(els.payNow, now2);
      setText(els.payOf, ' / ' + goal2);
      /* 金额变长时缩字号：类名要加在 .pay-value 上（CSS 写的是 .pay-value.is-long .pay-now） */
      els.payAmount.classList.toggle('is-long', now2.length + goal2.length > 20);
      setWidth(els.payBarFill, info.percent);
      setText(els.payPercent, fmtPercent(info.percent));
      setText(els.payMore, info.capped
        ? '额外工作 ' + fmtDurPlain(info.extraMs) + '（进度已满）'
        : '还差 ' + fmtDurPlain(info.remainMs) + ' 到满');
      setText(els.payHint, '仅用于进度展示，不代表实际应发工资。');
    } else {
      setText(els.payNow, '—');
      setText(els.payOf, '');
      setWidth(els.payBarFill, 0);
      setText(els.payPercent, '—');
      setText(els.payMore, '');
      setText(els.payHint, plan.salarySet
        ? '还差一个「本月目标工时」（点右上角「设置」）'
        : '设置月工资和目标工时后显示（点右上角「设置」）');
    }

    /* ---- 第二优先：累计工时 ---- */
    setText(els.hoursLabel, ml + '累计工时');
    setText(els.statHours, fmtDur(info.workedMs));
    /* 秒数不是整天的时候才多写一行（不然「＝ xx小时xx分钟00秒」纯属噪音） */
    setText(els.hoursSecHint, info.workedMs % MIN ? '＝ ' + fmtDurSec(info.workedMs) : '');
    setText(els.statDays, info.days + ' 天');

    /* ---- 第三优先：目标工时（「还差多少」上面那张大卡片已经写了，这里不重复） ---- */
    if (plan.targetSet) {
      setText(els.statTarget, plan.targetHours + ' 小时');
      setEmpty(els.statTarget, false);
      setText(els.targetHint, info.capped ? '已超出 ' + fmtDurPlain(info.extraMs) : '');
    } else {
      setText(els.statTarget, '未设置');
      setEmpty(els.statTarget, true);
      setText(els.targetHint, '点右上角「设置」填一个');
    }

    /* ---- 第四优先：目标时薪（= 月工资 ÷ 目标工时） ---- */
    if (info.ok) {
      var goalTxt = fmtRate(info.perHour);
      setText(els.statGoalRate, goalTxt);
      els.goalRateUnit.hidden = false;
      els.statGoalRate.classList.remove('is-empty');
      els.statGoalRate.classList.toggle('is-long', goalTxt.length > 7);
      setText(els.goalRateHint, '每分钟 ' + fmtRate6(info.perMin) + ' · 每秒 ' + fmtRate7(info.perSec));
    } else {
      setText(els.statGoalRate, '—');
      els.goalRateUnit.hidden = true;
      els.statGoalRate.classList.add('is-empty');
      els.statGoalRate.classList.remove('is-long');
      setText(els.goalRateHint, plan.salarySet ? '先设置本月目标工时' : '先设置月工资');
    }

    /* ---- 计划本身：月工资（「设置」按钮就在上面的工资进度卡片右上角） ---- */
    if (!plan.salarySet) {
      setText(els.salaryValue, '未设置');
      setEmpty(els.salaryValue, true);
      setText(els.salaryHint, '');
      setText(els.salaryEdit, '设置');
    } else {
      setText(els.salaryValue, fmtMoney(plan.salary));
      setEmpty(els.salaryValue, false);
      /* 算式（8000 ÷ 160）在上面「目标时薪」那张卡片上已经体现出来了，这里不再重复 */
      setText(els.salaryHint, plan.targetSet ? '' : '还差一个「本月目标工时」');
      setText(els.salaryEdit, '修改');
    }

    /* ---- 最后：实际平均时薪（只用于统计，长期看它只会越来越低，别误会） ---- */
    var rate = hourlyRate(info.workedMs, plan.salarySet ? plan.salary : null);
    if (rate === null) {
      setText(els.statRate, '—');
      els.statRate.classList.add('is-empty');
      els.statRate.classList.remove('is-long');
      els.rateUnit.hidden = true;
      setText(els.rateHint, plan.salarySet
        ? (plan.salary <= 0 ? '月工资是 0，算不出时薪' : (info.workedMs < MIN ? ml + '还没有工时记录' : '/ 小时'))
        : '先设置月工资');
    } else {
      var rateTxt = fmtRate(rate);
      setText(els.statRate, rateTxt);
      els.statRate.classList.remove('is-empty');
      els.statRate.classList.toggle('is-long', rateTxt.length > 7);
      els.rateUnit.hidden = false;
      // 用和全站一致的「X小时XX分钟」写法，避免小数位造成「算式对不上」的错觉
      // （「仅统计」这四个字已经写在标签上，这里不再重复一遍）
      setText(els.rateHint, fmtMoney(plan.salary) + ' ÷ ' + fmtDur(info.workedMs));
    }
  }

  /* ---------- 某一天的弹层 ---------- */

  function renderDaySheet(now) {
    var day = state.selectedDay;
    if (!day) return;

    /* 日历明细用「计划视图」——和周视图同一口径：那天排了什么就列什么。
       （工时仍然按「已经发生的」算，所以下面会说明这天还没到） */
    var info = dayRowList(day, now, true);
    var list = sessionsOf(day);
    els.dayTitle.textContent = fmtDayKey(day) + (day === today ? ' · 今天' : '');

    if (!info.rows.length) {
      els.daySum.textContent = '这天没有课，也没有打卡记录';
    } else {
      var sum = '共 ' + list.length + ' 段';
      if (info.classCount) sum += ' + ' + info.classCount + ' 门课';
      if (info.future) {
        /* 未来的日子：课表列出来（这是计划），但工时是 0 —— 说清楚，别让人以为算错了 */
        els.daySum.textContent = sum + ' · 这天还没到，暂不计入工时';
      } else {
        els.daySum.textContent = sum + ' · ' + fmtDur(dayWorkMs(day, now));
      }
    }

    els.dayList.innerHTML = info.rows.map(function (r) {
      return r.t === 'p' ? rowHTML(r.s, r.i, now) : classRowHTML(r.cs, r.covered, r.future);
    }).join('');
    els.dayEmpty.hidden = info.rows.length > 0;
  }

  function openDay(day) {
    state.selectedDay = day;
    renderDaySheet(Date.now());
    openSheet(els.daySheet);
    renderCalendar();
  }

  /* ---------- 整体重绘 ---------- */

  /* 每页各自兜底：某一页的数据把渲染画崩，不该连累其它页和按钮。
     出问题时把错误打到控制台，界面继续可用（这个工具的使用者不会去看控制台）。 */
  function safePage(name, fn) {
    try {
      fn();
    } catch (e) {
      if (window.console && console.error) console.error('渲染「' + name + '」失败：', e);
    }
  }

  function renderAll() {
    today = dayKey();
    var now = Date.now();
    safePage('今日', function () { renderToday(now); });
    safePage('日历', function () { renderCalendar(); });
    safePage('我的', function () { renderMe(now); });
    safePage('课表', function () { renderTimetable(); });
    safePage('当天明细', function () {
      if (!els.daySheet.hidden && state.selectedDay) renderDaySheet(now);
    });
  }

  /** 每秒：时钟、今日总工时、进行中的时长、工资进度 */
  function updateLive(now) {
    els.liveClock.textContent = fmtHMS(now);
    setHTML(els.heroTotal, durHTML(dayWorkMs(today, now)));
    /* 工资池每秒跟着涨，但只在文字真的变了才写 DOM */
    if (state.view === 'today') renderPool(now);

    var open = openSessionOf(today);
    if (!open) return;

    /* 连续工作提醒优先：它和工资池整点提示可能同时到点，
       这时候该说「歇会儿」，而不是接着报账 */
    var restShown = checkRestNudge(now);
    if (!restShown) checkSalaryNudge(now);

    var text = fmtDur(now - open.s.start);
    els.statusSub.textContent = '本次已工作 ' + text;

    var nodes = document.querySelectorAll('.js-live-dur');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;

    if (!els.daySheet.hidden && state.selectedDay === today) {
      renderDaySheet(now);
    }
    if (state.view === 'calendar') refreshCalendarLive(now);
    if (state.view === 'me') renderMe(now);
  }

  function tick() {
    if (dayKey() !== today) {      // 页面开着跨过零点
      repairOpenSessions();
      renderAll();
      return;
    }
    /* 每秒跑一次，绝不能因为一次渲染出错就把时钟停掉 */
    try {
      updateLive(Date.now());
    } catch (e) {
      if (window.console && console.error) console.error('每秒刷新失败：', e);
    }
  }

  /* ============================================================
     八、底部弹层
     ============================================================ */

  function lockScroll() {
    var any = !els.daySheet.hidden || !els.editSheet.hidden ||
              !els.salarySheet.hidden || !els.courseSheet.hidden;
    els.screens.style.overflow = any ? 'hidden' : '';
  }

  function openSheet(el) {
    hideToast();
    el.hidden = false;
    void el.offsetHeight;            // 先上屏再加类，过渡才会生效
    el.classList.add('is-open');
    lockScroll();
  }

  function closeSheet(el) {
    el.classList.remove('is-open');
    if (el._closeTimer) clearTimeout(el._closeTimer);
    el._closeTimer = setTimeout(function () {
      el.hidden = true;
      lockScroll();
    }, 300);
  }

  function closeAllSheets() {
    closeSheet(els.editSheet);
    closeSheet(els.daySheet);
  }

  /* ============================================================
     九、编辑 / 删除 / 补录
     ============================================================ */

  function showEditMsg(msg, kind) {
    els.editMsg.textContent = msg;
    els.editMsg.className = 'form-msg is-' + kind;
    els.editMsg.hidden = false;
  }

  function hideEditMsg() {
    els.editMsg.hidden = true;
    els.editMsg.className = 'form-msg';
  }

  /**
   * 「忘了点下班」时打开修正面板：把结束时间猜一个合理的值给她改。
   * 猜法是「那天最后一节课的下课时间 + 30 分钟」（她一般下课再走），
   * 没有课就用「上班时间 + 8 小时」；她一眼就能看出对不对，点保存即可。
   */
  function openEstFix(day, idx) {
    openEdit(day, idx);
    var s = sessionsOf(day)[idx];
    if (!s || !s.est) return;
    var guess = guessPunchOut(day, s.start);
    els.editEnd.value = fmtHM(guess);
    els.editHint.textContent = '这一段没点下班，先按 23:59 算了 ' + fmtDur(s.end - s.start) +
      '。改完点保存（我猜的是 ' + fmtHM(guess) + '）';
    refreshEditFeedback();
  }

  /** 那天大概几点下班：最后一节课下课 + 30 分钟；没课就按上班 + 8 小时 */
  function guessPunchOut(day, startMs) {
    var last = null;
    classSpans(day, endOfDay(day)).forEach(function (cs) {
      var e = cs.scheduledEnd || cs.end;
      if (!last || e > last) last = e;
    });
    var guess = last ? last + 30 * 60000 : startMs + 8 * 3600000;
    if (guess <= startMs) guess = startMs + 3600000;
    return Math.min(guess, endOfDay(day));
  }

  function openEdit(day, idx) {
    var isNew = idx < 0;
    state.edit = { day: day, idx: idx };

    els.editTitle.textContent = isNew ? '添加一段' : '编辑这一段';
    els.editSub.textContent = fmtDayKey(day) + (day === today ? ' · 今天' : '');
    els.editHint.textContent = (day === today)
      ? '结束时间留空 = 仍在进行中'
      : '补录过去的日期时，结束时间必填';
    hideEditMsg();

    els.editDelete.hidden = isNew;
    els.editActions.classList.toggle('no-delete', isNew);

    var startMs, endMs, note;
    if (isNew) {
      var def = defaultRange(day);
      startMs = def.start;
      endMs = def.end;
      note = '';
    } else {
      var s = sessionsOf(day)[idx];
      startMs = s.start;
      endMs = s.end;
      note = cleanNote(s.note);
    }

    els.editStart.value = fmtHM(startMs);
    els.editEnd.value = (endMs === null) ? '' : fmtHM(endMs);
    els.editNote.value = note;
    syncNoteQuick();
    refreshEditFeedback();
    openSheet(els.editSheet);
  }

  /** 备注快捷词的高亮：和输入框内容一致的词点亮 */
  function syncNoteQuick() {
    if (!els.noteQuick) return;
    var v = els.editNote.value;
    var btns = els.noteQuick.querySelectorAll('button[data-note]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', btns[i].getAttribute('data-note') === v);
    }
  }

  function readEditInput() {
    var day = state.edit.day;
    var sv = els.editStart.value, ev = els.editEnd.value;
    return {
      day: day,
      startMs: sv ? hmToMs(day, sv) : null,
      endMs: ev ? hmToMs(day, ev) : null,
    };
  }

  /** 边改边提示：红色 = 不能保存，黄色 = 可以保存但提醒 */
  function refreshEditFeedback() {
    if (!state.edit) return;
    els.editEnd.classList.toggle('is-empty', els.editEnd.value === '');
    if (!els.editStart.value) { showEditMsg('请选择开始时间', 'error'); return; }

    var v = readEditInput();
    var err = validate(v.day, v.startMs, v.endMs, state.edit.idx);
    if (err) { showEditMsg(err, 'error'); return; }

    var warn = overlapWarning(v.day, v.startMs, v.endMs, state.edit.idx);
    if (warn) { showEditMsg(warn, 'warn'); return; }

    hideEditMsg();
  }

  function saveEdit() {
    if (!state.edit) return;
    if (!els.editStart.value) { showEditMsg('请选择开始时间', 'error'); return; }

    var v = readEditInput();
    var err = validate(v.day, v.startMs, v.endMs, state.edit.idx);
    if (err) { showEditMsg(err, 'error'); return; }

    var warn = overlapWarning(v.day, v.startMs, v.endMs, state.edit.idx);
    var isNew = state.edit.idx < 0;
    var hadNote = !isNew && !!cleanNote(sessionsOf(v.day)[state.edit.idx].note);
    var note = cleanNote(els.editNote.value);

    saveSession(v.day, state.edit.idx, v.startMs, v.endMs, note);
    state.edit = null;
    closeSheet(els.editSheet);
    renderAll();

    if (warn) toast('已保存，但这段与其他记录有重叠');
    else if (isNew) toast(note ? '已添加一段记录（含备注）' : '已添加一段记录');
    else if (!note && hadNote) toast('已删除备注');
    else if (note) toast('已保存时间与备注');
    else toast('已保存修改');
  }

  function deleteEdit() {
    if (!state.edit || state.edit.idx < 0) return;
    var day = state.edit.day, idx = state.edit.idx;
    var s = sessionsOf(day)[idx];
    var label = fmtHM(s.start) + ' – ' + (s.end === null ? '进行中' : fmtHM(s.end));

    if (!window.confirm('删除 ' + label + ' 这一段记录？')) return;

    deleteSession(day, idx);
    state.edit = null;
    closeSheet(els.editSheet);
    renderAll();
    toast('已删除这一段');
  }

  /* ============================================================
     十一、课表：查看
     ============================================================ */

  /** 「9月14日 周一」/「周三」 */
  function courseWhenText(c) {
    if (c.date) {
      var d = keyToDate(c.date);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + (wdName(c.weekday) || '');
    }
    return wdName(c.weekday) || '未选星期';
  }

  function courseRowHTML(c) {
    var meta = courseMetaText(c);
    /* 只有节次、还没设作息时间表 -> 这里直接写「第1节」；什么都没填 -> 照旧两个占位 */
    var timeHTML;
    if (c.startTime && c.endTime) {
      timeHTML = '<span class="tt-time">' + c.startTime +
          '<span class="tt-time-end">' + c.endTime + '</span></span>';
    } else if (c.period) {
      timeHTML = '<span class="tt-time is-period">第' + c.period + '节</span>';
    } else {
      timeHTML = '<span class="tt-time">--:--<span class="tt-time-end">--:--</span></span>';
    }
    return '<button type="button" class="tt-course" data-id="' + c.id + '">' +
        timeHTML +
        '<span class="tt-main">' +
          '<span class="tt-name">' + escapeHTML(c.courseName || '未命名课程') + '</span>' +
          (meta
            ? '<span class="tt-meta">' + escapeHTML(meta) + '</span>'
            : (c.date && c.period
                ? '<span class="tt-meta">' + escapeHTML(courseWhenText(c)) + '</span>'
                : '<span class="tt-meta tt-meta-warn">地点、教师还没填，点一下可以补充</span>')) +
        '</span>' +
        '<span class="tt-arrow" aria-hidden="true">' + CHEVRON + '</span>' +
      '</button>';
  }

  /* ---------- 周视图网格 ---------- */

  /* 课程块配色：同一门课永远同一个颜色，不同的课名尽量都不一样。
     只用「名字哈希 % 颜色数」会撞色（8 个颜色、10 门课必然有重复），
     所以哈希只用来决定「从哪个颜色开始找」，然后往后找一个还没被别的课名占用的。
     课程名先排序再分配 —— 颜色只跟「有哪些课名」有关，跟添加顺序无关，重启后也一样。 */
  var BLOCK_COLORS = [
    ['#eef2ff', '#3b52d4'],   // 靛蓝
    ['#e8f7f0', '#0d7a56'],   // 绿
    ['#fff3e6', '#a35a12'],   // 橙
    ['#fdeef2', '#b3305c'],   // 玫红
    ['#eef7fb', '#106b8f'],   // 青
    ['#f3eefd', '#6842c2'],   // 紫
    ['#fbf7e6', '#8a6d1a'],   // 橄榄黄
    ['#eef4ee', '#3f6b3f'],   // 墨绿
    ['#e6f5f5', '#0b6b6b'],   // 蓝绿
    ['#fdeaea', '#a8202a'],   // 红
    ['#eef0f4', '#3a4657'],   // 石板灰
    ['#f9eef7', '#8a2e74'],   // 品红
    ['#eef6e6', '#4a6b1a'],   // 黄绿
    ['#e8f1fd', '#12558f'],   // 钢蓝
  ];

  function nameHash(name) {
    var h = 0, s = String(name || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
    return h;
  }

  var colorOfName = {};      // 课程名 -> 颜色下标
  var colorOfKey = '';       // 这张表是按哪些课名算的；课名变了才重算

  function rebuildColorMap() {
    var seen = {};
    courses.forEach(function (c) { if (c.courseName) seen[c.courseName] = 1; });
    var names = Object.keys(seen).sort();
    var key = names.join('\u0001');
    if (key === colorOfKey) return;
    colorOfKey = key;
    colorOfName = {};
    var used = {};
    names.forEach(function (n) {
      var start = nameHash(n) % BLOCK_COLORS.length;
      var pick = start;
      for (var k = 0; k < BLOCK_COLORS.length; k++) {
        var tryIdx = (start + k) % BLOCK_COLORS.length;
        if (!used[tryIdx]) { pick = tryIdx; break; }   // 课名比颜色还多时只能重复，但不崩
      }
      used[pick] = 1;
      colorOfName[n] = pick;
    });
  }

  function courseColor(name) {
    var n = String(name || '');
    var idx = colorOfName[n];
    if (idx === undefined) idx = nameHash(n) % BLOCK_COLORS.length;
    return BLOCK_COLORS[idx];
  }

  /** 这一周要显示哪几列：有周末课才显示周六周日，否则 5 列更宽更好读 */
  /** 正在看的那一周的周一（offset=0 是本周，-1 是上周，1 是下周） */
  function weekMondayKey(offset) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (offset || 0) * 7);
    return dayKey(d);
  }

  function dateKeyPlus(key, n) {
    var d = keyToDate(key);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }

  /** 这一周画几列：只要课表里有周末的课就画 7 列，否则 5 列 */
  function visibleWeekdays(list) {
    var hasWeekend = list.some(function (c) {
      var wd = c.date ? weekdayOfKey(c.date) : c.weekday;
      return wd === 6 || wd === 7;
    });
    var cols = [1, 2, 3, 4, 5];
    if (hasWeekend) cols.push(6, 7);
    return cols;
  }

  /* 一门课在某一天上不上 —— 直接用统一入口 courseOccursOn()，
     周视图和日历必须是同一个判断，不能再各写一套 */

  /** 一节课占哪一行：优先按「第几节」（学校导出的是这种），否则按开始时间 */
  function gridSlotOf(c) {
    if (c.period) return 'p' + c.period;
    if (c.startTime) return 't' + c.startTime;
    return '';
  }

  /** 行首显示的开始/结束时间；作息表还没设时「第几节」查不到时间，返回空而不是 null
      （返回 null 会让调用处读 .start 直接抛错，把整个课表页渲染带崩） */
  function slotTime(slot) {
    if (slot.charAt(0) === 'p') return periodTime(+slot.slice(1)) || { start: '', end: '' };
    return { start: slot.slice(1), end: '' };
  }

  /** 这一周要显示的行（第几节 / 上课时间），按时间先后排 */
  function gridRows(weekList) {
    var seen = {}, rows = [];
    weekList.forEach(function (c) {
      var slot = gridSlotOf(c);
      if (!slot) return;
      if (seen[slot] !== undefined) {
        var ex = rows[seen[slot]];
        if (c.endTime && c.endTime > ex.end) ex.end = c.endTime;
        return;
      }
      seen[slot] = rows.length;
      rows.push({ slot: slot, period: c.period || 0, start: c.startTime || '', end: c.endTime || '' });
    });
    rows.forEach(function (r) {
      var t = r.period ? periodTime(r.period) : null;
      if (t) { r.start = t.start; r.end = t.end; }
      r.sortMs = r.start ? hmToMs(today, r.start) : null;
      if (r.sortMs === null && r.end) r.sortMs = hmToMs(today, r.end);
    });
    rows.sort(function (a, b) {
      if (a.sortMs !== null && b.sortMs !== null) return a.sortMs - b.sortMs;
      if (a.sortMs !== null) return -1;
      if (b.sortMs !== null) return 1;
      return a.period - b.period;
    });
    return rows;
  }

  /** 格子太窄时用的短名：「高三12班、高三14班」->「12·14」 */
  function shortClassName(name) {
    var s = String(name || '');
    var m = s.match(/\d+\s*班/g);
    if (!m || m.length < 1) return '';
    var nums = m.map(function (x) { return x.replace(/\s*班$/, '').trim(); });
    var short = nums.join('·');
    return (short && short !== s) ? short : '';
  }

  function blockHTML(c) {
    var col = courseColor(c.courseName || c.date || 'x');
    var loc = c.location || '';
    var short = shortClassName(c.courseName);
    return '<button type="button" class="tt-block" data-id="' + c.id + '"' +
        (short ? ' data-short="' + escapeHTML(short) + '"' : '') +
        ' style="background:' + col[0] + ';color:' + col[1] + '"' +
        ' aria-label="' + escapeHTML(c.courseName || '未命名课程') +
          ' ' + (c.startTime || '') + ' 到 ' + (c.endTime || '') +
          (loc ? ' 在 ' + escapeHTML(loc) : '') + '">' +
        '<span class="tt-block-name">' + escapeHTML(c.courseName || '未命名') + '</span>' +
        (loc ? '<span class="tt-block-loc">' + escapeHTML(loc) + '</span>' : '') +
      '</button>';
  }

  /**
   * 网格画完后再看一遍：名字被格子裁掉的话，换成「12·14」这种短名。
   * 全名还在 aria-label 和点开后的编辑弹层里，不会丢信息。
   */
  function fitGridLabels() {
    var blocks = els.ttGrid.querySelectorAll('.tt-block');
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var short = b.getAttribute('data-short');
      if (!short) continue;
      if (b.scrollHeight <= b.clientHeight + 1) continue;
      var nm = b.querySelector('.tt-block-name');
      if (!nm) continue;
      nm.textContent = short;
      nm.className = 'tt-block-name is-short';
    }
  }

  /** 这一周有几节课、加起来大概多少分钟（按作息表或课本身的时间算） */
  function weekLoad(weekList) {
    var ms = 0, count = 0;
    weekList.forEach(function (c) {
      var st = c.startTime, en = c.endTime;
      if ((!st || !en) && c.period) {
        var pt = periodTime(c.period);
        if (pt) { st = pt.start; en = pt.end; }
      }
      if (!st || !en) { count++; return; }               // 没时间的课也算一节，只是不计时长
      var a = hmToMin(st), b = hmToMin(en);
      if (b > a) ms += (b - a) * 60000;
      count++;
    });
    return { count: count, ms: ms };
  }

  function renderGrid(list) {
    var cols = visibleWeekdays(list);
    var off = state.ttWeekOffset || 0;
    var monday = weekMondayKey(off);
    var dates = cols.map(function (wd) { return dateKeyPlus(monday, wd - 1); });
    var weekNo = weekNoOfKey(monday);        // 「这一周是第几周」按这一周算，不是按现在算

    /* 这一周的课（其它周的课不占格子，免得串周）—— 判断和日历共用 courseOccursOn */
    var weekList = list.filter(function (c) {
      for (var i = 0; i < cols.length; i++) {
        if (courseOccursOn(c, dates[i])) return true;
      }
      return false;
    });

    var rows = gridRows(weekList);
    var usePeriod = rows.some(function (r) { return !!r.period; });
    /* 7 列（有周末课）时手机屏幕很窄：轴窄一点、字小一点，让整周一屏放得下，
       而不是逼她去左右滑。5 列时空间够，照常 */
    var dense = cols.length > 5;
    els.ttGrid.className = 'tt-grid' + (dense ? ' is-dense' : '');
    var axis = dense ? 32 : (usePeriod ? 42 : 38);

    /* 没填时间的课没法放进网格，单独在下面提示一句 */
    var noTimeCount = list.filter(function (c) { return !c.period && !c.startTime; }).length;
    var noDayCount = list.filter(function (c) {
      return !c.date && !(c.weekday >= 1 && c.weekday <= 7);
    }).length;

    /* 周切换条 */
    if (els.ttNav) {
      els.ttNav.hidden = false;
      var a = keyToDate(dates[0]), b = keyToDate(dates[dates.length - 1]);
      var range = (a.getMonth() + 1) + '/' + a.getDate() + ' – ' +
                  (b.getMonth() + 1) + '/' + b.getDate();
      if (off === 0) range += ' · 本周';
      else if (weekNo) range += ' · 第' + weekNo + '周';
      els.ttNavText.textContent = range;
      els.ttThisWeek.hidden = (off === 0);
    }

    /* 列数写在外层 #ttGrid 上：1 列时间轴 + N 列日期。
       注意不能再套一层 .tt-grid，否则外层 grid-auto-rows 会把内层压扁 */
    var minCol = dense ? 0 : 42;              // 7 列时允许压缩到刚好放得下
    els.ttGrid.style.gridTemplateColumns = axis + 'px repeat(' + cols.length +
      ',minmax(' + minCol + 'px,1fr))';

    /* 这一周有多少课、大概多少小时 —— 一眼知道这周多重 */
    if (els.ttWeekLoad) {
      var wl = weekLoad(weekList);
      if (wl.count) {
        els.ttWeekLoad.textContent = '这一周 ' + wl.count + ' 节 · 约 ' + fmtDur(wl.ms);
        els.ttWeekLoad.hidden = false;
      } else {
        els.ttWeekLoad.hidden = true;
      }
    }

    var html = '';

    /* 左上角：说清楚左边这一列是「节次」还是「时间」 */
    html += '<div class="tt-grid-axis-head">' + (usePeriod ? '节次' : '时间') + '</div>';
    cols.forEach(function (wd, i) {
      var dk = dates[i];
      var isToday = (dk === today);
      var dd = keyToDate(dk);
      html += '<div class="tt-grid-head' + (isToday ? ' is-today' : '') + '">' +
          '<span class="tt-grid-head-day">' + wdName(wd).replace('周', '') + '</span>' +
          '<span class="tt-grid-head-date">' + (dd.getMonth() + 1) + '/' + dd.getDate() + '</span>' +
        '</div>';
    });

    if (!rows.length) {
      var emptyMsg = weekList.length
        ? '这一周的课还没填上课时间'
        : (off === 0 ? '这一周没有课' : '这一周没有课');
      html += '<div class="tt-grid-time">—</div>' +
        '<div class="tt-grid-empty" style="grid-column:span ' + cols.length + '">' +
          emptyMsg + '</div>';
    } else {
      rows.forEach(function (row) {
        var t = slotTime(row.slot);
        if (row.period) {
          html += '<div class="tt-grid-time is-period" title="第' + row.period + '节">' +
              '<b class="tt-grid-period">' + row.period + '</b>' +
              (t.start ? '<span class="tt-grid-time-sub">' + t.start + '</span>'
                       : '<span class="tt-grid-time-sub">节</span>') +
            '</div>';
        } else {
          html += '<div class="tt-grid-time">' + row.start +
            (row.end ? '<span class="tt-grid-time-sub">' + row.end + '</span>' : '') + '</div>';
        }
        cols.forEach(function (wd, i) {
          /* 这个格子里的课：这一列的那一天，且是同一节/同一时间 */
          var here = weekList.filter(function (c) {
            return gridSlotOf(c) === row.slot && courseOccursOn(c, dates[i]);
          });
          var isToday = (dates[i] === today);
          if (!here.length) {
            html += '<div class="tt-grid-cell' + (isToday ? ' is-today' : '') + '"></div>';
            return;
          }
          html += '<div class="tt-grid-cell' + (isToday ? ' is-today' : '') + '">' +
            blockHTML(here[0]) +
            (here.length > 1 ? '<span class="tt-block-more">+' + (here.length - 1) + '</span>' : '') +
          '</div>';
        });
      });
    }
    els.ttGrid.innerHTML = html;
    fitGridLabels();
    var notes = [];
    if (noTimeCount) notes.push(noTimeCount + ' 门没填时间（网格里放不下，切到「列表」看）');
    if (noDayCount) notes.push(noDayCount + ' 门没选日期也没选星期（同上）');
    return notes;
  }

  function renderTimetable() {
    var list = courses;
    rebuildColorMap();                 // 先按课名把颜色分配好（不同课名不同色）
    els.ttSummary.hidden = list.length === 0;
    els.ttEmpty.hidden = list.length > 0;
    els.ttSwitch.hidden = list.length === 0;
    renderWeekBar();
    renderPeriodBar();

    if (!list.length) {
      els.ttList.innerHTML = '';
      els.ttGrid.innerHTML = '';
      els.ttGridWrap.hidden = true;
      els.ttNav.hidden = true;
      return;
    }

    var gridMode = (state.ttView !== 'list');
    els.ttGridWrap.hidden = !gridMode;
    els.ttList.hidden = gridMode;
    var sw = els.ttSwitch.querySelectorAll('button');
    for (var i = 0; i < sw.length; i++) {
      sw[i].classList.toggle('is-on', sw[i].getAttribute('data-tt') === (gridMode ? 'grid' : 'list'));
    }

    /* 分组：有具体日期的按日期排（学校导出的课表就是这种），
       没日期的按星期（每周重复）排在后面 */
    var byDate = {}, byWeekday = {};
    list.forEach(function (c) {
      if (c.date) {
        (byDate[c.date] = byDate[c.date] || []).push(c);
      } else {
        var wd = (c.weekday >= 1 && c.weekday <= 7) ? c.weekday : 0;
        (byWeekday[wd] = byWeekday[wd] || []).push(c);
      }
    });

    var groups = [];
    Object.keys(byDate).sort().forEach(function (dk) {
      var dd = keyToDate(dk);
      groups.push({
        label: (dd.getMonth() + 1) + '月' + dd.getDate() + '日',
        sub: wdName(weekdayOfKey(dk)),
        isToday: (dk === today),
        isPast: (dk < today),
        list: byDate[dk],
      });
    });
    Object.keys(byWeekday).map(Number).sort(function (a, b) {
      if (a === 0) return 1;           // 「没选」永远排最后
      if (b === 0) return -1;
      return a - b;
    }).forEach(function (wd) {
      groups.push({
        label: wdName(wd) || '没选日期也没选星期',
        sub: '每周重复',
        isToday: (wd === todayWeekday()),
        isPast: false,
        list: byWeekday[wd],
      });
    });

    /* 「分布在几天」= 一周里有几天要上课，按**星期**算，不按具体日期算。
       以前是「不同日期数 + 不同星期数」，所以同一天的课只要一半带日期一半不带就会被算两遍
       （她的例子：周一到周四 + 周六有课、周五没课 -> 应该是 5 天，却显示了 6）。 */
    var wdSet = {};
    list.forEach(function (c) {
      var wd = c.date ? weekdayOfKey(c.date) : c.weekday;
      if (wd >= 1 && wd <= 7) wdSet[wd] = 1;
    });
    var wdList = Object.keys(wdSet).map(Number).sort(function (a, b) { return a - b; });
    var realDays = wdList.length;
    var wdText = wdList.map(function (w) { return wdName(w); }).join('、');
    /* 「还没填上课时间」只算那些既没有节次、也没有具体时间的课 */
    var noTime = list.filter(function (c) { return !c.period && (!c.startTime || !c.endTime); }).length;

    els.ttSummaryText.textContent = realDays
      ? '共 ' + list.length + ' 门课程，一周有 ' + realDays + ' 天要上课'
      : '共 ' + list.length + ' 门课程，还没排到具体哪一天';
    var sub = realDays ? wdText : '';
    if (noTime) sub += (sub ? ' · ' : '') + noTime + ' 门还没填上课时间';
    if (!sub) sub = '点任意一门可以修改或删除';

    /* 周视图 */
    var notes = gridMode ? renderGrid(list) : [];
    if (gridMode && notes.length) sub = notes.join('；');
    els.ttSummarySub.textContent = sub;

    /* 列表视图 */
    var html = '';
    groups.forEach(function (g) {
      var todayTag = g.isToday
        ? '<span class="tt-day-today">今天</span>'
        : (g.isPast ? '<span class="tt-day-past">已过</span>' : '');
      html += '<section class="tt-day">' +
          '<div class="tt-day-head">' +
            '<span class="tt-day-name">' + g.label + todayTag + '</span>' +
            '<span class="tt-day-count">' + (g.sub ? g.sub + ' · ' : '') + g.list.length + ' 门</span>' +
          '</div>' +
          '<div class="tt-courses">' + g.list.map(courseRowHTML).join('') + '</div>' +
        '</section>';
    });

    els.ttList.innerHTML = html;
  }

  /* ============================================================
     十二、课表：批量手动导入
     ============================================================ */

  function pendingItemHTML(c, i) {
    var is = courseIssues(c);
    var meta = courseMetaText(c);
    return '<div class="ov-item">' +
        '<div class="ov-item-top">' +
          '<span class="ov-item-name' + (c.courseName ? '' : ' is-missing') + '">' +
            (c.courseName ? escapeHTML(c.courseName) : '（未填写课程名称）') +
          '</span>' +
          '<span class="ov-item-ops">' +
            '<button type="button" data-edit="' + i + '">修改</button>' +
            '<button type="button" class="is-del" data-del="' + i + '">删除</button>' +
          '</span>' +
        '</div>' +
        '<div class="ov-item-line">' + escapeHTML(courseWhenText(c)) + ' ' +
          escapeHTML(courseTimeText(c)) + (meta ? ' · ' + escapeHTML(meta) : '') + '</div>' +
        (is.hard.length
          ? '<div class="ov-item-warn">需要先修正：' + escapeHTML(is.hard.join('、')) + '</div>'
          : (is.soft.length
              ? '<div class="ov-item-warn is-soft">' + escapeHTML(is.soft.join('、')) +
                ' 还没填，可以先导入，之后在课表里补</div>'
              : '')) +
      '</div>';
  }

  function renderImport() {
    var list = state.pending;
    var badCount = list.filter(function (c) { return courseIssues(c).hard.length; }).length;

    els.importEmpty.hidden = list.length > 0;
    els.importList.innerHTML = list.map(pendingItemHTML).join('');
    els.importCount.textContent = badCount
      ? list.length + ' 门 · ' + badCount + ' 门待修正'
      : list.length + ' 门';

    els.importConfirm.textContent = list.length ? '确认导入（' + list.length + ' 门）' : '确认导入';
    els.importConfirm.classList.toggle('is-muted', list.length === 0);
    els.importConfirm.setAttribute('aria-disabled', list.length === 0 ? 'true' : 'false');
  }

  function openImport() {
    state.pending = [];
    state.mergeIncoming = null;
    state.mergePlan = null;
    els.mergeBox.hidden = true;
    els.importScreen.hidden = false;
    renderImport();
    els.importBody.scrollTop = 0;
  }

  function closeImport() {
    state.pending = [];
    state.mergeIncoming = null;
    state.mergePlan = null;
    els.mergeBox.hidden = true;
    els.importList.innerHTML = '';     // 别把上一轮的内容留在 DOM 里
    els.importEmpty.hidden = false;
    els.importScreen.hidden = true;
  }

  /** 返回/取消前：提醒未导入的内容会丢（对应「重新识别前提醒」的要求） */
  function leaveImport() {
    if (state.pending.length) {
      var n = state.pending.length;
      if (!window.confirm('当前录入的 ' + n + ' 门课程还没有导入。\n\n确定返回吗？这些内容会被丢弃。')) return;
    }
    closeImport();
  }

  /** 「同一个格子」的判定键：日期（或星期+周次）+ 节次/时间。
      一个「某天的第几节」位置上只能有一门课，所以键里不带课名：
      学校把第5节从高三11班改成高三13班时，应该更新那一条，而不是两门课并排。
      （同一次粘贴里同一天同一节本来就写了两门不同的课，那是学校的写法，
        由 dedupeCourses 保留成两条，这里不会把它们合并掉。） */
  function courseKey(c) {
    var slot = c.period ? ('p' + c.period)
      : ('t' + (c.startTime || '') + '-' + (c.endTime || ''));
    var day = c.date ? ('d' + c.date) : ('w' + (c.weekday || 0) + '|' + (c.weeks || ''));
    return day + '|' + slot;
  }

  /**
   * 把新导入的课并进已有课表：**已有的绝不删**，重复的不重复加。
   * 返回 { list, added, updated, same, renamed }
   *   added   新日期 / 新节次 -> 加进去
   *   updated 同一天同一节已经有了 -> 用新内容覆盖那一条（改了作息表重新导入时会用到）
   *   same    和已有的完全一样 -> 什么都不做
   *   renamed 覆盖时课名变了 -> 记下改动，好告诉她改了什么
   */
  function mergeCourses(existing, incoming) {
    var list = existing.map(function (c) { return c; });
    var idx = {}, fromExisting = {};
    list.forEach(function (c, i) { var k = courseKey(c); idx[k] = i; fromExisting[k] = 1; });

    var added = 0, updated = 0, same = 0, renamed = [];
    incoming.forEach(function (c) {
      var k = courseKey(c);
      if (idx[k] === undefined || !fromExisting[k]) {
        /* 没有这个格子，或者这个格子是这一批里刚加的（学校同一天同一节写了两门）-> 都留着 */
        idx[k] = list.length;
        list.push(c);
        added++;
        return;
      }
      var old = list[idx[k]];
      var sameAll = old.courseName === c.courseName && old.startTime === c.startTime &&
        old.endTime === c.endTime && old.teacher === c.teacher &&
        old.location === c.location && old.weeks === c.weeks &&
        String(old.remark || '') === String(c.remark || '');
      if (sameAll) { same++; return; }
      if (old.courseName !== c.courseName) {
        renamed.push('第' + (c.period || '?') + '节：' + old.courseName + ' → ' + c.courseName);
      }
      c.id = old.id;                      // 保留原来的 id，界面上不跳
      list[idx[k]] = c;
      updated++;
    });
    return { list: list, added: added, updated: updated, same: same, renamed: renamed };
  }

  /** 点「确认导入」后，先算一遍「会加几门、几门已经有了」，再让她选合并还是替换 */
  function confirmImport() {
    var list = state.pending;
    if (!list.length) { toast('还没有添加课程'); return; }

    var bad = list.filter(function (c) { return courseIssues(c).hard.length; });
    if (bad.length) {
      toast('还有 ' + bad.length + ' 门课程信息不完整，请先修正');
      var first = els.importList.querySelector('.ov-item-warn');
      if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' });
      return;
    }

    var incoming = list.map(function (c) { return cleanCourse(c, c.id); });

    /* 已有课表 -> 不能直接覆盖（她报的：批量导入把前面的弄没了）。
       弹一个明确的选择：合并（默认、安全）/ 替换全部 / 取消。 */
    if (courses.length) {
      var m = mergeCourses(courses, incoming);
      state.mergeIncoming = incoming;
      state.mergePlan = m;
      els.mergeTitle.textContent = '已有 ' + courses.length + ' 门课程，这次要导入 ' + incoming.length + ' 门';
      els.mergeSub.textContent = '合并：新增 ' + m.added + ' 门' +
        (m.updated ? '、更新 ' + m.updated + ' 门' : '') +
        (m.same ? '、' + m.same + ' 门已经有了' : '') +
        ' —— 原来的课程不会被删掉' +
        (m.renamed.length ? '（' + m.renamed.join('；') + '）' : '');
      els.mergeBox.hidden = false;
      return;
    }
    finishImport(incoming, false, { added: incoming.length, updated: 0, same: 0 });
  }

  /** keepExisting=true 合并；false 替换 */
  function finishImport(incoming, replaceAll, stat) {
    if (replaceAll) {
      courses = incoming.slice();
      sortCourses();
      saveCourses();
      closeImport();
      renderTimetable();
      afterImportToast(courses.length, 0, 0, true);
      return;
    }
    if (stat && (stat.added || stat.updated)) {
      var m = mergeCourses(courses, incoming);
      courses = m.list;
      sortCourses();
      saveCourses();
    } else if (!courses.length) {
      courses = incoming.slice();
      sortCourses();
      saveCourses();
    }
    closeImport();
    renderTimetable();
    afterImportToast(stat ? stat.added : incoming.length, stat ? stat.updated : 0,
      stat ? stat.same : 0, false);
  }

  function afterImportToast(added, updated, same, replaced) {
    var msg = replaced ? ('已替换课表：' + courses.length + ' 门课程')
      : ('已导入 ' + added + ' 门' + (updated ? '、更新 ' + updated + ' 门' : '') +
         (same ? '（' + same + ' 门已经有了）' : ''));
    toast(msg);
    /* 学校导出的课表只有「第几节」没有时间 —— 顺手提醒她去设作息时间表 */
    if (needsPeriodTimes() && !periodsConfigured()) {
      setTimeout(function () { toast('还要设一下「作息时间表」，第几节才能算出时间'); }, 2200);
    }
  }

  /* ============================================================
     十三、课表：课程编辑弹层
     ============================================================ */

  function showCourseMsg(text, kind) {
    els.courseMsg.textContent = text;
    els.courseMsg.className = 'form-msg is-' + kind;
    els.courseMsg.hidden = false;
  }

  function hideCourseMsg() {
    els.courseMsg.hidden = true;
    els.courseMsg.className = 'form-msg';
  }

  function syncWeekdayUI() {
    var btns = els.courseWeekdays.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', +btns[i].getAttribute('data-wd') === state.courseWd);
    }
  }

  function fillCourseForm(c) {
    state.courseWd = (c.weekday >= 1 && c.weekday <= 7) ? c.weekday : 0;
    state.courseSel = c.period ? [c.period] : [];
    els.courseName.value = c.courseName || '';
    els.courseStart.value = c.startTime || '';
    els.courseEnd.value = c.endTime || '';
    els.courseTeacher.value = c.teacher || '';
    els.courseLocation.value = c.location || '';
    els.courseWeeks.value = c.weeks || '';
    els.courseRemark.value = c.remark || '';
    syncWeekdayUI();
    syncWeeksHint();
    renderPeriodChips();
  }

  /** 用表单里的内容造一条课程（period 传入选中的节次） */
  function courseFromForm(period) {
    return cleanCourse({
      id: '',
      courseName: els.courseName.value,
      teacher: els.courseTeacher.value,
      location: els.courseLocation.value,
      weekday: state.courseWd,
      startTime: els.courseStart.value,
      endTime: els.courseEnd.value,
      weeks: els.courseWeeks.value,
      remark: els.courseRemark.value,
      period: period || 0,                    // 以前漏了这个字段，编辑导入来的课会把节次丢掉
    });
  }

  function readCourseForm() {
    var sel = selectedPeriods();
    /* 多选时先按「第一节」校验；生成时每节各一条 */
    return courseFromForm(sel.length ? sel[0] : 0);
  }

  /* ---------- 第几节：可以多选，选几节就生成几条课程 ---------- */

  /** 按作息表画出「第几节」按钮（没设作息表就整块不显示） */
  function renderPeriodChips() {
    if (!els.coursePeriodField) return;
    var list = periods();
    els.coursePeriodField.hidden = !list;
    if (!list) return;
    var multi = canPickMulti();
    els.coursePeriodLbl.innerHTML = multi
      ? '第几节<span class="field-label-sub">（可多选，选几节生成几条）</span>'
      : '第几节<span class="field-label-sub">（点一下自动填好上课时间）</span>';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i][0]) continue;
      html += '<button type="button" data-p="' + (i + 1) + '" aria-label="第' + (i + 1) + '节">' +
        (i + 1) + '</button>';
    }
    els.coursePeriods.innerHTML = html;
    syncPeriodChips();
  }

  /** 「添加」时可以多选节次（一次生成好几条）；编辑已有那一条时只能单选 */
  function canPickMulti() {
    var t = state.courseTarget;
    return !!(t && t.mode === 'new');
  }

  function selectedPeriods() {
    return (state.courseSel || []).slice().sort(function (a, b) { return a - b; });
  }

  /** 多选出来的那几节合起来的「首尾时间」，用来回填开始/结束框 */
  function fillTimesFromSelection() {
    var sel = selectedPeriods();
    if (!sel.length) return;
    var first = periodTime(sel[0]), last = periodTime(sel[sel.length - 1]);
    if (first) els.courseStart.value = first.start;
    if (last) els.courseEnd.value = last.end;
  }

  /**
   * 让「第几节」的高亮和她填的时间保持一致。
   * fromTime=true 表示是「时间框被改了」触发的 —— 这时按时间重新认一节（多选清掉，变成单选）；
   * fromTime=false 表示是「点了节次按钮 / 刚打开表单」触发的 —— 这时以她的选择为准：
   * 她把最后一节也取消掉时，就真的取消（不能因为时间还配得上又给她加回来）。
   */
  function syncPeriodChips(fromTime) {
    if (!els.coursePeriods || !els.coursePeriodField || els.coursePeriodField.hidden) return;
    var s = els.courseStart.value, e = els.courseEnd.value;
    var sel = selectedPeriods();
    if (fromTime && (s || e)) {
      var byTime = matchPeriodByTime(s, e);
      sel = byTime ? [byTime] : [];
      state.courseSel = sel;
    }
    var btns = els.coursePeriods.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on',
        sel.indexOf(parseInt(btns[i].getAttribute('data-p'), 10)) >= 0);
    }
    var hint = els.coursePeriodHint;
    if (!hint) return;
    if (sel.length) {
      var label = sel.length === 1
        ? '第' + sel[0] + '节'
        : sel.join('、').replace(/^/, '第') + '节';
      if (sel.length > 1) {
        var t0 = periodTime(sel[0]), t1 = periodTime(sel[sel.length - 1]);
        hint.textContent = '已选 ' + sel.length + ' 节：' + label +
          (t0 && t1 ? '（' + t0.start + '–' + t1.end + '）' : '') +
          ' · 保存会生成 ' + sel.length + ' 条课程（每节一条）';
        hint.className = 'field-hint is-ok';
      } else {
        var pt = periodTime(sel[0]);
        hint.textContent = (fromTime && s && e ? '已匹配：' : '已选：') + label +
          (pt ? ' ' + pt.start + '–' + pt.end : '');
        hint.className = 'field-hint is-ok';
      }
    } else if (s || e) {
      hint.textContent = fromTime
        ? '这个时间和作息表里的每一节都对不上，保存后按你填的时间显示'
        : '';
      hint.className = fromTime ? 'field-hint is-warn' : 'field-hint';
    } else {
      hint.textContent = '';
      hint.className = 'field-hint';
    }
  }

  /* ---------- 周次：写什么都要认，认不出就当面说清楚 ---------- */

  /** 周次那一栏下面的提示：把「我理解成了什么」直接写出来 */
  function syncWeeksHint() {
    var el = els.courseWeeksHint;
    if (!el) return;
    var raw = els.courseWeeks.value;
    if (!String(raw || '').trim()) {
      el.textContent = '';                 // 字段标签里已经写了「不填＝每周」
      el.className = 'field-hint';
      return;
    }
    var w = parseWeeks(raw, true);
    if (!w) {
      el.textContent = '这句没看懂 —— 现在会按「每周都上」处理。改成 1-16周 / 第4周 / 13到23 这类写法就行';
      el.className = 'field-hint is-warn';
      return;
    }
    if (w.type === 'all') {
      el.textContent = '理解为：每周都上';
      el.className = 'field-hint is-ok';
      return;
    }
    if (w.type === 'odd') { el.textContent = '理解为：单周（第 1、3、5… 周）'; el.className = 'field-hint is-ok'; return; }
    if (w.type === 'even') { el.textContent = '理解为：双周（第 2、4、6… 周）'; el.className = 'field-hint is-ok'; return; }
    var text = weeksToText(w);
    var only = w.weeks.length === 1 ? '只在第 ' + w.weeks[0] + ' 周上' : '第 ' + text.replace(/周$/, '') + ' 周上';
    el.textContent = '理解为：' + text + '（' + only + '）';
    el.className = 'field-hint is-ok';
  }

  /** 连续录入时，用上一门课当模板（星期/教师/地点/周次通常一样） */
  function lastCourseTemplate() {
    if (state.pending.length) return state.pending[state.pending.length - 1];
    if (courses.length) return courses[courses.length - 1];
    return null;
  }

  /**
   * 打开「新增一门」；forImport = 是否在导入页里
   *
   * 只有「星期」和「上课时间」会沿用上一门：
   *   - 星期是录入时的上下文（正在录同一天的课），不是课程本身的字段
   *   - 时间接着上一门的下课时间，符合排课习惯
   * 教师 / 地点 / 周次 / 备注 **绝不沿用**：这些是每门课自己的信息，
   * 预填错的内容比留空更糟（用户可能没注意就保存了）。
   */
  function openCourseNew(forImport) {
    var t = lastCourseTemplate();
    state.courseTarget = { mode: 'new', forImport: !!forImport };

    els.courseTitle.textContent = forImport ? '添加课程' : '添加一门课程';
    els.courseSub.textContent = forImport
      ? '第 ' + (state.pending.length + 1) + ' 门 · 星期和时间接着上一门，其余请自己填'
      : '填好后点「保存」';

    state.courseWd = (t && t.weekday >= 1 && t.weekday <= 7) ? t.weekday : todayWeekday();
    state.courseSel = [];
    els.courseName.value = '';
    els.courseStart.value = (t && t.endTime) ? t.endTime : '08:00';
    els.courseEnd.value = addMinutes(els.courseStart.value, 100);
    els.courseTeacher.value = '';
    els.courseLocation.value = '';
    els.courseWeeks.value = '';
    els.courseRemark.value = '';

    els.courseDelete.hidden = true;
    els.courseActions.classList.add('no-delete');
    els.courseSaveNext.hidden = !forImport;

    hideCourseMsg();
    syncWeekdayUI();
    syncWeeksHint();
    renderPeriodChips();
    openSheet(els.courseSheet);
  }

  function openCourseEdit(id) {
    var c = findCourse(id);
    if (!c) return;
    state.courseTarget = { mode: 'course', id: id };
    els.courseTitle.textContent = '编辑课程';
    els.courseSub.textContent = (wdName(c.weekday) || '未选星期') + ' ' + courseTimeText(c);
    fillCourseForm(c);
    els.courseDelete.hidden = false;
    els.courseActions.classList.remove('no-delete');
    els.courseSaveNext.hidden = true;
    hideCourseMsg();
    openSheet(els.courseSheet);
  }

  function openPendingEdit(index) {
    var c = state.pending[index];
    if (!c) return;
    state.courseTarget = { mode: 'pending', index: index };
    els.courseTitle.textContent = '修改这一门';
    els.courseSub.textContent = '第 ' + (index + 1) + ' 门 / 共 ' + state.pending.length + ' 门';
    fillCourseForm(c);
    els.courseDelete.hidden = false;
    els.courseActions.classList.remove('no-delete');
    els.courseSaveNext.hidden = true;
    hideCourseMsg();
    openSheet(els.courseSheet);
  }

  /** next = true 表示「保存后再添一门」（批量录入用） */
  function saveCourseAndMaybeNext(next) {
    var t = state.courseTarget;
    if (!t) return;

    var sel = selectedPeriods();
    var c = readCourseForm();
    var is = courseIssues(c);
    if (is.hard.length) {
      showCourseMsg(is.hard.join('；') + '，请先填好', 'error');
      return;
    }

    /* 多选节次（只可能在「添加」时）：选了几节就生成几条课程，每节一条 */
    var multi = (t.mode === 'new' && sel.length > 1);
    var made = [];
    if (multi) {
      sel.forEach(function (n) {
        var pt = periodTime(n);
        if (!pt) return;
        var one = cleanCourse({
          id: '', courseName: els.courseName.value, teacher: els.courseTeacher.value,
          location: els.courseLocation.value, weekday: state.courseWd,
          startTime: pt.start, endTime: pt.end, weeks: els.courseWeeks.value,
          remark: els.courseRemark.value, period: n,
        });
        one.id = newCourseId();
        made.push(one);
      });
      if (!made.length) { showCourseMsg('选中的节次在作息表里查不到时间', 'error'); return; }
    }

    var savedForTemplate = c;

    if (multi) {
      if (t.forImport) { for (var k = 0; k < made.length; k++) state.pending.push(made[k]); }
      else { for (var m = 0; m < made.length; m++) courses.push(made[m]); sortCourses(); saveCourses(); }
    } else if (t.mode === 'new') {
      c.id = newCourseId();
      if (t.forImport) state.pending.push(c);
      else { courses.push(c); sortCourses(); saveCourses(); }
    } else if (t.mode === 'pending') {
      c.id = state.pending[t.index].id;
      state.pending[t.index] = c;
    } else {
      c.id = t.id;
      var i = indexOfCourse(t.id);
      if (i >= 0) courses[i] = c;
      sortCourses();
      saveCourses();
    }

    closeSheet(els.courseSheet);
    renderTimetable();
    if (!els.importScreen.hidden) renderImport();

    if (next && t.mode === 'new' && t.forImport) {
      toast(multi ? '已加入 ' + made.length + ' 条（第 ' + sel.join('、') + ' 节）'
                  : '已加入第 ' + state.pending.length + ' 门');
      openCourseNew(true);   // 用刚保存的这门当模板，继续加下一门
      return;
    }

    if (multi) toast('已添加 ' + made.length + ' 条课程（每节一条）');
    else if (t.mode === 'pending') toast('已修改');
    else if (t.mode === 'new') toast(t.forImport ? '已加入列表' : '已添加课程');
    else toast('已保存');
  }

  function deleteCourseFromSheet() {
    var t = state.courseTarget;
    if (!t) return;

    if (t.mode === 'course') {
      var c = findCourse(t.id);
      if (!c) return;
      if (!window.confirm('删除「' + (c.courseName || '未命名课程') + '」？')) return;
      var i = indexOfCourse(t.id);
      if (i >= 0) courses.splice(i, 1);
      saveCourses();
      closeSheet(els.courseSheet);
      renderTimetable();
      toast('已删除课程');
      return;
    }

    if (t.mode === 'pending') {
      state.pending.splice(t.index, 1);
      closeSheet(els.courseSheet);
      renderImport();
      toast('已移出列表');
    }
  }

  /* ============================================================
     十四、粘贴导入：把一段文字解析成课程
     三种来源都走这一条通道：学校网页复制 / 手机文字识别 / 手打
     ============================================================ */

  var RE_TIME = /(\d{1,2})\s*[:.：]\s*(\d{2})\s*[-–—~～至到]\s*(\d{1,2})\s*[:.：]\s*(\d{2})/;
  var RE_WEEKDAY = /(?:周|星期|礼拜)\s*([一二三四五六日天末])/;
  var RE_TEACHER = /([\u4e00-\u9fa5]{1,4}(?:老师|教师|教授))/;
  var RE_LOCATION = /([\u4e00-\u9fa5A-Za-z]{0,8}(?:教学楼|实验楼|计算机楼|综合楼|图书馆|体育馆|操场|机房|实验室|教室|楼|馆|室)\s*[A-Za-z]?\d{0,4})/;
  /* 周次不用正则了：统一交给 parseWeeks()（它认「1到16周」「第1~16周」这些写法） */

  /** 全角数字/冒号转半角 */
  function normalizeText(s) {
    return String(s == null ? '' : s)
      .replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\uFF1A/g, ':')
      .replace(/\u3000/g, ' ')
      .replace(/\r/g, '\n');
  }

  function weekdayCharToNum(ch) {
    if (!ch) return 0;
    if (ch === '日' || ch === '天' || ch === '末') return 7;
    var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
    return map[ch] || 0;
  }

  function findWeekday(s) {
    var m = RE_WEEKDAY.exec(s);
    return m ? weekdayCharToNum(m[1]) : 0;
  }

  function findTimeRange(s) {
    var m = RE_TIME.exec(s);
    if (!m) return null;
    var h1 = +m[1], mi1 = +m[2], h2 = +m[3], mi2 = +m[4];
    if (h1 > 23 || h2 > 23 || mi1 > 59 || mi2 > 59) return null;
    if (h2 * 60 + mi2 <= h1 * 60 + mi1) return null;
    return { start: pad2(h1) + ':' + pad2(mi1), end: pad2(h2) + ':' + pad2(mi2) };
  }

  function findTeacher(s) {
    var m = RE_TEACHER.exec(s);
    return m ? m[1] : '';
  }

  function findLocation(s) {
    var m = RE_LOCATION.exec(s);
    if (!m) return '';
    var v = m[1].trim();
    return v.length >= 2 ? v : '';
  }

  function findWeeks(s) {
    /* 用同一套解析（认「1到16周」「第1~16周」这些），再写成标准写法。
       这里 lenient=false：必须有「周」字样，免得把 08:00-09:40 当成周次 */
    return weeksToText(parseWeeks(s, false));
  }

  /** 把已知字段挖掉，剩下最长的中文串当课程名 */
  function guessCourseName(text, used) {
    var rest = text;
    used.forEach(function (v) { if (v) rest = rest.split(v).join(' '); });
    /* 周次可能是别的写法（1到16周 -> 1-16周），直接按模式再剥一遍 */
    rest = rest.replace(/[0-9０-９\s,，、\-~～—－–到至]*周(?!\s*[一二三四五六日天末])/g, ' ');
    rest = rest.replace(/(?:周|星期|礼拜)\s*[一二三四五六日天末]/g, ' ')
               .replace(/单周|双周/g, ' ')
               .replace(/[0-9:：\-–—~～\s,，、|/\\()（）\[\]【】]+/g, ' ');
    var runs = rest.match(/[\u4e00-\u9fa5]{2,16}/g) || [];
    if (!runs.length) return '';
    runs.sort(function (a, b) { return b.length - a.length; });
    return runs[0];
  }

  function buildCourse(text, wd, tr) {
    var t = String(text || '').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    var teacher = findTeacher(t);
    var location = findLocation(t);
    var weeks = findWeeks(t);
    var wdToken = (RE_WEEKDAY.exec(t) || [''])[0];
    var name = guessCourseName(t, [teacher, location, weeks, wdToken,
                                   tr ? tr.start : '', tr ? tr.end : '']);
    return {
      id: '', courseName: name, teacher: teacher, location: location,
      weekday: wd || 0, startTime: tr ? tr.start : '', endTime: tr ? tr.end : '',
      weeks: weeks, remark: '',
    };
  }

  /* ---- 学校系统导出的「日期/星期几/第几节/班级」表格 ----
     这种格式没有具体时间，只有「第几节课」，时间要靠作息时间表换算 */

  var DEFAULT_PERIODS = [
    ['08:00', '08:40'], ['08:50', '09:30'], ['09:50', '10:30'], ['10:40', '11:20'],
    ['11:30', '12:10'], ['14:00', '14:40'], ['14:50', '15:30'], ['15:40', '16:20'],
    ['16:30', '17:10'], ['19:00', '19:40'],
  ];

  function periods() {
    var p = settings.periods;
    return (p && p.length) ? p : null;      // 没设置就是 null —— 绝不用猜的时间
  }

  function periodsConfigured() {
    return !!(settings.periods && settings.periods.length);
  }

  function periodLen() {
    var n = parseInt(settings.periodLen, 10);
    return (n >= 10 && n <= 120) ? n : 40;   // 一节课默认 40 分钟
  }

  function periodGap() {
    var n = parseInt(settings.periodGap, 10);
    return (n >= 0 && n <= 60) ? n : 10;
  }

  /** 第 n 节课 -> { start, end }；没配到就返回 null */
  function periodTime(n) {
    var list = periods();
    if (!list) return null;
    var v = list[n - 1];
    if (!v || !v[0] || !v[1]) return null;
    return { start: v[0], end: v[1] };
  }

  /** 中文数字转阿拉伯数字，只处理 1-99 的常见写法（一、十、十一、二十…） */
  function cnNum(s) {
    var d = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
              '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    var t = String(s || '');
    if (/^\d+$/.test(t)) return +t;
    if (t.length === 1) return d[t] === undefined ? 0 : d[t];
    var i = t.indexOf('十');
    if (i < 0) return 0;
    var hi = i === 0 ? 1 : d[t.charAt(i - 1)];
    var lo = i === t.length - 1 ? 0 : d[t.charAt(i + 1)];
    if (hi === undefined || lo === undefined) return 0;
    return hi * 10 + lo;
  }

  /** 「第3节」「第 3 节」「第三节」「第3节课」-> 3；认不出来返回 0 */
  function findPeriodNo(s) {
    var m = /第\s*(\d{1,2})\s*节/.exec(String(s || ''));
    if (m) return +m[1];
    m = /第\s*([一二三四五六七八九十]{1,3})\s*节/.exec(String(s || ''));
    return m ? cnNum(m[1]) : 0;
  }

  /** 一行切成单元格：优先按制表符；有些页面复制出来是空格对齐的，再按空白切一次 */
  function splitCells(line) {
    if (line.indexOf('\t') >= 0) return line.split('\t');
    var parts = String(line).trim().split(/\s+/);
    return parts.length >= 3 ? parts : [line];
  }

  /** 表头里是不是有「日期 / 星期 / 节 / 班级」这几列；
      没有表头时（她复制的时候常常只选中数据行）直接看数据行长什么样 */
  function detectSchoolTable(lines) {
    /* ① 有表头 */
    for (var i = 0; i < lines.length; i++) {
      var cells = splitCells(lines[i]);
      if (cells.length < 3) continue;
      var col = { date: -1, week: -1, period: -1, cls: -1 };
      cells.forEach(function (c, j) {
        var t = c.replace(/\s/g, '');
        if (col.date < 0 && /日期|上课日/.test(t)) col.date = j;
        if (col.week < 0 && /星期|周几/.test(t) ) col.week = j;
        if (col.period < 0 && /节/.test(t)) col.period = j;
        if (col.cls < 0 && /班级|班/.test(t)) col.cls = j;
      });
      if (col.date >= 0 && col.period >= 0 && (col.cls >= 0 || col.week >= 0)) {
        return { headIdx: i, col: col };
      }
    }
    /* ② 没表头：找一行的「日期 + 星期X + 第N节」，按这一行推断每一列在哪 */
    for (var k = 0; k < lines.length; k++) {
      var cs = splitCells(lines[k]);
      if (cs.length < 3) continue;
      var c2 = { date: -1, week: -1, period: -1, cls: -1 };
      cs.forEach(function (c, j) {
        var t = c.replace(/\s/g, '');
        if (c2.date < 0 && /^\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}/.test(t)) { c2.date = j; return; }
        if (c2.week < 0 && /^(星期|周|礼拜)[一二三四五六日天末]$/.test(t)) { c2.week = j; return; }
        if (c2.period < 0 && findPeriodNo(t)) { c2.period = j; }
      });
      if (c2.date < 0 || c2.period < 0) continue;
      for (var j2 = 0; j2 < cs.length; j2++) {
        if (j2 === c2.date || j2 === c2.week || j2 === c2.period) continue;
        if (cs[j2].replace(/\s/g, '')) { c2.cls = j2; break; }
      }
      return { headIdx: k - 1, col: c2 };      // headIdx 指到上一行，让调用方从这一行开始
    }
    return null;
  }

  function parseSchoolSchedule(text) {
    var lines = text.split('\n').map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) { return l.trim(); });
    var det = detectSchoolTable(lines);
    if (!det) return null;

    var out = [];
    for (var i = det.headIdx + 1; i < lines.length; i++) {
      var cells = splitCells(lines[i]);
      if (cells.length < 2) continue;

      var dateRaw = (det.col.date >= 0 ? cells[det.col.date] : '').trim();
      var dm = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/.exec(dateRaw);
      if (!dm) continue;
      var date = dm[1] + '-' + pad2(+dm[2]) + '-' + pad2(+dm[3]);

      var weekNo = det.col.week >= 0 ? findWeekday(cells[det.col.week] || '') : 0;
      var period = det.col.period >= 0 ? findPeriodNo(cells[det.col.period] || '') : 0;
      var cls = (det.col.cls >= 0 ? cells[det.col.cls] : '').trim()
        .replace(/\s*,\s*/g, '、').replace(/\s+/g, ' ');

      if (!period && !cls) continue;

      var t = period ? periodTime(period) : null;
      out.push({
        id: '',
        courseName: cls || ('第' + period + '节'),
        teacher: '',
        location: '',
        weekday: weekNo || weekdayOfKey(date),
        startTime: t ? t.start : '',
        endTime: t ? t.end : '',
        weeks: '',
        remark: period ? '第' + period + '节' : '',
        date: date,
        period: period,
      });
    }
    return out.length ? out : null;
  }

  function parseAsTable(text) {
    var lines = text.split('\n').map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) { return l.trim(); });
    if (lines.length < 2) return null;

    var headIdx = -1, headCount = 0, headMap = {};
    lines.forEach(function (l, i) {
      if (l.indexOf('\t') < 0) return;
      var cells = l.split('\t'), map = {}, cnt = 0;
      cells.forEach(function (c, j) {
        var wd = findWeekday(c);
        if (wd) { map[j] = wd; cnt++; }
      });
      if (cnt > headCount) { headCount = cnt; headIdx = i; headMap = map; }
    });
    if (headCount < 2) return null;   // 不像表格，交给按行解析

    var out = [];
    for (var i = headIdx + 1; i < lines.length; i++) {
      var cells = lines[i].split('\t');
      var tr = null, trCol = -1;
      for (var j = 0; j < cells.length; j++) {
        var t2 = findTimeRange(cells[j]);
        if (t2) { tr = t2; trCol = j; break; }
      }
      if (!tr) continue;
      Object.keys(headMap).forEach(function (k) {
        var col = +k;
        var cell = (cells[col] || '').trim();
        if (col === trCol || !cell) return;
        out.push(buildCourse(cell, headMap[col], tr));
      });
    }
    return out.length ? out : null;
  }

  /** 按行解析：一行一门课；没时间的行先攒着，遇到时间行再合并 */
  function parseAsLines(text) {
    var lines = text.split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l !== ''; });
    var out = [], carry = [];

    lines.forEach(function (l) {
      var tr = findTimeRange(l);
      if (!tr) {
        /* 没时间的行：先试着补上前一门缺的字段（周次/地点/教师常单独占一行） */
        var prev = out[out.length - 1];
        if (prev) {
          var weeks = findWeeks(l), loc = findLocation(l), tea = findTeacher(l);
          var filled = false;
          if (weeks && !prev.weeks) { prev.weeks = weeks; filled = true; }
          if (loc && !prev.location) { prev.location = loc; filled = true; }
          if (tea && !prev.teacher) { prev.teacher = tea; filled = true; }
          if (!filled && !prev.courseName) {
            var nm = guessCourseName(l, []);
            if (nm) { prev.courseName = nm; filled = true; }
          }
          if (filled) return;
        }
        carry.push(l);
        return;
      }
      var merged = carry.concat([l]).join(' ');
      carry = [];
      out.push(buildCourse(merged, findWeekday(merged), tr));
    });
    return out;
  }

  function dedupeCourses(list) {
    var seen = {}, out = [];
    list.forEach(function (c) {
      /* 去重的「同一节课」= 同一天（或同一星期）+ 同一节次/时间 + 同一个班。
         必须带上 date 和 period：否则「周四第1节高三11班」和「周四第2节高三11班」
         会被当成重复，白白丢掉一节 40 分钟的工时 */
      var k = [c.date || '', c.weekday, c.period || '', c.startTime, c.endTime,
               c.courseName, c.location].join('|');
      if (seen[k]) return;
      seen[k] = 1;
      out.push(c);
    });
    return out;
  }

  /**
   * 解析课表文字 -> { courses, unparsed }
   * 解析不出来的行会原样回给用户看，绝不静默丢弃
   */
  function parseTimetableText(raw) {
    var text = normalizeText(raw);

    /* 先认「学校系统导出的那种」：日期 / 星期几 / 第几节 / 班级 */
    var school = parseSchoolSchedule(text);
    if (school) {
      return { courses: dedupeCourses(school), unparsed: [], tableMode: true, schoolMode: true };
    }

    var tableResult = parseAsTable(text);
    var list = tableResult || parseAsLines(text);

    /* 一行都没解析出来时，退一步：整段当成一行再试一次 */
    if (!list.length) {
      var whole = text.replace(/\n/g, ' ');
      var tr = findTimeRange(whole);
      if (tr) list = [buildCourse(whole, findWeekday(whole), tr)];
    }

    list = dedupeCourses(list.filter(function (c) { return c.courseName || c.startTime; }));

    var unparsed = [];
    if (!tableResult) {
      text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (l) {
        if (!findTimeRange(l) && !findWeeks(l) && !findLocation(l) &&
            !findTeacher(l) && !findWeekday(l) && !guessCourseName(l, [])) {
          unparsed.push(l);
        }
      });
    }

    return { courses: list, unparsed: unparsed, tableMode: !!tableResult };
  }

  /* ============================================================
     十五、课表时间并入工时
     今日工时 = 打卡时段 ∪ 当天课程时段（重叠只算一次）
     ============================================================ */

  function startOfWeekMs(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    var back = (d.getDay() + 6) % 7;          // 周一算一周开始
    return d.getTime() - back * 86400000;
  }

  function semesterStartMs() {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(settings.semesterStart || ''));
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  }

  /** 现在是第几周；没设学期开始日期就返回 0（表示「不知道」） */
  function currentWeekNo(now) {
    var s = semesterStartMs();
    if (!s) return 0;
    var diff = startOfWeekMs(now || Date.now()) - startOfWeekMs(s);
    var n = Math.floor(diff / (7 * 86400000)) + 1;
    return n > 0 ? n : 0;
  }

  var CN_NUM_CHARS = '零一二三四五六七八九十两';

  /** 把中文数字换成阿拉伯数字，并把各种连接号统一成 '-'。
     注意先把「周一 / 星期三」这种星期说法去掉 —— 那是星期几，不是第几周 */
  function normalizeWeekText(s) {
    return String(s || '')
      .replace(/(?:周|星期|礼拜)\s*[一二三四五六日天末]/g, ' ')
      .replace(/[到至~～—－–﹣]/g, '-')
      .replace(new RegExp('[' + CN_NUM_CHARS + ']{1,4}', 'g'), function (m) {
        var n = cnNum(m);
        return n ? String(n) : m;
      });
  }

  /**
   * 解析周次。她怎么写都要认：
   *   4周 / 第4周 / 第4 / 4            单周 / 双周 / 每周
   *   1-16周 / 1~16 / 第1到16周 / 13到23   （到、至、~、—、– 都当连接号）
   *   1、3、5周 / 1,3-5周 / 第十三到二十周
   *
   * lenient=true 允许只写数字（「周次」输入框里她就常写「4」或「13到23」）；
   * lenient=false 必须有「周」字样（解析整行课表时用，免得把 08:00-09:40 当成周次）。
   * 返回 null 表示「没填 / 认不出」。
   */
  function parseWeeks(text, lenient) {
    var t = String(text || '');
    if (!t.trim()) return null;
    if (/单双周|每周|全周|全学期/.test(t)) return { type: 'all' };
    if (/单周/.test(t)) return { type: 'odd' };
    if (/双周/.test(t)) return { type: 'even' };

    var norm = normalizeWeekText(t);
    /* 优先只看「贴着『周』的那段数字」，这样整行里的 08:00-09:40 不会被当成周次 */
    var segs = norm.match(/[0-9\s,，、\-]*周/g);
    var scan = segs ? segs.join(' ') : (lenient ? norm : '');
    if (!scan) return null;

    var set = {}, hit = false;
    var re = /(\d{1,2})(?:\s*-\s*(\d{1,2}))?/g, m;
    while ((m = re.exec(scan)) !== null) {
      var a = parseInt(m[1], 10);
      var b = m[2] ? parseInt(m[2], 10) : a;
      if (!(a >= 1 && a <= 30)) continue;
      if (!(b >= 1 && b <= 30)) b = a;
      if (b < a) { var x = a; a = b; b = x; }
      for (var i = a; i <= b; i++) set[i] = 1;
      hit = true;
    }
    if (!hit) return null;
    var weeks = Object.keys(set).map(Number).sort(function (p, q) { return p - q; });
    return { type: 'list', weeks: weeks };
  }

  /** 把解析结果写回成标准写法：1-16周 / 单周 / 1、3、5周 */
  function weeksToText(w) {
    if (!w) return '';
    if (w.type === 'all') return '每周';
    if (w.type === 'odd') return '单周';
    if (w.type === 'even') return '双周';
    var list = w.weeks, parts = [], i = 0;
    while (i < list.length) {
      var j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      parts.push(j > i ? list[i] + '-' + list[j] : String(list[i]));
      i = j + 1;
    }
    return parts.join('、') + '周';
  }

  /** 填了周次但认不出（界面要提醒她），返回 true */
  function weeksUnclear(text) {
    return !!String(text == null ? '' : text).trim() && !parseWeeks(text, true);
  }

  /** 这门课在第 weekNo 周上不上？周次没填、或不知道第几周 -> 都算上（宁可多算也不漏） */
  function courseInWeek(weeksText, weekNo) {
    if (!weekNo) return true;
    var w = parseWeeks(weeksText, true);
    if (!w || w.type === 'all') return true;
    if (w.type === 'odd') return weekNo % 2 === 1;
    if (w.type === 'even') return weekNo % 2 === 0;
    return w.weeks.indexOf(weekNo) >= 0;
  }

  function weekdayOfKey(day) {
    var d = keyToDate(day).getDay();
    return d === 0 ? 7 : d;
  }

  /* ============================================================
     周次：结构化存储 + 唯一的「这门课今天上不上」判定
     ------------------------------------------------------------
     以前有两个严重 bug（用户实测报的）：
       ① classSpans 用的周次是「现在这一刻是第几周」，而不是「那一天是第几周」。
          于是所有「第4周」的课在 1、2、3 月的每一个同星期都出现，第4周自己反而不出现。
       ② weekNo 算不出来时（没设学期开始日期，或那一天在开学之前）被当成「每周都上」，
          于是开学前那一周（8/17）也显示课程。
     现在：判定只有一个入口 courseOccursOn()，周视图 / 日历 / 日明细 / 工时全部用它；
          周次也从「解析中文字符串」改成结构化字段 weekNums（字符串只留给显示）。
     ============================================================ */

  /** 把结构写回成显示文本（和 weeksToText 对称，给只有 weekNums 的数据用） */
  function weeksToTextFromSpec(spec) {
    if (!spec) return '';
    if (spec === 'all') return '每周';
    if (spec === 'odd') return '单周';
    if (spec === 'even') return '双周';
    return weeksToText({ type: 'list', weeks: spec });
  }

  /** 周次文本 -> 结构：null（没填/认不出）| 'all' | 'odd' | 'even' | [4,8] */
  function weeksToSpec(text) {
    var w = parseWeeks(text, true);
    if (!w) return null;
    if (w.type === 'all') return 'all';
    if (w.type === 'odd') return 'odd';
    if (w.type === 'even') return 'even';
    return w.weeks.slice();
  }

  /** 两份周次表示是不是同一个意思（'all' / [1,2] 这类） */
  function sameWeeksSpec(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
      return true;
    }
    return false;
  }

  /** 这一天是学期第几周：没设基准 -> 0（不知道）；在开学之前 -> 0（还没开学） */
  function weekNoOfKey(day) {
    var s = semesterStartMs();
    if (!s) return 0;
    var diff = startOfWeekMs(keyToDate(day).getTime()) - startOfWeekMs(s);
    var n = Math.floor(diff / (7 * 86400000)) + 1;
    return n >= 1 ? n : 0;
  }

  /**
   * 这门课在那一天上不上？ —— 全 App 只有这一个判定：
   *   ① 指定了具体日期（学校导出的那种）-> 只在那一天
   *   ② 否则看星期对不对
   *   ③ 再看周次：没填 = 每周；单周/双周/具体周次都要跟「那一天的周次」比
   *   ④ 需要按周次排、但基准不知道（没设学期开始日期 / 那天在开学前）-> **不猜，不出现**
   */
  function courseOccursOn(c, day) {
    if (c.date) return c.date === day;
    if (c.weekday !== weekdayOfKey(day)) return false;
    var spec = (c.weekNums === undefined) ? weeksToSpec(c.weeks) : c.weekNums;
    if (!spec || spec === 'all') return true;          // 没填周次 = 每周
    var wk = weekNoOfKey(day);
    if (!wk) return false;                             // 要按周次排但不知道第几周 -> 不出现
    if (spec === 'odd') return wk % 2 === 1;
    if (spec === 'even') return wk % 2 === 0;
    return spec.indexOf(wk) >= 0;
  }

  /** 这门课需不需要「学期开始日期」才能判断（界面用它来提醒/标记） */
  function courseNeedsBasis(c) {
    if (c.date) return false;
    var spec = (c.weekNums === undefined) ? weeksToSpec(c.weeks) : c.weekNums;
    if (!spec || spec === 'all') return false;
    return !semesterStartMs();
  }

  /**
   * 那天排了哪些课（**计划视图**：不看现在几点、未来的日子也算）。
   * 周视图和日历明细用它 —— 两边必须一致。
   */
  function plannedClasses(day) {
    var out = [];
    courses.forEach(function (c) {
      if (!courseOccursOn(c, day)) return;
      var st = c.startTime, en = c.endTime;
      if ((!st || !en) && c.period) {
        var pt = periodTime(c.period);
        if (pt) { st = pt.start; en = pt.end; }
      }
      if (!st || !en) return;
      var s = hmToMs(day, st), e = hmToMs(day, en);
      if (e <= s) return;
      out.push({ start: s, end: e, scheduledEnd: e, live: false, course: c });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  /**
   * 某天的课程时段（**工时视图**）：过去的日子整天算完、今天按现在裁剪、以后的日子不算。
   * 首页今日工时 / 月统计 / 时薪 / 日历格子里的小时数用它。
   */
  function classSpans(day, now) {
    var at = now || Date.now();
    var isToday = (day === today);
    var out = [];
    /* 以后的日子还没发生，整天都不算；过去的日子整天都算完；
       只有「今天」才按现在的时刻裁剪 */
    if (!isToday && day > today) return out;
    plannedClasses(day).forEach(function (sp) {
      if (isToday && sp.start > at) return;            // 今天还没开始的课，先不算工时
      var live = isToday && sp.scheduledEnd > at;
      out.push({
        start: sp.start,
        end: live ? at : sp.scheduledEnd,              // 超过现在的部分不算
        scheduledEnd: sp.scheduledEnd,
        live: live,
        course: sp.course,
      });
    });
    return out;
  }

  function punchSpans(day, now) {
    return sessionsOf(day).map(function (s) {
      return { start: s.start, end: s.end === null ? now : s.end };
    });
  }

  /** 合并重叠区间 —— 「剔除重叠」就是这一步 */
  function mergeSpans(spans) {
    var list = spans.filter(function (s) { return s.end > s.start; })
      .sort(function (a, b) { return a.start - b.start; });
    var out = [];
    list.forEach(function (s) {
      var last = out[out.length - 1];
      if (last && s.start <= last.end) {
        if (s.end > last.end) last.end = s.end;
      } else {
        out.push({ start: s.start, end: s.end });
      }
    });
    return out;
  }

  function spanSum(merged) {
    return merged.reduce(function (a, s) { return a + (s.end - s.start); }, 0);
  }

  /** 某天的实际工时（打卡 ∪ 课程，重叠只算一次） */
  function dayWorkMs(day, now) {
    return Math.max(0, spanSum(mergeSpans(punchSpans(day, now).concat(classSpans(day, now)))));
  }

  /** 课表替今天「补」出来的时长（打卡之外的部分） */
  function classExtraMs(day, now) {
    var withClass = spanSum(mergeSpans(punchSpans(day, now).concat(classSpans(day, now))));
    var punchOnly = spanSum(mergeSpans(punchSpans(day, now)));
    return Math.max(0, withClass - punchOnly);
  }

  /* ---------- 粘贴导入的界面逻辑 ---------- */

  function showPasteMsg(text, kind) {
    els.pasteMsg.textContent = text;
    els.pasteMsg.className = 'form-msg is-' + kind;
    els.pasteMsg.hidden = false;
  }

  function openPaste() {
    els.pasteInput.value = '';
    els.pasteMsg.hidden = true;
    openSheet(els.pasteSheet);
  }

  function doParsePaste() {
    var raw = els.pasteInput.value;
    if (!raw || !raw.trim()) { showPasteMsg('还没粘贴内容', 'error'); return; }

    var res = parseTimetableText(raw);
    if (!res.courses.length) {
      showPasteMsg('没解析出课程。可以试试一行写一门课，比如：高等数学 张老师 A101 周一 08:00-09:40 1-16周', 'error');
      return;
    }

    /* 加进「待导入列表」，用户核对修改后再确认导入 */
    res.courses.forEach(function (c) { state.pending.push(cleanCourse(c)); });

    var msg = '解析出 ' + res.courses.length + ' 门课，已加入列表，请核对';
    if (res.unparsed.length) msg += '；有 ' + res.unparsed.length + ' 行没认出来（可手动补充）';
    closeSheet(els.pasteSheet);
    renderImport();
    toast(msg);
  }

  /* ---------- 学期开始日期 ---------- */

  function openWeekSheet() {
    els.weekInput.value = settings.semesterStart || '';
    els.weekMsg.hidden = true;
    openSheet(els.weekSheet);
  }

  function saveWeekStart() {
    var v = els.weekInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      els.weekMsg.textContent = '请选择日期';
      els.weekMsg.className = 'form-msg is-error';
      els.weekMsg.hidden = false;
      return;
    }
    settings.semesterStart = v;
    saveSettings();
    closeSheet(els.weekSheet);
    renderTimetable();
    renderAll();
    var wk = currentWeekNo();
    toast(wk ? '已设置，现在是第 ' + wk + ' 周' : '已设置学期开始日期');
  }

  /** 课表周视图翻周：-1 上一周 / 1 下一周 / 'now' 回到本周 */
  function shiftWeek(delta) {
    state.ttWeekOffset = (delta === 'now') ? 0 : (state.ttWeekOffset || 0) + delta;
    if (state.ttWeekOffset > 52) state.ttWeekOffset = 52;
    if (state.ttWeekOffset < -52) state.ttWeekOffset = -52;
    renderTimetable();
  }

  function renderWeekBar() {
    if (!els.ttWeek) return;
    els.ttWeek.hidden = courses.length === 0;
    var wk = currentWeekNo();
    var s = semesterStartMs();
    var needBasis = courses.some(function (c) { return courseNeedsBasis(c); });
    if (!s) {
      /* 基准没设：按周次排的课根本没法知道是哪一天，必须让她先设 —— 不猜 */
      els.ttWeekText.textContent = needBasis
        ? '还没设学期开始日期 —— 按周次排的课现在不会出现，先设一下'
        : '还没设学期开始日期 —— 「周次」不起作用，也不知道现在第几周';
      els.ttWeekText.classList.add('is-warn');
      els.ttWeekBtn.textContent = '去设置';
    } else {
      var d = new Date(s);
      /* 明确写出基准：第 1 周从哪一天算起（她要有据可查） */
      els.ttWeekText.textContent = '学期开始 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日' +
        '（第 1 周从 ' + fmtDayKey(dayKey(new Date(startOfWeekMs(s)))) + ' 算起） · 今天是第 ' + (wk || 1) + ' 周';
      els.ttWeekText.classList.remove('is-warn');
      els.ttWeekBtn.textContent = '修改';
    }
  }

  /* ---------- 作息时间表设置 ---------- */

  /** 打开时的工作副本：一行 = [开始, 结束] */
  var periodDraft = [];

  function hmToMin(hm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : -1;
  }

  function minToHM(min) {
    min = Math.max(0, Math.min(23 * 60 + 59, min));
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }

  /** 一行 = 开始 + 结束，两格都能单独改（白天 40 分钟，晚辅可以更长，不写死） */
  function renderPeriodRows() {
    var len = periodLen();
    var html = '';
    periodDraft.forEach(function (row, i) {
      var start = row[0] || '';
      var end = row[1] || '';
      var dur = (start && end) ? (hmToMin(end) - hmToMin(start)) : 0;
      var durText = dur > 0 ? '共 ' + dur + ' 分钟'
        : (start && end ? '结束要晚于开始' : (start || end ? '只填了一半' : '没填'));
      html += '<div class="period-row" data-row="' + i + '">' +
          '<span class="period-name">第' + (i + 1) + '节</span>' +
          '<input class="period-input" type="time" step="60" data-pi="' + i + '" value="' + start +
            '" aria-label="第' + (i + 1) + '节开始时间">' +
          '<span class="period-dash">到</span>' +
          '<input class="period-input period-input-end" type="time" step="60" data-pe="' + i + '" value="' + end +
            '" aria-label="第' + (i + 1) + '节结束时间">' +
          '<span class="period-end' + (dur > 0 ? '' : ' is-warn') + '">' + durText + '</span>' +
        '</div>';
    });
    els.periodList.innerHTML = html;
  }

  function openPeriodSheet() {
    /* 有设置就用设置；没有就先用一套常见作息当草稿，她照着改 */
    periodDraft = periodsConfigured()
      ? settings.periods.map(function (r) { return [r[0] || '', r[1] || '']; })
      : DEFAULT_PERIODS.map(function (r) { return [r[0], r[1]]; });
    els.pbStart.value = periodDraft.length ? periodDraft[0][0] : '08:00';
    els.pbLen.value = periodLen();
    els.pbGap.value = periodGap();
    els.pbCount.value = periodDraft.length;
    els.periodMsg.hidden = true;
    renderPeriodRows();
    openSheet(els.periodSheet);
  }

  /** 批量：第1节开始 + 默认每节时长 + 课间休息 + 几节 -> 整张表
      （生成之后每一节都能单独改时长，比如晚辅改成 19:00–21:00） */
  function batchFillPeriods() {
    var start = els.pbStart.value;
    if (!/^\d{1,2}:\d{2}$/.test(start)) {
      els.periodMsg.textContent = '请先选「第 1 节开始」的时间';
      els.periodMsg.className = 'form-msg is-error';
      els.periodMsg.hidden = false;
      return;
    }
    var len = parseInt(els.pbLen.value, 10);
    var gap = parseInt(els.pbGap.value, 10);
    var cnt = parseInt(els.pbCount.value, 10);
    if (!(len >= 10 && len <= 240)) len = 40;
    if (!(gap >= 0 && gap <= 60)) gap = 10;
    if (!(cnt >= 1 && cnt <= 20)) cnt = 8;

    settings.periodLen = len;
    settings.periodGap = gap;
    saveSettings();

    var t = hmToMin(start);
    periodDraft = [];
    for (var i = 0; i < cnt; i++) {
      var s = minToHM(t + i * (len + gap));
      periodDraft.push([s, minToHM(hmToMin(s) + len)]);
    }
    els.periodMsg.hidden = true;
    renderPeriodRows();
    toast('已按规则填好 ' + cnt + ' 节，晚辅那几节单独改一下时长就行');
  }

  /** 她改某一节的开始时间时：时长保持不变（晚辅改过 120 分钟，不会被改回 40） */
  function onPeriodStartInput(i, value) {
    if (!periodDraft[i]) return;
    var oldStart = periodDraft[i][0], oldEnd = periodDraft[i][1];
    var keep = (oldStart && oldEnd && hmToMin(oldEnd) > hmToMin(oldStart))
      ? hmToMin(oldEnd) - hmToMin(oldStart) : periodLen();
    periodDraft[i][0] = value;
    if (/^\d{1,2}:\d{2}$/.test(value)) {
      periodDraft[i][1] = minToHM(hmToMin(value) + keep);
    }
  }

  function onPeriodEndInput(i, value) {
    if (!periodDraft[i]) return;
    periodDraft[i][1] = value;
  }

  /** 作息表里任何一格改了：同步到草稿，并且只更新那一行右边那句提示，不整表重画
      （整表重画会让正在输入的时间框失去焦点） */
  function onPeriodRowChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var pi = t.getAttribute('data-pi');
    var pe = t.getAttribute('data-pe');
    if (pi === null && pe === null) return;
    var i = parseInt(pi !== null ? pi : pe, 10);
    if (isNaN(i) || !periodDraft[i]) return;
    if (pi !== null) onPeriodStartInput(i, t.value);
    else onPeriodEndInput(i, t.value);

    var row = t.parentNode;
    if (!row) return;
    if (pi !== null) {
      var endBox = row.querySelector('.period-input-end');
      if (endBox && periodDraft[i][1] && endBox.value !== periodDraft[i][1]) endBox.value = periodDraft[i][1];
    }
    var tip = row.querySelector('.period-end');
    if (!tip) return;
    var a = periodDraft[i][0], b = periodDraft[i][1];
    var dur = (a && b && hmToMin(b) > hmToMin(a)) ? hmToMin(b) - hmToMin(a) : 0;
    tip.textContent = dur > 0 ? '共 ' + dur + ' 分钟'
      : ((a || b) ? (hmToMin(b) <= hmToMin(a) ? '结束要晚于开始' : '只填了一半') : '没填');
    tip.className = 'period-end' + (dur > 0 ? '' : ' is-warn');
  }

  function savePeriods() {
    var starts = els.periodList.querySelectorAll('.period-input[data-pi]');
    var ends = els.periodList.querySelectorAll('.period-input[data-pe]');
    var out = [], problems = [], filled = 0;
    for (var i = 0; i < periodDraft.length; i++) {
      var a = starts[i] ? starts[i].value : '';
      var b = ends[i] ? ends[i].value : '';
      var aOk = /^\d{1,2}:\d{2}$/.test(a);
      var bOk = /^\d{1,2}:\d{2}$/.test(b);
      if (!aOk && !bOk) { out.push(['', '']); continue; }        // 整行没填：这节就是没设
      if (aOk !== bOk) { problems.push('第' + (i + 1) + '节只填了一半'); out.push(['', '']); continue; }
      if (hmToMin(b) <= hmToMin(a)) {
        problems.push('第' + (i + 1) + '节的结束时间要在开始时间之后');
        out.push(['', '']);
        continue;
      }
      out.push([a, b]);
      filled++;
    }
    if (problems.length) {
      els.periodMsg.textContent = problems.join('；') + ' —— 请改好再保存';
      els.periodMsg.className = 'form-msg is-error';
      els.periodMsg.hidden = false;
      return;
    }
    settings.periods = out;
    saveSettings();
    /* 改完作息表：已经按节次存着的课，时间一次性全部跟着更新
       （她要的「自动匹配到对应节数」——课表说第几节几点，课就几点） */
    courses.forEach(function (c) {
      if (!c.period) return;
      var pt2 = periodTime(c.period);
      if (pt2) { c.startTime = pt2.start; c.endTime = pt2.end; }
    });
    courses = courses.map(function (c) { return cleanCourse(c, c.id); });
    saveCourses();
    closeSheet(els.periodSheet);
    renderTimetable();
    renderAll();
    toast(filled ? '作息时间表已保存（' + filled + ' 节）' : '作息时间表已清空');
  }

  /** 课表里有没有「只有第几节、没有具体时间」的课 —— 有的话就要设作息时间表 */
  function needsPeriodTimes() {
    return courses.some(function (c) { return !!c.period && !c.startTime; });
  }

  function renderPeriodBar() {
    if (!els.ttPeriod) return;
    var need = needsPeriodTimes();      // 有「只有节次」的课还没设作息表 -> 必须提示
    var have = periodsConfigured();     // 设过就一直显示入口，方便她随时改（比如晚辅时长变了）
    els.ttPeriod.hidden = !(need || have);
    if (els.ttPeriod.hidden) return;
    if (have) {
      els.ttPeriodText.textContent = '作息时间表：已设置 ' + settings.periods.length +
        ' 节 · 默认 ' + periodLen() + ' 分钟一节（每节都能单独改）';
      els.ttPeriodText.classList.remove('is-warn');
      els.ttPeriodBtn.textContent = '修改';
    } else {
      els.ttPeriodText.textContent = '作息时间表还没设置（不设的话「第几节」算不出时间）';
      els.ttPeriodText.classList.add('is-warn');
      els.ttPeriodBtn.textContent = '去设置';
    }
  }

  /* ============================================================
     十六、情绪价值：打卡反馈文案
     文案本体在 messages/ 目录里，这里只负责「挑哪一条」
     ============================================================ */

  var recentMsgs = [];        // 最近说过的，避免短时间内重复
  var RECENT_MAX = 15;
  var MSG = function () { return window.WL_MSG || {}; };

  function msgText(m) {
    return (typeof m === 'string') ? m : ((m && m.text) || '');
  }

  /** 支持 {n} 段数、{h} 小时、{m} 分钟 */
  function fillVars(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (all, key) {
      return (vars[key] === undefined || vars[key] === null) ? all : String(vars[key]);
    });
  }

  /** 从一组文案里随机取一条，尽量避开最近说过的 */
  function pickFrom(pool, vars) {
    if (!pool || !pool.length) return '';
    var texts = [];
    for (var i = 0; i < pool.length; i++) {
      var t = msgText(pool[i]);
      if (t) texts.push(t);
    }
    if (!texts.length) return '';

    var avail = [];
    for (var j = 0; j < texts.length; j++) {
      if (recentMsgs.indexOf(texts[j]) < 0) avail.push(texts[j]);
    }
    if (!avail.length) {
      // 这一类的都抽过一遍了 -> 只把这一类的记录清掉，其它类保留
      var kept = [];
      for (var k = 0; k < recentMsgs.length; k++) {
        if (texts.indexOf(recentMsgs[k]) < 0) kept.push(recentMsgs[k]);
      }
      recentMsgs = kept;
      avail = texts;
    }

    var chosen = avail[Math.floor(Math.random() * avail.length)];
    recentMsgs.push(chosen);
    while (recentMsgs.length > RECENT_MAX) recentMsgs.shift();
    return fillVars(chosen, vars);
  }

  /** 深夜档位：21 / 22 / 23 / 0（凌晨） */
  function lateTierKey(hour) {
    if (hour < 6) return '0';
    if (hour >= 23) return '23';
    if (hour >= 22) return '22';
    if (hour >= 21) return '21';
    return '';
  }

  /** 今日累计工时 -> 下班文案分档 */
  function endBucketKey(minutes) {
    if (minutes < 60) return 'lt60';
    if (minutes < 180) return '60-180';
    if (minutes < 360) return '180-360';
    if (minutes < 480) return '360-480';
    if (minutes < 600) return '480-600';
    if (minutes < 720) return '600-720';
    return 'gte720';
  }

  function isWeekendDay(d) {
    var w = d.getDay();
    return w === 0 || w === 6;
  }

  /** 按 scope 过滤深夜文案（in / out / any） */
  function latePool(key, kind) {
    var table = MSG().lateNight;
    if (!table || !table[key]) return null;
    var out = [];
    for (var i = 0; i < table[key].length; i++) {
      var m = table[key][i];
      var sc = (m && m.scope) || 'any';
      if (sc === 'any' || sc === kind) out.push(m);
    }
    return out;
  }

  /** 依次尝试一组文案池，返回第一个能抽到内容的 */
  function pickFromChain(chain, vars, generalChance) {
    for (var i = 0; i < chain.length; i++) {
      var isLast = (i === chain.length - 1);
      // 只有轮到最后一档（普通情况）时，才有机会抽「通用鼓励」，
      // 深夜 / 超长工时 / 周末 / 多段这些特殊情况永远用自己的文案
      if (isLast && generalChance && Math.random() < generalChance) {
        var g = pickFrom(MSG().general, vars);
        if (g) return g;
      }
      var t = pickFrom(chain[i], vars);
      if (t) return t;
    }
    return '';
  }

  /** 只留下「占位符都填得上」的文案：缺变量的会被丢掉，
      绝不会让「又给工资池加了 {amt}」这种半成品显示出去 */
  function fillablePool(pool, vars) {
    if (!pool || !pool.length) return null;
    var out = [];
    for (var i = 0; i < pool.length; i++) {
      var t = msgText(pool[i]);
      if (!t) continue;
      var ok = true, m, re = /\{(\w+)\}/g;
      while ((m = re.exec(t))) {
        if (vars[m[1]] === undefined || vars[m[1]] === null) { ok = false; break; }
      }
      if (ok) out.push(pool[i]);
    }
    return out.length ? out : null;
  }

  /** 工资池文案要用的变量（万元户也不怕，都是格式化好的字符串） */
  function salaryVars(info, amt) {
    var v = {
      pool: fmtMoney2(info.amount),
      pct: fmtPercent(info.percent),
      left: fmtDurPlain(info.remainMs),
      hour: fmtRate(info.perHour),
    };
    if (amt !== undefined && amt !== null) v.amt = fmtMoney(amt);
    return v;
  }

  /**
   * 挑文案。原则：情况越极端，越要说对应的话。
   *
   * 上班：深夜 > 工资池 > 第 2 段及以后 > 周末 > 普通上班
   * 下班：≥12 小时 > 深夜(23点后) > ≥10 小时 > 工资池 > 深夜(21-22点) > 周末 > 按累计工时分档
   *
   * 工资池那批文案只在「月工资 + 目标工时都设了」的时候才有机会被抽到
   * （没设置就不提钱，免得出现 ¥0 或者空白）。
   */
  function pickPunchMessage(kind, ctx) {
    var M = MSG();
    var minutes = ctx.minutesToday || 0;
    var lateKey = lateTierKey(ctx.hour);
    var veryLate = (ctx.hour >= 23 || ctx.hour < 6);
    var vars = { n: ctx.sessionIndex, h: Math.floor(minutes / 60), m: minutes % 60 };
    var chain = [];

    /* 工资池文案：上班那批不需要金额，下班那批要有「今天新增」才用 */
    var salaryPool = null;
    if (ctx.salaryInfo && ctx.salaryInfo.ok) {
      var raw = M.salary && M.salary[kind];
      if (kind === 'out') {
        /* 不足 1 分钱的增量就不提钱了，免得说出「+¥0」这种废话 */
        if (ctx.salaryToday >= 0.005) {
          var sv = salaryVars(ctx.salaryInfo, ctx.salaryToday);
          Object.keys(sv).forEach(function (k) { vars[k] = sv[k]; });
          salaryPool = fillablePool(raw, vars);
        }
      } else {
        var sv2 = salaryVars(ctx.salaryInfo);
        Object.keys(sv2).forEach(function (k) { vars[k] = sv2[k]; });
        salaryPool = fillablePool(raw, vars);
      }
    }

    if (kind === 'in') {
      if (lateKey) chain.push(latePool(lateKey, 'in'));
      if (salaryPool && Math.random() < 0.5) chain.push(salaryPool);
      if (ctx.sessionIndex >= 2 && M.session) {
        chain.push(M.session[String(Math.min(ctx.sessionIndex, 6))]);
      }
      if (ctx.isWeekend) chain.push(M.weekend);
      chain.push(M.start);
      chain.push(M.general);
      return pickFromChain(chain, vars, 0.25);
    }

    /* ---- 下班 ---- */
    if (minutes >= 720) chain.push(M.end && M.end.gte720);      // 最要紧：明确提醒收工
    if (veryLate && lateKey) chain.push(latePool(lateKey, 'out'));
    if (minutes >= 600) chain.push(M.end && M.end['600-720']);
    if (salaryPool && Math.random() < 0.5) chain.push(salaryPool);
    if (lateKey && !veryLate) chain.push(latePool(lateKey, 'out'));
    if (ctx.isWeekend) chain.push(M.weekend);
    chain.push(M.end && M.end[endBucketKey(minutes)]);
    chain.push(M.general);
    return pickFromChain(chain, vars, 0.25);
  }

  /** 把当前状态整理成挑文案需要的上下文（含工资池信息） */
  function messageContext(now) {
    var at = now || Date.now();
    var d = new Date(at);
    var open = openSessionOf(today);
    var info = salaryNow(at);
    return {
      hour: d.getHours(),
      minutesToday: Math.floor(dayWorkMs(today, at) / MIN),
      sessionMinutes: open ? Math.floor((at - open.s.start) / MIN) : 0,
      sessionIndex: sessionsOf(today).length,
      isWeekend: isWeekendDay(d),
      salaryInfo: info,
      salaryToday: info.ok ? todayAddedProgress(info, at) : 0,
    };
  }

  /* ---------- 首页常驻鼓励语 ----------
     不做弹窗：这句话一直显示在首页，打卡 / 跨过连续工作档位时换一句，
     点一下也能再换一句（隐藏触发）。 */

  function setHeroMessage(text, animate) {
    if (!text) return;
    state.heroMsg = text;
    if (!els.heroMsg) return;
    els.heroMsg.textContent = text;
    if (animate) {
      els.heroMsg.classList.remove('is-new');
      void els.heroMsg.offsetHeight;
      els.heroMsg.classList.add('is-new');
    }
  }

  /** 点那句话时：按当前情况再抽一句 */
  function refreshHeroMessage() {
    var open = openSessionOf(today);
    var text = pickFrom(MSG().general, {});
    if (!text && open) text = '你已经工作 ' + fmtDur(Date.now() - open.s.start) + ' 了。';
    setHeroMessage(text || '打卡成功，人还活着。', true);
  }

  /* ---------- 连续工作提醒（善意提醒，不阻止继续工作） ---------- */

  var REST_TIERS = [240, 180, 120];
  var restState = { sessionStart: 0, shown: {} };

  function checkRestNudge(now) {
    var open = openSessionOf(today);
    if (!open) {
      restState.sessionStart = 0;
      restState.shown = {};
      return false;
    }
    if (restState.sessionStart !== open.s.start) {
      restState.sessionStart = open.s.start;
      restState.shown = {};
    }

    var mins = Math.floor((now - open.s.start) / MIN);
    for (var i = 0; i < REST_TIERS.length; i++) {
      var tier = REST_TIERS[i];
      if (mins < tier) continue;
      if (restState.shown[tier]) return false;
      for (var j = i; j < REST_TIERS.length; j++) restState.shown[REST_TIERS[j]] = true;
      var msg = pickFrom(MSG().rest && MSG().rest[String(tier)]);
      if (msg) {
        setHeroMessage(msg, true);
        // 正在看别的页面时，用一条轻提示把它带过去，免得错过
        if (state.view !== 'today') toast(msg);
        return true;
      }
      return false;
    }
    return false;
  }

  /* ---------- 工资池整点提示（别刷屏：每满 1 小时才说一次） ---------- */

  var salState = { sessionStart: 0, lastHour: 0 };
  var SAL_NUDGE_MAX = 4;      // 一段里最多报 4 次账（再多就成了骚扰）
  var SAL_NUDGE_MAX_H = 8;    // 连续 8 小时以上八成是忘了点下班，不再报账

  function checkSalaryNudge(now) {
    var open = openSessionOf(today);
    if (!open) {
      salState.sessionStart = 0;
      salState.lastHour = 0;
      return;
    }
    if (salState.sessionStart !== open.s.start) {
      salState.sessionStart = open.s.start;
      salState.lastHour = 0;
    }

    var mins = Math.floor((now - open.s.start) / MIN);
    var hourMark = Math.floor(mins / 60);        // 干满 1 小时算 1，满 2 小时算 2
    if (hourMark < 1 || hourMark <= salState.lastHour) return;
    salState.lastHour = hourMark;               // 先记上，免得下一秒又喊一遍
    /* 忘了点下班的那些「段」会跨夜挂着，这时候整点报账既没意义也会半夜刷屏 */
    if (hourMark > SAL_NUDGE_MAX || (now - open.s.start) > SAL_NUDGE_MAX_H * HOUR) return;

    var info = salaryNow(now);
    if (!info.ok) return;                       // 没设置工资池就不提钱
    var added = sessionAddedProgress(info, open.s.start, now);
    if (added <= 0) return;                     // 已经满额了，不再报数

    var vars = salaryVars(info, added);
    /* 连续忙了 3 小时以上，换成「涨了不少，也该歇会儿」那一档 */
    var pool = fillablePool(MSG().salary && MSG().salary[mins >= 180 ? 'long' : 'work'], vars);
    var msg = pool ? pickFrom(pool, vars) : '';
    if (!msg) return;
    setHeroMessage(msg, true);
    if (state.view !== 'today') toast(msg);
  }

  /* ---------- 文案预览（体验用 + 方便自测） ---------- */

  var PREVIEWS = {
    'in': { kind: 'in', at: '09:02', ctx: { hour: 9, sessionIndex: 1 } },
    'out-short': { kind: 'out', at: '11:30', ctx: { hour: 11, minutesToday: 30 } },
    'out-normal': { kind: 'out', at: '18:05', ctx: { hour: 18, minutesToday: 300 } },
    'out-long': { kind: 'out', at: '21:20', ctx: { hour: 21, minutesToday: 660 } },
    'out-huge': { kind: 'out', at: '23:40', ctx: { hour: 23, minutesToday: 780 } },
    'late': { kind: 'out', at: '23:30', ctx: { hour: 23, minutesToday: 400 } },
    'session': { kind: 'in', at: '15:10', ctx: { hour: 15, sessionIndex: 3 } },
    'weekend': { kind: 'in', at: '11:00', ctx: { hour: 11, sessionIndex: 1, isWeekend: true } },
    'rest': { kind: 'rest', at: '16:00', tier: 240 },
  };

  function normCtx(c) {
    c = c || {};
    return {
      hour: (c.hour === undefined) ? 9 : c.hour,
      minutesToday: c.minutesToday || 0,
      sessionMinutes: c.sessionMinutes || 0,
      sessionIndex: c.sessionIndex || 1,
      isWeekend: !!c.isWeekend,
    };
  }

  function countMessages() {
    var M = MSG(), total = 0;
    Object.keys(M).forEach(function (k) {
      var v = M[k];
      if (Array.isArray(v)) total += v.length;
      else Object.keys(v).forEach(function (k2) { total += v[k2].length; });
    });
    return total;
  }

  function runPreview(key) {
    var p = PREVIEWS[key];
    if (!p) return;
    var text;
    if (p.kind === 'rest') {
      text = pickFrom(MSG().rest && MSG().rest[String(p.tier)]);
    } else {
      text = pickPunchMessage(p.kind, normCtx(p.ctx));
    }
    // 不用弹窗：把这句话放到首页那句鼓励语上，然后回到首页看
    setHeroMessage(text, true);
    switchView('today');
  }

  /** 给使用者/自测用的接口，见 README「如何测试触发效果」 */
  /** 给使用者/自测用的接口，见 README */
  window.WLParse = function (text) { return parseTimetableText(text); };
  /** 自测用：看作息表草稿 / 已存下来的作息表 */
  window.WLPeriods = {
    draft: function () { return periodDraft.map(function (r) { return [r[0], r[1]]; }); },
    saved: function () { return (settings.periods || []).map(function (r) { return [r[0], r[1]]; }); },
    time: function (n) { return periodTime(n); },
  };
  /** 自测用：周次解析。WLWeeks.of('13到23') -> [13..23]；WLWeeks.text('13到23') -> '13-23周' */
  window.WLWeeks = {
    of: function (text) {
      var w = parseWeeks(text, true);
      if (!w) return null;
      if (w.type === 'all') return 'all';
      if (w.type === 'odd') return 'odd';
      if (w.type === 'even') return 'even';
      return w.weeks;
    },
    text: function (text) { return weeksToText(parseWeeks(text, true)); },
    /* 这门课在前 30 周里哪几周上 */
    show: function (text) {
      var out = [];
      for (var n = 1; n <= 30; n++) if (courseInWeek(text, n)) out.push(n);
      return out;
    },
  };
  window.WLWork = {
    /* 某天实际工时（打卡 ∪ 课表） */
    dayMs: function (day, now) { return dayWorkMs(day || today, now || Date.now()); },
    /* 课表替那天补了多久 */
    classExtra: function (day, now) { return classExtraMs(day || today, now || Date.now()); },
    /* 某天所有课表时段（now 只在「今天」有意义，其余日子整天都算完） */
    classes: function (day, now) {
      return classSpans(day || today, now).map(function (s) {
        return { name: s.course.courseName, from: fmtHM(s.start), to: fmtHM(s.end), weeks: s.course.weeks };
      });
    },
    /* 某天课表上「排了」哪些课（计划视图：不看现在几点、未来的日子也算）
       —— 周视图、日历明细、日历格子都用这个口径，查自习班次时用它最准 */
    planned: function (day) {
      return plannedClasses(day || today).map(function (s) {
        return { id: s.course.id, name: s.course.courseName,
          from: fmtHM(s.start), to: fmtHM(s.end),
          weeks: s.course.weeks, weekNums: s.course.weekNums };
      });
    },
    /* 这一门课在某一天上不上（周次判断的唯一入口，方便自测） */
    occurs: function (id, day) {
      var c = null;
      for (var i = 0; i < courses.length; i++) if (courses[i].id === id) c = courses[i];
      if (!c) return null;
      return courseOccursOn(c, day || today);
    },
    /* 这一天是学期第几周（0 = 不知道/还没开学） */
    weekNoOf: function (day) { return weekNoOfKey(day || today); },
    week: function () { return currentWeekNo(); },
  };

  window.WLSalary = {
    /* 纯公式：给月工资 / 目标工时 / 已工作毫秒，算出工资进度（不碰任何存储） */
    formula: function (salary, targetHours, workedMs) {
      var plan = {
        key: 'test', salary: Number(salary) || 0, salarySet: true,
        targetHours: Number(targetHours) || 0, targetSet: (Number(targetHours) > 0),
        targetMs: Math.round((Number(targetHours) || 0) * HOUR),
      };
      var info = salaryProgress(plan, Number(workedMs) || 0);
      return {
        ok: info.ok, reason: info.reason, amount: info.amount, percent: info.percent,
        capped: info.capped, extraMs: info.extraMs, remainMs: info.remainMs,
        perHour: info.perHour, perMin: info.perMin, perSec: info.perSec,
        targetHours: info.targetHours, targetMs: info.targetMs,
        amountText: fmtMoney2(info.amount), percentText: fmtPercent(info.percent),
        extraText: fmtDurPlain(info.extraMs), remainText: fmtDurPlain(info.remainMs),
      };
    },
    /* 当前（或指定）月份的工资进度，含它用的是哪个月的设置 */
    now: function (now) {
      var at = now || Date.now();
      var info = salaryNow(at);
      return {
        ok: info.ok, reason: info.reason, monthKey: info.plan.key,
        explicitSalary: info.plan.explicitSalary, explicitTarget: info.plan.explicitTarget,
        salary: info.plan.salary, targetHours: info.plan.targetHours,
        workedMs: info.workedMs, days: info.days,
        amount: info.amount, percent: info.percent, capped: info.capped,
        extraMs: info.extraMs, remainMs: info.remainMs, perHour: info.perHour,
        todayAdded: info.ok ? todayAddedProgress(info, at) : 0,
      };
    },
    /* 指定月份（历史月份验证用） */
    month: function (y, m, now) {
      var info = salaryOfMonth(y, m, now);
      return {
        ok: info.ok, reason: info.reason, monthKey: info.plan.key,
        salary: info.plan.salary, targetHours: info.plan.targetHours,
        workedMs: info.workedMs, amount: info.amount, percent: info.percent, days: info.days,
      };
    },
    /* 每个月的设置（她设过哪几个月） */
    months: function () { return JSON.parse(JSON.stringify(settings.salaryMonths || {})); },
    /* 「目标工时」的建议值（自测用：不用去猜文案，直接拿这个数对） */
    suggest: function (y, m) {
      var d = new Date();
      var s = targetSuggestion((y === undefined) ? d.getFullYear() : y,
                               (m === undefined) ? d.getMonth() : m);
      return s ? { ms: s.ms, label: s.label, hours: Math.round(s.ms / HOUR * 10) / 10 } : null;
    },
    defaults: function () { return { monthlySalary: settings.monthlySalary, targetHours: settings.targetHours }; },
    /* 抽一条工资池文案（金额按给定条件算，方便自测） */
    msg: function (kind, salary, targetHours, workedMs) {
      var f = window.WLSalary.formula(salary, targetHours, workedMs);
      var plan = { salary: Number(salary) || 0, salarySet: true, targetHours: Number(targetHours) || 0,
        targetSet: (Number(targetHours) > 0), targetMs: Math.round((Number(targetHours) || 0) * HOUR) };
      var info = salaryProgress(plan, Number(workedMs) || 0);
      var amt = f.amount;                      // 整段工时带来的进度，用来当 {amt}
      var vars = salaryVars(info, kind === 'in' ? undefined : amt);
      var pool = fillablePool(MSG().salary && MSG().salary[kind], vars);
      return pool ? pickFrom(pool, vars) : '';
    },
  };

  window.WLPreview = {
    run: runPreview,
    scenarios: Object.keys(PREVIEWS),
    // 直接算文案（不动界面），可以随便改条件：
    // WLPreview.pick('out', { hour: 23, minutesToday: 700 })
    pick: function (kind, ctx) { return pickPunchMessage(kind, normCtx(ctx)); },
    // 现在首页上显示的是哪一句
    current: function () { return state.heroMsg; },
    total: countMessages,
  };

  /* ============================================================
     十六、页面切换
     ============================================================ */

  var VIEWS = ['today', 'calendar', 'timetable', 'me'];

  function switchView(name) {
    state.view = name;
    VIEWS.forEach(function (v) {
      var on = (v === name);
      document.getElementById('screen-' + v).hidden = !on;
      var tab = document.getElementById('tab-' + v);
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    els.screens.scrollTop = 0;
  }

  function shiftMonth(delta) {
    var m = state.monthM + delta;
    state.monthY += Math.floor(m / 12);
    state.monthM = ((m % 12) + 12) % 12;
    renderCalendar();
    renderMe(Date.now());
  }

  function goThisMonth() {
    var d = new Date();
    state.monthY = d.getFullYear();
    state.monthM = d.getMonth();
    renderCalendar();
    renderMe(Date.now());
  }

  /* ============================================================
     十一、工资设置
     ============================================================ */

  function money() {
    var raw = els.salaryInput.value.trim();
    if (raw === '') return { empty: true, value: null };
    var v = parseMoney(raw);
    return { empty: false, value: v };
  }

  /** 目标工时（小时）：留空 = 没设置；0 / 非数字 = 不合法；上限 1000 小时 */
  function targetField() {
    var raw = (els.targetInput.value || '').trim();
    if (raw === '') return { empty: true, value: null };
    var n = parseMoney(raw);                    // 和金额一样允许小数（160.5）
    if (n === null) return { empty: false, value: null, bad: true };
    if (n <= 0) return { empty: false, value: 0 };
    if (n > 1000) return { empty: false, value: n, tooBig: true };
    return { empty: false, value: n };
  }

  function showSalaryMsg(text) {
    els.salaryMsg.textContent = text;
    els.salaryMsg.hidden = false;
  }

  function hideSalaryMsg() {
    els.salaryMsg.hidden = true;
  }

  /** 边输入边显示：目标时薪 / 工资进度是怎么算的（顺手保留原来的「实际时薪」预览） */
  function refreshSalaryPreview() {
    var m = money();
    var th = targetField();
    var st = monthStats(state.monthY, state.monthM, Date.now());
    var lines = [];

    if (!m.empty && (m.value === null || m.value > 100000000)) {
      showSalaryMsg(m.value === null ? '请填写数字，例如 8000' : '金额太大了，请检查一下');
      els.salaryPreview.textContent = '—';
      return;
    }
    if (!th.empty && (th.bad || th.value === 0 || th.tooBig)) {
      showSalaryMsg(th.bad ? '目标工时请填数字，例如 160'
        : (th.value === 0 ? '目标工时要大于 0' : '目标工时太大了，请检查一下'));
      els.salaryPreview.textContent = '—';
      return;
    }
    hideSalaryMsg();

    var hasSalary = (!m.empty && m.value > 0);
    var hasTarget = (!th.empty && th.value > 0);

    if (hasSalary && hasTarget) {
      var perHour = m.value / th.value;
      lines.push('目标时薪 ' + fmtRate(perHour) + ' / 小时 · 每分钟 ' + fmtRate6(perHour / 60) +
        ' · 每秒 ' + fmtRate7(perHour / 3600));
    } else if (hasTarget) {
      lines.push('再填上月工资，就能算出目标时薪');
    } else if (hasSalary) {
      lines.push('再填上本月目标工时，就能算出工资进度');
    }

    if (m.empty && th.empty) {
      lines.push('留空并保存，可以清除这个月的工资设置');
    } else if (m.empty) {
      lines.push('月工资留空 = 用默认值（勾了「沿用」则连默认一起清掉）');
    }

    /* 旧的「实际平均时薪」预览：保留，但明确写上「仅统计」 */
    if (hasSalary) {
      if (st.ms < MIN) {
        lines.push('本月还没有工时记录，暂时算不出实际时薪');
      } else {
        lines.push('按 ' + fmtDur(st.ms) + ' 计算：实际时薪约 ' +
          fmtRate(m.value / (st.ms / HOUR)) + ' / 小时（仅统计）');
      }
    }

    els.salaryPreview.textContent = lines.length ? lines.join('\n') : '—';
  }

  /** 上个月的实际工时（用来一键填入目标工时） */
  function prevMonthWorkedMs(y, m) {
    var py = y, pm = m - 1;
    if (pm < 0) { pm = 11; py = y - 1; }
    return monthStats(py, pm, Date.now()).ms;
  }

  /**
   * 「目标工时填多少」的建议值（她自己也可以改）：
   *   · 按本月节奏估整月 = 本月已工作 ÷ 已过天数 × 当月天数
   *   · 上个月整月（如果上个月有数据）
   * 取两者里更大的那个。理由：第一次设置时宁可目标定大一点，也不要一保存就 100% 满了 ——
   * 她还没开始追，进度条就到头了，那这个功能就没意义了。
   * （她的真实数据就是这个情况：上个月只有 9 小时，而本月已经 25 小时。）
   */
  function targetSuggestion(y, m) {
    var lastMs = prevMonthWorkedMs(y, m);
    var thisMs = monthStats(y, m, Date.now()).ms;
    var dim = new Date(y, m + 1, 0).getDate();
    var dom = isCurrentMonth(y, m) ? new Date().getDate() : dim;
    var paceMs = (thisMs > 0 && dom > 0 && dom < dim) ? (thisMs / dom) * dim : thisMs;
    paceMs = Math.round(paceMs / MIN) * MIN;                 // 抹到分钟，别给出 54.61 小时这种数

    if (paceMs <= 0 && lastMs <= 0) return null;
    if (paceMs > lastMs) return { ms: paceMs, label: '按本月节奏估算 ' + fmtDurPlain(paceMs) };
    return { ms: lastMs, label: '按上月工时填入 ' + fmtDurPlain(lastMs) };
  }

  function openSalary() {
    var y = state.monthY, m = state.monthM;
    var plan = salaryPlan(y, m);
    var sug = targetSuggestion(y, m);

    els.salarySub.textContent = y + '年' + (m + 1) + '月 · 只影响这个月';
    els.salaryInput.value = plan.salarySet ? String(plan.salary) : '';
    els.targetInput.value = plan.targetSet ? String(plan.targetHours) : '';
    /* 副标题已经说了「只影响这个月」，这里只在「确实单独设过」时补一句记号 */
    els.salaryMonthNote.textContent = (plan.explicitSalary || plan.explicitTarget) ? '本月已单独设置过' : '';

    els.salaryFillLast.hidden = !sug;
    if (sug) els.salaryFillLast.textContent = sug.label;

    hideSalaryMsg();
    refreshSalaryPreview();
    openSheet(els.salarySheet);
  }

  function saveSalary() {
    var m = money();
    var th = targetField();
    var y = state.monthY, mo = state.monthM;
    var key = monthKey(y, mo);

    if (!m.empty && m.value === null) { showSalaryMsg('请填写数字，例如 8000'); return; }
    if (!m.empty && m.value > 100000000) { showSalaryMsg('金额太大了，请检查一下'); return; }
    if (!th.empty && th.bad) { showSalaryMsg('目标工时请填数字，例如 160'); return; }
    if (!th.empty && th.value === 0) { showSalaryMsg('目标工时要大于 0'); return; }
    if (!th.empty && th.tooBig) { showSalaryMsg('目标工时太大了，请检查一下'); return; }

    /* 各月独立：只改这个月的记录，别的月份一个字节都不动 */
    var entry = settings.salaryMonths[key] || {};
    if (m.empty) delete entry.salary; else entry.salary = Math.round(m.value * 100) / 100;
    if (th.empty) delete entry.targetHours; else entry.targetHours = th.value;
    if (Object.keys(entry).length) settings.salaryMonths[key] = entry;
    else delete settings.salaryMonths[key];

    /* 勾了「以后月份也沿用」-> 同时更新默认值（历史月份仍然保留各自的值） */
    if (els.salaryDefault.checked) {
      settings.monthlySalary = m.empty ? null : Math.round(m.value * 100) / 100;
      settings.targetHours = th.empty ? null : th.value;
    }

    saveSettings();
    closeSheet(els.salarySheet);
    renderAll();

    if (m.empty && th.empty) toast('已清除 ' + (mo + 1) + '月的工资设置');
    else if (!m.empty && !th.empty) {
      toast('已保存：' + fmtMoney(m.value) + ' ÷ ' + th.value + ' 小时' +
        (m.value > 0 ? '（目标时薪 ' + fmtRate(m.value / th.value) + '/小时）' : ''));
    } else toast('已保存 ' + (mo + 1) + '月的工资设置');
  }

  /* ============================================================
     十六之二、备份 / 恢复
     纯前端没有云端，换手机、清浏览器数据就全没了，
     所以给她一个「导出成一段文字（或一个文件）」和「粘回来恢复」。
     ============================================================ */

  var BACKUP_TAG = 'zmh-worklog';

  function backupCounts(data) {
    var days = 0, sessions = 0;
    Object.keys(data.db || {}).forEach(function (k) {
      if (!Array.isArray(data.db[k])) return;
      if (data.db[k].length) { days++; sessions += data.db[k].length; }
    });
    return { days: days, sessions: sessions, courses: (data.courses || []).length };
  }

  function makeBackupText() {
    var payload = {
      app: BACKUP_TAG,
      v: DATA_VERSION,
      exportedAt: dayKey() + ' ' + fmtHM(Date.now()),
      db: db,
      settings: settings,
      courses: courses,
    };
    return JSON.stringify(payload);
  }

  /** 解析并校验备份内容 -> { ok, data?, err? } */
  function parseBackup(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return { err: '还没有内容 —— 先点「生成备份」，或者把备份内容粘进来' };
    var obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      return { err: '这段内容不是备份（格式读不出来），确认完整复制了吗' };
    }
    if (!obj || typeof obj !== 'object' || (!obj.db && !obj.courses && !obj.settings)) {
      return { err: '这段内容不是本 App 的备份' };
    }
    if (obj.app && obj.app !== BACKUP_TAG) return { err: '这段内容是别的 App 的备份' };
    return {
      data: {
        db: sanitize(obj.db),
        settings: cleanSettings(obj.settings),
        courses: sanitizeCourses(obj.courses),
      },
    };
  }

  function refreshBackupStat() {
    if (!els.backupStat) return;
    var c = backupCounts({ db: db, courses: courses });
    els.backupStat.textContent = '这台设备现在有 ' + c.days + ' 天记录（' + c.sessions + ' 段）、' +
      c.courses + ' 门课程';
  }

  function showBackupMsg(text, kind) {
    if (!els.backupMsg) return;
    els.backupMsg.textContent = text;
    els.backupMsg.className = 'form-msg is-' + (kind || 'error');
    els.backupMsg.hidden = false;
  }

  function openBackup() {
    if (els.backupText) els.backupText.value = '';
    if (els.backupMsg) els.backupMsg.hidden = true;
    refreshBackupStat();
    openSheet(els.backupSheet);
  }

  function doMakeBackup() {
    var text = makeBackupText();
    els.backupText.value = text;
    var c = backupCounts({ db: db, courses: courses });
    showBackupMsg('已生成（' + c.days + ' 天记录 / ' + c.courses + ' 门课程）。长按上面的内容全选复制，' +
      '发给自己存起来就行', 'ok');
    refreshBackupStat();
  }

  /** 下载成文件（有些浏览器/环境不让下载，那就还是用复制） */
  function doBackupFile() {
    var text = makeBackupText();
    els.backupText.value = text;
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'zmh上班日记-备份-' + dayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      showBackupMsg('已生成文件。如果没弹出下载，就用「生成备份」再长按复制', 'ok');
    } catch (e) {
      showBackupMsg('这个环境不支持下载文件，用「生成备份」长按复制吧', 'warn');
    }
  }

  function doRestore() {
    var res = parseBackup(els.backupText.value);
    if (res.err) { showBackupMsg(res.err, 'error'); return; }

    var nowC = backupCounts({ db: db, courses: courses });
    var newC = backupCounts(res.data);
    var msg = '备份里有 ' + newC.days + ' 天记录（' + newC.sessions + ' 段）、' + newC.courses + ' 门课程。\n\n' +
      '确定 = 用备份【覆盖】这台设备现在的数据（现在有 ' + nowC.days + ' 天、' + nowC.courses + ' 门课）\n' +
      '取消 = 什么都不改';
    if (!window.confirm(msg)) return;

    db = res.data.db;
    settings = res.data.settings;
    courses = res.data.courses;
    save(); saveSettings(); saveCourses();
    closeSheet(els.backupSheet);
    renderAll();
    toast('已从备份恢复：' + newC.days + ' 天记录、' + newC.courses + ' 门课程');
  }

  /**
   * 清空本机数据（开发/测试用，藏在「备份 / 恢复」里）。
   * 必须连点两次 + 输入确认才行 —— 绝不在用户不知道的情况下删正常数据。
   */
  function doResetAll() {
    var c = backupCounts({ db: db, courses: courses });
    if (!state.resetArmed) {
      state.resetArmed = true;
      showBackupMsg('再点一次「清空这台设备上的所有数据」就会真的清掉：' +
        c.days + ' 天工时记录 + ' + c.courses + ' 门课程。清理前建议先「生成备份」', 'warn');
      return;
    }
    state.resetArmed = false;
    if (!window.confirm('确定清空这台设备上的全部数据吗？\n\n' +
      '会清掉：' + c.days + ' 天工时记录（' + c.sessions + ' 段）、' + c.courses + ' 门课程、月工资/目标工时和课表设置。\n' +
      '清掉之后【没法撤销】，除非你刚才导出过备份。')) return;

    db = {};
    courses = [];
    settings = cleanSettings(null);
    save(); saveCourses(); saveSettings();
    closeSheet(els.backupSheet);
    renderAll();
    renderTimetable();
    toast('已清空本机数据（课表 ' + courses.length + ' 门、记录 ' + Object.keys(db).length + ' 天）');
  }

  /* ============================================================
     十七、事件绑定与启动
     ============================================================ */

  /** 列表里的行点击 / 回车 -> 打开编辑 */
  function bindRows(el, getDay) {
    function hit(e) {
      var row = e.target && e.target.closest ? e.target.closest('.log-row') : null;
      if (!row || !el.contains(row)) return -1;
      return parseInt(row.getAttribute('data-i'), 10);
    }
    el.addEventListener('click', function (e) {
      var i = hit(e);
      if (i >= 0) openEdit(getDay(), i);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var i = hit(e);
      if (i >= 0) { e.preventDefault(); openEdit(getDay(), i); }
    });
  }

  function bind() {
    els.btnIn.addEventListener('click', punchIn);
    els.btnOut.addEventListener('click', punchOut);

    els.calPrev.addEventListener('click', function () { shiftMonth(-1); });
    els.calNext.addEventListener('click', function () { shiftMonth(1); });
    els.calToday.addEventListener('click', goThisMonth);
    els.mePrev.addEventListener('click', function () { shiftMonth(-1); });
    els.meNext.addEventListener('click', function () { shiftMonth(1); });
    els.meToday.addEventListener('click', goThisMonth);

    els.salaryEdit.addEventListener('click', openSalary);
    /* 首页那张卡片写的是「本月」，所以从这里进去先回到本月再打开设置，
       免得她刚好在「我的」翻着 8 月，结果把 8 月的设置给改了 */
    els.poolSetup.addEventListener('click', function () {
      goThisMonth();
      switchView('me');
      openSalary();
    });
    els.salarySave.addEventListener('click', saveSalary);
    els.salaryInput.addEventListener('input', refreshSalaryPreview);
    els.targetInput.addEventListener('input', refreshSalaryPreview);
    els.salaryDefault.addEventListener('change', refreshSalaryPreview);
    els.salaryFillLast.addEventListener('click', function () {
      var sug = targetSuggestion(state.monthY, state.monthM);
      if (!sug || sug.ms <= 0) return;
      /* 建议值取一位小数，她自己再改 */
      els.targetInput.value = String(Math.round(sug.ms / HOUR * 10) / 10);
      els.salaryDefault.checked = false;      // 只是给这个月填个数，别悄悄改默认值
      refreshSalaryPreview();
    });
    els.salaryClose.addEventListener('click', function () { closeSheet(els.salarySheet); });
    els.salaryInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveSalary(); }
    });
    els.targetInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveSalary(); }
    });

    /* ---------- 首页鼓励语（点一下换一句） ---------- */
    els.heroMsg.addEventListener('click', refreshHeroMessage);

    /* ---------- 备份 / 恢复 ---------- */
    els.backupBtn.addEventListener('click', openBackup);
    els.backupClose.addEventListener('click', function () { closeSheet(els.backupSheet); });
    els.backupDone.addEventListener('click', function () { closeSheet(els.backupSheet); });
    els.backupMake.addEventListener('click', doMakeBackup);
    els.backupFile.addEventListener('click', doBackupFile);
    els.backupRestore.addEventListener('click', doRestore);
    els.backupReset.addEventListener('click', doResetAll);

    /* ---------- 粘贴导入 ---------- */
    els.importPaste.addEventListener('click', openPaste);
    els.pasteClose.addEventListener('click', function () { closeSheet(els.pasteSheet); });
    els.pasteParse.addEventListener('click', doParsePaste);

    /* ---------- 学期开始日期 ---------- */
    els.ttWeekBtn.addEventListener('click', openWeekSheet);
    els.weekClose.addEventListener('click', function () { closeSheet(els.weekSheet); });
    els.weekSave.addEventListener('click', saveWeekStart);

    /* ---------- 课表：上一周 / 下一周 ---------- */
    els.ttPrev.addEventListener('click', function () { shiftWeek(-1); });
    els.ttNext.addEventListener('click', function () { shiftWeek(1); });
    els.ttThisWeek.addEventListener('click', function () { shiftWeek('now'); });

    /* ---------- 作息时间表 ---------- */
    els.ttPeriodBtn.addEventListener('click', openPeriodSheet);
    els.periodClose.addEventListener('click', function () { closeSheet(els.periodSheet); });
    els.pbFill.addEventListener('click', batchFillPeriods);
    els.periodSave.addEventListener('click', savePeriods);
    els.periodReset.addEventListener('click', function () {
      periodDraft = DEFAULT_PERIODS.map(function (r) { return [r[0], r[1]]; });
      settings.periodLen = 40;
      settings.periodGap = 10;
      els.pbLen.value = 40;
      els.pbGap.value = 10;
      els.pbCount.value = periodDraft.length;
      els.pbStart.value = periodDraft[0][0];
      els.periodMsg.hidden = true;
      renderPeriodRows();
      toast('已恢复成常见作息，请核对后再保存');
    });
    els.weekClear.addEventListener('click', function () {
      settings.semesterStart = '';
      saveSettings();
      closeSheet(els.weekSheet);
      renderTimetable();
      renderAll();
      toast('已清除学期开始日期');
    });

    /* ---------- 课表 ---------- */
    els.ttImport.addEventListener('click', openImport);
    els.ttAddOne.addEventListener('click', function () { openCourseNew(false); });

    els.importBack.addEventListener('click', leaveImport);
    els.importCancel.addEventListener('click', leaveImport);
    els.importAdd.addEventListener('click', function () { openCourseNew(true); });
    els.importConfirm.addEventListener('click', confirmImport);
    /* 没有待定的导入批次时，这几个按钮绝不能动数据
       （弹层是 hidden 的，但按钮被别的路径点到也不该重跑一次导入） */
    els.mergeKeep.addEventListener('click', function () {
      els.mergeBox.hidden = true;
      if (!state.mergeIncoming) return;
      finishImport(state.mergeIncoming, false, state.mergePlan);
    });
    els.mergeReplace.addEventListener('click', function () {
      els.mergeBox.hidden = true;
      if (!state.mergeIncoming) return;
      finishImport(state.mergeIncoming, true, null);
    });
    els.mergeCancel.addEventListener('click', function () { els.mergeBox.hidden = true; });

    els.importList.addEventListener('click', function (e) {
      var t = e.target;
      var editBtn = t && t.closest ? t.closest('[data-edit]') : null;
      if (editBtn) { openPendingEdit(parseInt(editBtn.getAttribute('data-edit'), 10)); return; }
      var delBtn = t && t.closest ? t.closest('[data-del]') : null;
      if (delBtn) {
        var i = parseInt(delBtn.getAttribute('data-del'), 10);
        var c = state.pending[i];
        if (c && window.confirm('把「' + (c.courseName || '未命名课程') + '」从列表里移出？')) {
          state.pending.splice(i, 1);
          renderImport();
          toast('已移出列表');
        }
      }
    });

    /* 今日记录：点打卡段改时间，点课程段改课程 */
    els.logList.addEventListener('click', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.log-row') : null;
      if (!row) return;
      var cid = row.getAttribute('data-course');
      if (cid) { openCourseEdit(cid); return; }
      var i = parseInt(row.getAttribute('data-i'), 10);
      if (i >= 0) openEdit(today, i);
    });

    els.logList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target && e.target.closest ? e.target.closest('.log-row') : null;
      if (!row) return;
      e.preventDefault();
      row.click();
    });

    els.ttList.addEventListener('click', function (e) {
      var row = e.target && e.target.closest ? e.target.closest('.tt-course') : null;
      if (row) openCourseEdit(row.getAttribute('data-id'));
    });

    /* 周视图 / 列表 切换（记住选择） */
    els.ttSwitch.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button[data-tt]') : null;
      if (!b) return;
      state.ttView = b.getAttribute('data-tt');
      settings.ttView = state.ttView;
      saveSettings();
      renderTimetable();
    });

    /* 周视图里点课程块，同样打开编辑 */
    els.ttGrid.addEventListener('click', function (e) {
      var blk = e.target && e.target.closest ? e.target.closest('.tt-block') : null;
      if (blk) openCourseEdit(blk.getAttribute('data-id'));
    });

    /* ---------- 课程弹层 ---------- */
    els.courseClose.addEventListener('click', function () { closeSheet(els.courseSheet); });
    els.courseSave.addEventListener('click', function () { saveCourseAndMaybeNext(false); });
    els.courseSaveNext.addEventListener('click', function () { saveCourseAndMaybeNext(true); });
    els.courseDelete.addEventListener('click', deleteCourseFromSheet);

    els.courseWeekdays.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button[data-wd]') : null;
      if (!b) return;
      state.courseWd = parseInt(b.getAttribute('data-wd'), 10);
      syncWeekdayUI();
      hideCourseMsg();
    });

    /* 点「第几节」：多选（添加时）或多选后的首尾时间回填 */
    els.coursePeriods.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button[data-p]') : null;
      if (!b) return;
      var n = parseInt(b.getAttribute('data-p'), 10);
      if (!periodTime(n)) return;
      var sel = selectedPeriods();
      if (canPickMulti()) {
        var at = sel.indexOf(n);
        if (at >= 0) sel.splice(at, 1); else sel.push(n);      // 再点一下取消这一节
      } else {
        sel = [n];                                             // 编辑已有那一条：点了就换
      }
      state.courseSel = sel;
      fillTimesFromSelection();
      syncPeriodChips();
      hideCourseMsg();
    });

    /* 自己改时间时，节次高亮和提示跟着变（认得出是第几节就自动标上） */
    els.courseStart.addEventListener('input', function () { syncPeriodChips(true); });
    els.courseEnd.addEventListener('input', function () { syncPeriodChips(true); });
    /* 周次：一边写一边告诉她「我理解成了什么」 */
    els.courseWeeks.addEventListener('input', syncWeeksHint);
    els.courseWeeks.addEventListener('change', syncWeeksHint);

    /* 改开始时间时，如果结束时间变得不合理，自动顺延 100 分钟（一节大课） */
    els.courseStart.addEventListener('change', function () {
      var s = cleanTime(els.courseStart.value);
      if (!s) return;
      var e2 = cleanTime(els.courseEnd.value);
      if (!e2 || e2 <= s) els.courseEnd.value = addMinutes(s, 100);
      syncPeriodChips(true);
    });

    /* 作息时间表：改某一节的开始时间 -> 时长不变（晚辅改过 120 分钟不会被改回 40）；
       改结束时间 -> 就用她填的。行是动态渲染的，所以用事件委托 */
    els.periodList.addEventListener('change', onPeriodRowChange);
    els.periodList.addEventListener('input', onPeriodRowChange);

    els.calGrid.addEventListener('click', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('.cal-day') : null;
      if (cell) openDay(cell.getAttribute('data-day'));
    });

    els.todayAdd.addEventListener('click', function () { openEdit(today, -1); });
    els.yesterdayAdd.addEventListener('click', function () {
      openEdit(dateKeyPlus(today, -1), -1);
    });
    els.dayAdd.addEventListener('click', function () {
      if (state.selectedDay) openEdit(state.selectedDay, -1);
    });

    els.editSave.addEventListener('click', saveEdit);
    els.editDelete.addEventListener('click', deleteEdit);
    /* 常用备注：点一下填上，再点一下取消 */
    els.noteQuick.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button[data-note]') : null;
      if (!b) return;
      var v = b.getAttribute('data-note');
      els.editNote.value = (els.editNote.value === v) ? '' : v;
      syncNoteQuick();
    });
    els.editNote.addEventListener('input', syncNoteQuick);
    els.editStart.addEventListener('input', refreshEditFeedback);
    els.editEnd.addEventListener('input', refreshEditFeedback);
    els.editStart.addEventListener('change', refreshEditFeedback);
    els.editEnd.addEventListener('change', refreshEditFeedback);

    els.dayClose.addEventListener('click', function () { closeSheet(els.daySheet); });
    els.editClose.addEventListener('click', function () { closeSheet(els.editSheet); });

    Array.prototype.forEach.call(document.querySelectorAll('.sheet-backdrop'), function (bd) {
      bd.addEventListener('click', function () {
        closeSheet(document.getElementById(bd.getAttribute('data-close')));
      });
    });

    bindRows(els.logList, function () { return today; });
    bindRows(els.dayList, function () { return state.selectedDay; });

    VIEWS.forEach(function (v) {
      document.getElementById('tab-' + v).addEventListener('click', function () { switchView(v); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!els.editSheet.hidden) closeSheet(els.editSheet);
      else if (!els.courseSheet.hidden) closeSheet(els.courseSheet);
      else if (!els.salarySheet.hidden) closeSheet(els.salarySheet);
      else if (!els.daySheet.hidden) closeSheet(els.daySheet);
      else if (!els.importScreen.hidden) leaveImport();
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tick();
    });
  }

  function init() {
    cacheEls();
    load();
    loadSettings();
    loadCourses();
    repairOpenSessions();
    state.ttView = settings.ttView || 'grid';   // 记住上次选的周视图/列表

    // 老 WebView 认不出 :focus-visible，交给 CSS 里的 .no-fv 规则兜底，
    // 保证实体键盘用户 Tab 到按钮上看得见焦点
    try {
      if (!(window.CSS && window.CSS.supports && window.CSS.supports('selector(:focus-visible)'))) {
        document.documentElement.className += ' no-fv';
      }
    } catch (e) { /* 忽略：只是焦点样式，不影响功能 */ }

    var d = new Date();
    state.monthY = d.getFullYear();
    state.monthM = d.getMonth();
    today = dayKey();

    /* 先把事件绑上，再渲染。
       反过来的话，只要渲染里有一个没预料到的数据把某一页画崩，
       bind() 就永远跑不到 —— 表现是「整个 App 所有按钮都点不动」，
       而用户根本看不到任何报错。这个顺序踩过坑，别改回去。 */
    bind();

    try {
      renderAll();
    } catch (e) {
      /* 渲染失败最多让某一页显示不全，绝不能连累所有按钮 */
      if (window.console && console.error) console.error('renderAll 失败：', e);
    }
    switchView('today');

    // 打开 App 就先给一句（之后打卡 / 连续工作到点会换）
    setHeroMessage(pickFrom(MSG().general, {}) || '打卡成功，人还活着。', false);

    /* 最近有「忘了点下班」的记录 -> 直接弹出来请她改成实际时间。
       不这么做的话，那段会一直按 23:59 算，月累计和时薪全是错的。 */
    var toFix = guessSessionToFix();
    if (toFix) setTimeout(function () { openEstFix(toFix.day, toFix.idx); }, 400);

    if (!storageOK) toast('这台设备禁用了本地存储，记录可能无法保存');
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
