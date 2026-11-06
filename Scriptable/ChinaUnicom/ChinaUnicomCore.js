// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;
/*
 * 中国联通组件 · 核心模块（与入口同目录，由入口 importModule('ChinaUnicomCore') 加载）
 * --------------------------------------------------
 * 金额 / 流量 / 通话 / 短信 四项齐全。
 * 改写自 anker1209（脑瓜）ChinaUnicom_2024.js 的接口逻辑，
 * 原项目：https://github.com/anker1209/Scriptable（已注明来源，感谢原作者）。
 *
 * 为何放在根目录：Scriptable 对“子文件夹里的脚本”在部分版本 / 刚同步时不可见，
 * 而同目录 import 是最基础的能力，所有版本都稳。子文件夹 10010/ChinaUnicom.js
 * 只是一个转发壳，真正逻辑只此一份。
 *
 * 与原脚本的区别：
 *   1. 去掉了对 DmYY 基类的重依赖，做成独立可运行版本，更易维护；
 *   2. 遍历 dataList 时额外识别 sms（短信）类型，补齐你要的四项；
 *   3. 自带 Cookie 获取 / 本地持久化，无需 BoxJs。
 *
 * 如何获取 Cookie（任选其一）：
 *   A. 装 Quantumult X / Surge / Loon，加入重写规则抓取联通 App 首页流量查询的 Cookie：
 *      https://raw.githubusercontent.com/dompling/Script/master/10010/index.js
 *   B. 手动：用抓包工具（Stream / Charles 等）打开联通 App → 首页流量查询，
 *      复制请求头里 Cookie 字段的值，运行时粘进弹窗即可。
 *   说明：联通 Cookie 有效期有限，可通过 BoxJS 更新；连接失败时保留本地缓存。
 */

const API_URL =
  'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven?version=iphone_c@8.0200&desmobiel=&showType=0';

// 也可直接在此硬编码 Cookie（留空则运行时弹窗输入并本地保存）
const COOKIE = '';
const BOXJS_URL = 'http://boxjs.com';
const BOXJS_KEY = 'ChinaUnicomCookie';

const fm = FileManager.local();
const cookieFile = fm.joinPath(fm.documentsDirectory(), 'ChinaUnicom.cookie.txt');

async function readBoxCookie() {
  try {
    const request = new Request(`${BOXJS_URL}/query/data/${encodeURIComponent(BOXJS_KEY)}`);
    request.timeoutInterval = 5;
    const data = await request.loadJSON();
    const value = data && (data.val ?? data.value);
    if (typeof value === 'string' && value.includes('=')) {
      const cookie = cleanCookie(value);
      fm.writeString(cookieFile, cookie);
      return cookie;
    }
  } catch (_) {
    /* BoxJS 未连接时使用本地缓存，不输出凭据。 */
  }
  return '';
}

async function loadCookie() {
  if (config.runsInWidget && fm.fileExists(cookieFile)) {
    const cached = fm.readString(cookieFile).trim();
    if (cached) return cleanCookie(cached);
  }
  const automatic = await readBoxCookie();
  if (automatic) return automatic;
  if (COOKIE && COOKIE.trim()) return cleanCookie(COOKIE);
  if (fm.fileExists(cookieFile)) {
    const saved = fm.readString(cookieFile).trim();
    if (saved) return cleanCookie(saved);
  }
  if (!config.runsInApp) return '';
  const alert = new Alert();
  alert.title = '中国联通组件';
  alert.message =
    '请粘贴联通 App 的 Cookie（打开联通 App 首页→流量查询，用 QX/Surge 重写或抓包工具获取请求头里的 Cookie）。';
  alert.addSecureTextField('粘贴 Cookie', '');
  alert.addAction('保存');
  alert.addCancelAction('取消');
  const r = await alert.present();
  if (r === 0) {
    const v = alert.textFieldValue(0).trim();
    if (v) {
      fm.writeString(cookieFile, v);
      return cleanCookie(v);
    }
  }
  return '';
}

// 去掉 Cookie 里的 Domain= / Path= 等属性，只保留干净的键值对
function cleanCookie(str) {
  return String(str)
    .split(';')
    .map((s) => s.trim().replace(/(^Domain\s*?=\s*?.+?$|^Path\s*?=\s*?.+?\s*?(,\s*|$))/gi, ''))
    .filter(Boolean)
    .join('; ');
}

// 四项（含可选积分）数据模型；has 表示该类型是否在接口返回中出现
const model = {
  fee: {
    title: '话费剩余',
    number: '--',
    unit: '元',
    icon: 'yensign.circle.fill',
    color: '#F86527',
    has: false,
  },
  flow: {
    title: '流量剩余',
    number: '--',
    unit: '',
    icon: 'antenna.radiowaves.left.and.right',
    color: '#1AB6F8',
    has: false,
  },
  voice: {
    title: '语音剩余',
    number: '--',
    unit: '',
    icon: 'phone.badge.waveform.fill',
    color: '#30D15B',
    has: false,
  },
  sms: {
    title: '短信剩余',
    number: '--',
    unit: '条',
    icon: 'message.fill',
    color: '#9B59B6',
    has: false,
  },
  point: {
    title: '剩余积分',
    number: '--',
    unit: '',
    icon: 'tag.fill',
    color: '#FC6D6D',
    has: false,
  },
};

function resetModel() {
  for (const k in model) {
    model[k].number = '--';
    model[k].has = false;
  }
}

async function fetchData(cookie) {
  const req = new Request(API_URL);
  req.timeoutInterval = 15;
  req.headers = { cookie: cookie, 'X-Scriptable-Unicom': '1' };
  const json = await req.loadJSON();
  if (!json || json.code !== 'Y') throw new Error('Cookie 错误或服务器维护');
  if (!json.data || !Array.isArray(json.data.dataList))
    throw new Error('接口数据格式异常，请稍后重试');
  resetModel();
  (json.data.dataList || []).forEach((item) => {
    const t = String(item.type || '').toLowerCase();
    let key = null;
    if (t === 'fee') key = 'fee';
    else if (t === 'flow') key = 'flow';
    else if (t === 'voice') key = 'voice';
    else if (t === 'sms' || t === 'message' || t === 'smsnum') key = 'sms';
    else if (t === 'mms') key = 'mms';
    else if (t === 'point' || t === 'score') key = 'point';
    if (!key || !model[key]) return;
    const d = model[key];
    d.number = item.number;
    d.unit = item.unit || d.unit;
    if (item.remainTitle) d.title = String(item.remainTitle).replace(/通用/g, '');
    d.has = true;
  });
  // 调试日志：在 Scriptable App 内运行入口可在控制台看到接口实际返回的类型，便于校准短信识别
  console.log(
    '[联通组件] 接口返回类型: ' + (json.data.dataList || []).map((i) => i.type).join(','),
  );
  await fetchSms(cookie);
  console.log(
    '[联通组件] 已识别: ' +
      Object.keys(model)
        .filter((k) => model[k].has)
        .join(','),
  );
}

let flowDetail = null;
async function fetchSms(cookie) {
  flowDetail = null;
  try {
    const req = new Request(
      'https://mxx.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune',
    );
    req.method = 'POST';
    req.timeoutInterval = 10;
    req.headers = {
      cookie,
      'X-Scriptable-Unicom': '1',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    req.body =
      'duanlianjieabc=&channelCode=&serviceType=&saleChannel=&externalSources=&contactCode=&ticket=&ticketPhone=&ticketChannel=&mobile1=&language=chinese';
    const data = await req.loadJSON();
    // 抓包中 flowtype=1 为通用流量，MB / 1024 与首页 GB 余量吻合。
    if (data && data.code === '0000' && Array.isArray(data.flowSumList)) {
      const row = data.flowSumList.find(
        (x) => String(x.flowtype) === '1' && String(x.elemtype) === '3',
      );
      if (row && row.xusedvalue != null && row.xcanusevalue != null) {
        const used = Number(row.xusedvalue) / 1024,
          remaining = Number(row.xcanusevalue) / 1024;
        const reported = Number(data.canUseFlowAll);
        // 校验单位与首页通用余量；口径不一致时不绘制进度。
        if (
          Number.isFinite(used) &&
          Number.isFinite(remaining) &&
          used >= 0 &&
          remaining >= 0 &&
          used + remaining > 0 &&
          data.canuseFlowAllUnit === 'GB' &&
          Math.abs(remaining - reported) < 0.02
        ) {
          flowDetail = { used, remaining, total: used + remaining };
        }
      }
    }
    if (
      data &&
      data.code === '0000' &&
      data.canUseSmsAll != null &&
      String(data.canUseSmsAll).trim() !== ''
    ) {
      model.sms.number = String(data.canUseSmsAll);
      model.sms.unit = data.canuseSmsAllUnit || '条';
      model.sms.has = true;
    }
  } catch (_) {
    console.log('[联通组件] 短信查询暂不可用');
  }
}

// 品牌图标缓存到本机，下载失败时回退系统符号。
let brandImage = null;
async function loadBrandImage() {
  const file = fm.joinPath(fm.documentsDirectory(), 'ChinaUnicom-brand.jpg');
  try {
    if (fm.fileExists(file)) {
      brandImage = fm.readImage(file);
      return;
    }
    const req = new Request('https://proxy.231127.xyz:8443/scripts/unicom/unicom-app-icon.jpg');
    req.timeoutInterval = 4;
    brandImage = await req.loadImage();
    fm.writeImage(file, brandImage);
  } catch (_) {
    /* 无网络时使用系统图标 */
  }
}
// UI v2 · 三尺寸自适应，所有余量均来自接口。
function ink() {
  return Color.dynamic(new Color('#20212A'), new Color('#F7F7FB'));
}
function muted() {
  return Color.dynamic(new Color('#757580'), new Color('#AAAAB8'));
}
function surface() {
  return Color.dynamic(new Color('#F3F4F8'), new Color('#252631'));
}
function label(parent, value, size, color, bold) {
  const t = parent.addText(String(value));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color || ink();
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.65;
  return t;
}
function symbol(parent, name, color, size) {
  const sf = SFSymbol.named(name) || SFSymbol.named('circle.fill');
  const image = parent.addImage(sf.image);
  image.tintColor = new Color(color);
  image.imageSize = new Size(size, size);
}
function valueOf(d) {
  return d.has && d.number != null ? String(d.number) : '—';
}
function clockText(date) {
  return [date.getHours(), date.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':');
}
function header(w, small) {
  const row = w.addStack();
  row.centerAlignContent();
  if (brandImage) {
    const logo = row.addImage(brandImage);
    logo.imageSize = new Size(small ? 22 : 28, small ? 22 : 28);
    logo.cornerRadius = small ? 6 : 8;
  } else symbol(row, 'antenna.radiowaves.left.and.right', '#E72439', small ? 18 : 22);
  row.addSpacer(5);
  label(row, '中国联通', small ? 11 : 13, ink(), true);
  row.addSpacer();
  label(row, small ? '10010' : 'CHINA UNICOM', 10, muted());
}
function balance(parent, size) {
  label(parent, '话费余额', 10, muted());
  parent.addSpacer(2);
  const row = parent.addStack();
  row.bottomAlignContent();
  const t = label(row, valueOf(model.fee), size, new Color('#E72439'), true);
  t.font = Font.boldRoundedSystemFont(size);
  row.addSpacer(3);
  label(row, model.fee.has ? '元' : '', 11, muted());
}
function compactRow(w, d, title) {
  const row = w.addStack();
  row.centerAlignContent();
  symbol(row, d.icon, d.color, 10);
  row.addSpacer(4);
  label(row, title, 10, muted());
  row.addSpacer();
  label(row, valueOf(d) + (d.has ? ' ' + d.unit : ''), 11, ink(), true);
}
function tile(parent, d, title, large) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = surface();
  card.cornerRadius = large ? 16 : 12;
  card.setPadding(large ? 11 : 6, 10, large ? 11 : 6, 10);
  const top = card.addStack();
  top.centerAlignContent();
  const badge = top.addStack();
  badge.setPadding(5, 5, 5, 5);
  badge.cornerRadius = large ? 9 : 7;
  badge.backgroundColor = new Color(d.color, 0.13);
  symbol(badge, d.icon, d.color, large ? 15 : 11);
  top.addSpacer(5);
  label(top, title, large ? 12 : 10, muted());
  top.addSpacer();
  card.addSpacer(large ? 8 : 4);
  const row = card.addStack();
  row.bottomAlignContent();
  label(row, valueOf(d), large ? 25 : 17, ink(), true);
  row.addSpacer(3);
  label(row, d.has ? d.unit : '', 10, muted());
  row.addSpacer();
  if (large) {
    card.addSpacer(5);
    label(card, d.has ? '套餐剩余' : '接口暂未提供', 10, muted());
  }
}
function techText(parent, text, size, color, bold) {
  const t = label(parent, text, size, new Color(color || '#EAF4FF'), bold);
  return t;
}
function techLine(parent, color, height) {
  const line = parent.addStack();
  line.backgroundColor = new Color(color);
  line.size = new Size(0, height || 1);
}
function techTile(parent, d, title, code) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color('#111F31');
  card.cornerRadius = 12;
  card.borderWidth = 1;
  card.borderColor = new Color(d.color, 0.35);
  card.setPadding(10, 11, 10, 11);
  const top = card.addStack();
  top.centerAlignContent();
  symbol(top, d.icon, d.color, 14);
  top.addSpacer(6);
  techText(top, title, 10, '#B3C7DD');
  top.addSpacer();
  techText(top, code, 8, '#66819D');
  card.addSpacer(7);
  const value = card.addStack();
  value.bottomAlignContent();
  techText(value, valueOf(d), 26, '#F1F8FF', true);
  value.addSpacer(3);
  techText(value, d.has ? d.unit : '', 10, '#90ABC6');
  value.addSpacer();
  card.addSpacer(7);
  techLine(card, d.color, 2);
}
function flowProgress(ratio) {
  const ctx = new DrawContext();
  ctx.size = new Size(600, 16);
  ctx.opaque = false;
  ctx.setFillColor(new Color('#26384B'));
  ctx.fillRect(new Rect(0, 0, 600, 16));
  ctx.setFillColor(new Color(ratio >= 0.9 ? '#FF677E' : '#40DDF1'));
  ctx.fillRect(new Rect(0, 0, 600 * Math.max(0, Math.min(1, ratio)), 16));
  return ctx.getImage();
}
function buildLargeDashboard(ok, message) {
  const w = new ListWidget();
  w.setPadding(15, 16, 13, 16);
  const gradient = new LinearGradient();
  gradient.colors = [new Color('#14283B'), new Color('#080F1C')];
  gradient.locations = [0, 1];
  w.backgroundGradient = gradient;
  const header = w.addStack();
  header.centerAlignContent();
  if (brandImage) {
    const logo = header.addImage(brandImage);
    logo.imageSize = new Size(24, 24);
    logo.cornerRadius = 6;
  }
  header.addSpacer(7);
  techText(header, '中国联通', 13, '#F4F8FF', true);
  header.addSpacer();
  techText(header, '流量监测', 10, '#4CDDED');
  w.addSpacer(12);
  const panel = w.addStack();
  panel.layoutVertically();
  panel.backgroundColor = new Color('#102437');
  panel.cornerRadius = 16;
  panel.borderWidth = 1;
  panel.borderColor = new Color('#2C667A');
  panel.setPadding(13, 13, 13, 13);
  const top = panel.addStack();
  techText(top, '通用流量 · 剩余', 11, '#B5CBDE');
  top.addSpacer();
  symbol(top, 'antenna.radiowaves.left.and.right', '#44DCF0', 16);
  panel.addSpacer(5);
  const amount = panel.addStack();
  amount.bottomAlignContent();
  techText(
    amount,
    flowDetail ? flowDetail.remaining.toFixed(2) : valueOf(model.flow),
    39,
    '#53E3F3',
    true,
  );
  amount.addSpacer(5);
  techText(amount, flowDetail ? 'GB' : model.flow.unit || '', 12, '#91ADC5');
  amount.addSpacer();
  panel.addSpacer(9);
  if (flowDetail) {
    const ratio = flowDetail.used / flowDetail.total;
    const caption = panel.addStack();
    techText(caption, '已用 ' + (ratio * 100).toFixed(1) + '%', 10, '#B0CADF');
    caption.addSpacer();
    techText(caption, '剩余 ' + ((1 - ratio) * 100).toFixed(1) + '%', 10, '#53E3F3');
    panel.addSpacer(6);
    const bar = panel.addImage(flowProgress(ratio));
    bar.resizable = true;
    bar.imageSize = new Size(0, 7);
    bar.cornerRadius = 3;
    panel.addSpacer(9);
    const stats = panel.addStack();
    const total = stats.addStack();
    total.layoutVertically();
    techText(total, '套餐总量', 9, '#8AA6BE');
    total.addSpacer(3);
    techText(total, flowDetail.total.toFixed(2) + ' GB', 15, '#F2F8FF', true);
    stats.addSpacer();
    const used = stats.addStack();
    used.layoutVertically();
    techText(used, '已用流量', 9, '#8AA6BE');
    used.addSpacer(3);
    techText(used, flowDetail.used.toFixed(2) + ' GB', 15, '#F2F8FF', true);
    panel.addSpacer(7);
    techText(panel, '总量按接口已用＋剩余计算 · 不含定向流量', 8, '#7896AE');
  } else {
    techText(panel, '流量明细暂不可用', 10, '#9BB5CC');
    panel.addSpacer(5);
    techText(panel, '暂不计算总量与使用进度', 9, '#7896AE');
  }
  w.addSpacer(10);
  const first = w.addStack();
  miniMetric(first, model.fee, '话费余额');
  first.addSpacer(9);
  miniMetric(first, model.voice, '语音剩余');
  w.addSpacer(8);
  const second = w.addStack();
  miniMetric(second, model.sms, '短信剩余');
  second.addSpacer(9);
  miniMetric(second, model.point, '可用积分');
  w.addSpacer();
  const footer = w.addStack();
  techText(
    footer,
    ok ? '↻ ' + clockText(new Date()) + ' 更新' : '更新失败 · 请在 App 内查看',
    9,
    ok ? '#89A5BE' : '#FF677E',
  );
  footer.addSpacer();
  techText(footer, '以联通 App 为准', 8, '#7896AE');
  return w;
}
function miniMetric(parent, d, title) {
  const card = parent.addStack();
  card.centerAlignContent();
  card.backgroundColor = new Color('#142234');
  card.cornerRadius = 10;
  card.setPadding(9, 10, 9, 10);
  symbol(card, d.icon, d.color, 14);
  card.addSpacer(7);
  const info = card.addStack();
  info.layoutVertically();
  techText(info, title, 9, '#95AEC5');
  info.addSpacer(3);
  techText(info, valueOf(d) + (d.has ? ' ' + d.unit : ''), 14, '#F0F7FF', true);
  card.addSpacer();
}

async function buildWidget(family, ok, message) {
  if (family === 'large') return buildLargeDashboard(ok, message);
  const small = family === 'small',
    large = family === 'large';
  const w = new ListWidget();
  w.setPadding(small ? 12 : 16, 16, small ? 12 : 14, 16);
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#FFFFFF'), new Color('#20212C')),
    Color.dynamic(new Color('#FFF5F6'), new Color('#16171E')),
  ];
  gradient.locations = [0, 1];
  w.backgroundGradient = gradient;
  header(w, small);
  w.addSpacer(small ? 5 : 8);
  if (small) {
    balance(w, 27);
    w.addSpacer(5);
    compactRow(w, model.flow, '流量');
    w.addSpacer(3);
    compactRow(w, model.voice, '语音');
    w.addSpacer(3);
    compactRow(w, model.sms, '短信');
  } else if (large) {
    const hero = w.addStack();
    hero.layoutVertically();
    hero.backgroundColor = Color.dynamic(new Color('#FFF0F2'), new Color('#332027'));
    hero.cornerRadius = 18;
    hero.setPadding(14, 16, 14, 16);
    balance(hero, 38);
    w.addSpacer(12);
    const first = w.addStack();
    tile(first, model.flow, '通用流量', true);
    first.addSpacer(10);
    tile(first, model.voice, '语音通话', true);
    w.addSpacer(10);
    const second = w.addStack();
    tile(second, model.sms, '短信', true);
    second.addSpacer(10);
    tile(second, model.point, '可用积分', true);
  } else {
    const hero = w.addStack();
    hero.centerAlignContent();
    const amount = hero.addStack();
    amount.layoutVertically();
    balance(amount, 30);
    hero.addSpacer();
    const points = hero.addStack();
    points.layoutVertically();
    label(points, '可用积分', 10, muted());
    points.addSpacer(3);
    label(points, valueOf(model.point), 18, ink(), true);
    w.addSpacer(9);
    const cards = w.addStack();
    tile(cards, model.flow, '流量', false);
    cards.addSpacer(7);
    tile(cards, model.voice, '语音', false);
    cards.addSpacer(7);
    tile(cards, model.sms, '短信', false);
  }
  w.addSpacer();
  const footer = w.addStack();
  footer.centerAlignContent();
  label(
    footer,
    ok ? '更新 ' + clockText(new Date()) : '更新失败 · 请在 App 内查看',
    small ? 8 : 9,
    ok ? muted() : new Color('#E72439'),
  );
  if (!small && ok) {
    footer.addSpacer();
    label(footer, '余量以联通 App 为准', 9, muted());
  }
  if (!ok && !small) {
    w.addSpacer(3);
    label(w, message || '暂时无法获取数据', 9, new Color('#E72439'));
  }
  return w;
}

// 入口会调用这个函数；组件与 App 内预览都从这里走
async function main() {
  let cookie = '';
  try {
    cookie = await loadCookie();
  } catch (e) {
    console.log('读取配置失败，请在 App 内重新配置');
  }
  let ok = true;
  let msg = '';
  if (!cookie) {
    ok = false;
    msg = '未配置 Cookie';
  } else {
    try {
      await fetchData(cookie);
    } catch (e) {
      ok = false;
      msg = String(e.message || e);
      // 请求失败时保留本地配置
      // 网络失败或服务器维护时保留凭据，避免误删。
    }
  }

  let family = config.widgetFamily;
  if (!config.runsInWidget) {
    const menu = new Alert();
    menu.title = '联通组件预览';
    menu.message = '选择组件尺寸';
    menu.addAction('小号 · 随手查看');
    menu.addAction('中号 · 余量卡片');
    menu.addAction('大号 · 完整面板');
    menu.addCancelAction('取消');
    const selected = await menu.presentSheet();
    if (selected < 0) {
      Script.complete();
      return;
    }
    family = ['small', 'medium', 'large'][selected];
  }
  await loadBrandImage();
  const widget = await buildWidget(family || 'medium', ok, msg);
  if (config.runsInWidget) Script.setWidget(widget);
  else if (family === 'small') await widget.presentSmall();
  else if (family === 'large') await widget.presentLarge();
  else await widget.presentMedium();
  Script.complete();
}

module.exports = { main };
