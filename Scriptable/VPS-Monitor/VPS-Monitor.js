// Variables used by Scriptable.
// icon-color: blue; icon-glyph: server;
const namespace = encodeURIComponent(Script.name());
const fm = FileManager.local(),
  file = fm.joinPath(fm.libraryDirectory(), 'vps-monitor-single-' + namespace + '.json');
let servers = [];
try {
  if (fm.fileExists(file)) servers = JSON.parse(fm.readString(file));
} catch (_) {}
// 原始脚本仅迁移旧配置的第一台；副本始终独立配置。
if (!fm.fileExists(file) && Script.name() === 'VPS-Monitor') {
  try {
    const legacy = fm.joinPath(fm.libraryDirectory(), 'vps-monitor-servers-v1.json');
    if (fm.fileExists(legacy)) {
      const old = JSON.parse(fm.readString(legacy));
      if (old.length) {
        servers = [old[0]];
        const oldKey = 'vps-monitor-' + old[0].id;
        if (Keychain.contains(oldKey))
          Keychain.set('vps-monitor-' + namespace + '-' + old[0].id, Keychain.get(oldKey));
        fm.writeString(file, JSON.stringify(servers));
      }
    }
  } catch (_) {}
}
const key = (id) => 'vps-monitor-' + namespace + '-' + id;
const save = () => {
  servers = servers.slice(0, 1);
  fm.writeString(file, JSON.stringify(servers));
};
async function menu(title, items) {
  const a = new Alert();
  a.title = title;
  items.forEach((t) => a.addAction(t));
  a.addCancelAction('取消');
  return await a.presentSheet();
}
async function edit(index) {
  const old = servers[index] || { id: UUID.string(), name: '新服务器', url: '' };
  const a = new Alert();
  a.title = '服务器配置';
  a.message = '填写 HTTPS 监控接口，不是 SSH 地址。令牌保存在 Keychain。';
  a.addTextField('名称，例如韩国', old.name);
  a.addTextField('https://域名/v1/status', old.url);
  a.addSecureTextField('访问令牌（留空保留）', '');
  a.addAction('保存');
  a.addCancelAction('取消');
  if ((await a.presentAlert()) !== 0) return;
  const name = a.textFieldValue(0).trim(),
    url = a.textFieldValue(1).trim(),
    token = a.textFieldValue(2).trim();
  if (!name || !/^https:\/\//i.test(url)) {
    const e = new Alert();
    e.title = '名称不能为空，接口必须使用 HTTPS';
    e.addAction('知道了');
    await e.presentAlert();
    return;
  }
  if (token) Keychain.set(key(old.id), token);
  servers[index] = { id: old.id, name, url };
  save();
}
async function query(s) {
  const cache = fm.joinPath(fm.libraryDirectory(), key(s.id) + '.json');
  try {
    if (!Keychain.contains(key(s.id))) throw Error('未配置令牌');
    const req = new Request(s.url);
    req.timeoutInterval = 7;
    req.headers = { Authorization: 'Bearer ' + Keychain.get(key(s.id)) };
    const d = await req.loadJSON();
    if (
      req.response.statusCode !== 200 ||
      d.version !== 1 ||
      !Number.isFinite(d.timestamp) ||
      !d.cpu ||
      !d.memory ||
      !d.disk ||
      !d.network
    )
      throw Error('接口不兼容');
    fm.writeString(cache, JSON.stringify(d));
    return { s, d, stale: Date.now() / 1000 - d.timestamp > 60 };
  } catch (_) {
    try {
      return { s, d: JSON.parse(fm.readString(cache)), stale: true };
    } catch (_) {
      return { s, d: null, stale: true };
    }
  }
}
function text(p, v, size, color = '#EAF4FF', bold = false) {
  const t = p.addText(String(v));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}
function percent(n) {
  return Number.isFinite(n) ? n.toFixed(0) + '%' : '—';
}
function bytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'G';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + 'M';
  return (n / 1024).toFixed(0) + 'K';
}
function bar(p, n, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(300, 8);
  ctx.opaque = false;
  ctx.setFillColor(new Color('#2C3C53'));
  ctx.fillRect(new Rect(0, 0, 300, 8));
  ctx.setFillColor(new Color(color));
  ctx.fillRect(new Rect(0, 0, 3 * Math.min(100, Math.max(0, n || 0)), 8));
  const i = p.addImage(ctx.getImage());
  i.imageSize = new Size(120, 4);
  i.resizable = true;
}
function metric(p, title, n, color) {
  const c = p.addStack();
  c.layoutVertically();
  const r = c.addStack();
  text(r, title, 9, '#8FA7C4');
  r.addSpacer();
  text(r, percent(n), 11, color, true);
  c.addSpacer(4);
  bar(c, n, color);
}
function title(p, r) {
  const row = p.addStack();
  row.centerAlignContent();
  text(row, r.stale ? '●' : '●', 10, r.stale ? '#FFB75F' : '#43E2B2');
  row.addSpacer(5);
  text(row, r.s.name, 13, '#EDF5FF', true);
  row.addSpacer();
  text(row, r.d ? (r.stale ? '缓存/过期' : '已连接') : '连接失败', 9, '#92ABC9');
}
let demoMode = args.widgetParameter === 'demo';
function demoResults() {
  return ['美国 · US', '韩国 · KR', '巴西 · BR'].map((name, i) => ({
    s: { name },
    stale: false,
    d: {
      timestamp: Date.now() / 1000,
      cpu: { percent: [24, 38, 12][i], cores: 2, load: [0.42, 0.35, 0.28] },
      memory: {
        percent: [48, 63, 31][i],
        used: [1.9, 2.5, 1.2][i] * 1073741824,
        total: 4 * 1073741824,
      },
      disk: { percent: [36, 52, 27][i], used: 18 * 1073741824, total: 50 * 1073741824 },
      network: {
        rxBytes: 125 * 1073741824,
        txBytes: 68 * 1073741824,
        rxBytesPerSecond: [820000, 2400000, 128000][i],
        txBytesPerSecond: [320000, 780000, 64000][i],
      },
      hostname: 'demo-vps',
      uptime: (i + 3) * 86400,
    },
  }));
}
function resourceChart(p, d, small, height, width) {
  const ctx = new DrawContext();
  ctx.size = new Size(small ? 240 : 600, small ? 150 : 100);
  ctx.opaque = false;
  if (small) {
    const center = new Point(74, 74),
      radius = 54;
    const known = Number.isFinite(d.cpu.percent),
      ratio = known ? Math.max(0, Math.min(1, d.cpu.percent / 100)) : 0;
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2 - Math.PI / 2;
      ctx.setFillColor(new Color(i < ratio * 100 ? '#59DDF2' : '#2C3C53'));
      ctx.fillEllipse(
        new Rect(
          center.x + Math.cos(angle) * radius - 4,
          center.y + Math.sin(angle) * radius - 4,
          8,
          8,
        ),
      );
    }
    ctx.setTextColor(new Color('#EAF4FF'));
    ctx.setFont(Font.boldSystemFont(25));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(percent(d.cpu.percent), new Rect(20, 54, 108, 34));
    ctx.setFont(Font.systemFont(13));
    ctx.setTextColor(new Color('#8FA7C4'));
    ctx.drawTextInRect('CPU', new Rect(20, 88, 108, 22));
    ctx.setTextAlignedLeft();
    ctx.setFont(Font.boldSystemFont(16));
    ctx.setTextColor(new Color('#B197FF'));
    ctx.drawText('内存 ' + percent(d.memory.percent), new Point(150, 43));
    ctx.setTextColor(new Color('#FFBA71'));
    ctx.drawText('磁盘 ' + percent(d.disk.percent), new Point(150, 83));
  } else {
    const entries = [
      ['CPU', d.cpu.percent, '#59DDF2'],
      ['内存', d.memory.percent, '#B197FF'],
      ['磁盘', d.disk.percent, '#FFBA71'],
    ];
    entries.forEach((v, i) => {
      const y = i * 33;
      ctx.setFont(Font.systemFont(15));
      ctx.setTextColor(new Color('#B6CBE0'));
      ctx.drawText(v[0], new Point(0, y));
      ctx.setFillColor(new Color('#2C3C53'));
      ctx.fillRect(new Rect(60, y + 3, 450, 15));
      ctx.setFillColor(new Color(v[2]));
      ctx.fillRect(new Rect(60, y + 3, (450 * Math.max(0, Math.min(100, v[1] || 0))) / 100, 15));
      ctx.setTextColor(new Color(v[2]));
      ctx.drawText(percent(v[1]), new Point(525, y));
    });
  }
  const image = p.addImage(ctx.getImage());
  image.resizable = true;
  image.imageSize = new Size(
    width || (small ? 130 : 270),
    small ? (width === 150 ? 86 : 76) : height || 45,
  );
}
function infoRow(parent, name, value, color) {
  const row = parent.addStack();
  text(row, name, 12, '#A4BBD3');
  row.addSpacer();
  text(row, value, 13, color || '#F0F6FF', true);
}
function largeTile(parent, name, value, detail, color) {
  const c = parent.addStack();
  c.layoutVertically();
  c.backgroundColor = new Color('#1D324C');
  c.cornerRadius = 12;
  c.setPadding(6, 10, 6, 10);
  text(c, name, 10, '#A4BBD3');
  c.addSpacer(2);
  text(c, value, 20, color, true);
  c.addSpacer(2);
  text(c, detail, 9, '#9AB2CD');
  c.addSpacer();
}
function denseDashboard(d, family) {
  const large = family === 'large',
    W = 900,
    H = large ? 840 : 270;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  function txt(t, x, y, size, color, bold) {
    ctx.setTextAlignedLeft();
    ctx.setFont(bold ? Font.boldSystemFont(size) : Font.systemFont(size));
    ctx.setTextColor(new Color(color || '#EAF4FF'));
    ctx.drawTextInRect(String(t), new Rect(x, y, W - x - 12, size * 1.5));
  }
  function rect(x, y, w, h, color) {
    ctx.setFillColor(new Color(color));
    ctx.fillRect(new Rect(x, y, w, h));
  }
  function line(y) {
    rect(0, y, W, 2, '#31526E');
  }
  const colors = ['#54E6FF', '#C1A2FF', '#FFC47A'];
  const rows = [
    ['CPU', d.cpu.percent],
    ['内存', d.memory.percent],
    ['磁盘', d.disk.percent],
  ];
  rows.forEach((v, i) => {
    const x = i * 305;
    rect(x, 0, 285, large ? 175 : 155, '#162F49');
    txt(v[0] + ' / USAGE', x + 16, 12, 27, '#A4BED7');
    txt(percent(v[1]), x + 16, 44, large ? 79 : 68, colors[i], true);
    rect(x + 16, large ? 146 : 128, 250, 8, '#30445D');
    rect(
      x + 16,
      large ? 146 : 128,
      (250 * Math.min(100, Math.max(0, v[1] || 0))) / 100,
      8,
      colors[i],
    );
  });
  if (!large) {
    txt('↓ ' + bytes(d.network.rxBytesPerSecond) + '/s', 5, 170, 45, '#68E7CC', true);
    txt('↑ ' + bytes(d.network.txBytesPerSecond) + '/s', 470, 170, 45, '#76BFFF', true);
    txt(
      '运行 ' + Math.floor(d.uptime / 86400) + ' 天 · ' + (d.cpu.cores || '—') + ' 核',
      5,
      231,
      27,
      '#A4BED7',
    );
    return ctx.getImage();
  }
  line(195);
  txt('PROCESSOR / 处理器', 0, 210, 25, '#64DCFA');
  txt((d.cpu.cores || '—') + ' 核', 660, 205, 36, '#EAF4FF', true);
  txt('负载 1 / 5 / 15 分钟', 0, 254, 27, '#A4BED7');
  txt(
    Array.isArray(d.cpu.load) ? d.cpu.load.map((n) => Number(n).toFixed(2)).join(' / ') : '—',
    420,
    249,
    35,
    '#EAF4FF',
    true,
  );
  line(300);
  const gb = (n) => (Number.isFinite(n) ? (n / 1073741824).toFixed(2) + ' GB' : '—');
  function capacity(y, name, o, color) {
    txt(name, 0, y, 29, color, true);
    txt('已用 ' + gb(o.used), 0, y + 43, 33, '#EAF4FF', true);
    txt('总量 ' + gb(o.total), 450, y + 43, 30, '#B4CAE0');
    txt(
      '可用 ' +
        gb(
          Number.isFinite(o.total) && Number.isFinite(o.used)
            ? Math.max(0, o.total - o.used)
            : null,
        ),
      450,
      y,
      30,
      '#B4CAE0',
    );
  }
  capacity(316, 'MEMORY / 内存', d.memory, colors[1]);
  line(410);
  capacity(425, 'DISK / 根分区', d.disk, colors[2]);
  line(520);
  txt('NETWORK / 网络吞吐', 0, 535, 25, '#64DCFA');
  txt('下载 ↓', 0, 579, 28, '#A4BED7');
  txt('上传 ↑', 470, 579, 28, '#A4BED7');
  txt(bytes(d.network.rxBytesPerSecond) + '/s', 0, 618, 61, '#68E7CC', true);
  txt(bytes(d.network.txBytesPerSecond) + '/s', 470, 618, 61, '#76BFFF', true);
  txt('累计 ' + gb(d.network.rxBytes), 0, 696, 29, '#A4BED7');
  txt('累计 ' + gb(d.network.txBytes), 470, 696, 29, '#A4BED7');
  line(746);
  txt('UPTIME / 连续运行', 0, 762, 23, '#64DCFA');
  const days = Math.floor(d.uptime / 86400),
    hours = Math.floor((d.uptime % 86400) / 3600),
    mins = Math.floor((d.uptime % 3600) / 60);
  txt(days + '天 ' + hours + '小时 ' + mins + '分钟', 0, 795, 32, '#EAF4FF', true);
  return ctx.getImage();
}
async function build(family) {
  const w = new ListWidget();
  w.setPadding(12, 14, 10, 14);
  const g = new LinearGradient();
  g.colors = [new Color('#203B58'), new Color('#0B1527')];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = 'scriptable:///run?scriptName=' + encodeURIComponent(Script.name());
  w.refreshAfterDate = new Date(Date.now() + 5 * 60000);
  if (!servers.length && !demoMode) {
    text(w, 'VPS MONITOR', 19, '#66DDF5', true);
    w.addSpacer(12);
    text(w, '运行脚本配置服务器', 14);
    return w;
  }
  const r = demoMode ? demoResults()[0] : await query(servers[0]);
  const header = w.addStack();
  header.centerAlignContent();
  text(header, '●', 12, r.stale ? '#FFBC71' : '#51E5BA');
  header.addSpacer(6);
  text(header, r.s.name, family === 'small' ? 15 : 19, '#F3F8FF', true);
  header.addSpacer();
  if (family !== 'small')
    text(
      header,
      r.d ? (r.stale ? '数据过期' : '在线监测') : '连接失败',
      11,
      r.stale ? '#FFBC71' : '#51E5BA',
    );
  if (!r.d) {
    w.addSpacer(14);
    text(w, '无法获取监控数据', 15, '#FFA179');
    w.addSpacer(7);
    text(w, '点击检查接口与令牌', 12, '#A4BBD3');
    return w;
  }
  const d = r.d,
    uptime = Math.floor(d.uptime / 86400) + '天 ' + Math.floor((d.uptime % 86400) / 3600) + '小时';
  if (family === 'small') {
    w.addSpacer(6);
    resourceChart(w, d, true, 0, 132);
    w.addSpacer(5);
    text(
      w,
      '↓ ' +
        bytes(d.network.rxBytesPerSecond) +
        '/s  ↑ ' +
        bytes(d.network.txBytesPerSecond) +
        '/s',
      11,
      '#7DE9D3',
      true,
    );
  } else {
    w.addSpacer(7);
    const chart = w.addImage(denseDashboard(d, family));
    chart.resizable = true;
    chart.imageSize = new Size(300, family === 'large' ? 280 : 90);
  }

  w.addSpacer();
  const foot = w.addStack();
  text(
    foot,
    demoMode
      ? '演示数据'
      : r.stale
        ? '缓存 / 过期'
        : '更新 ' + new Date(d.timestamp * 1000).toLocaleTimeString(),
    family === 'small' ? 9 : 10,
    '#92ADC8',
  );
  if (family === 'large') {
    foot.addSpacer();
    text(foot, '累计自开机 · ' + (d.hostname || 'VPS'), 9, '#92ADC8');
  }
  return w;
}
if (config.runsInWidget) {
  Script.setWidget(await build(config.widgetFamily || 'medium'));
} else {
  while (true) {
    const n = await menu(Script.name(), [
      '配置本脚本的服务器',
      '预览小号',
      '预览中号',
      '预览大号',
      '演示三种尺寸',
    ]);
    if (n < 0) break;
    if (n === 0) await edit(0);
    else if (n === 1) await (await build('small')).presentSmall();
    else if (n === 2) await (await build('medium')).presentMedium();
    else if (n === 3) await (await build('large')).presentLarge();
    else {
      demoMode = true;
      await (await build('small')).presentSmall();
      await (await build('medium')).presentMedium();
      await (await build('large')).presentLarge();
      demoMode = false;
    }
  }
}
Script.complete();
