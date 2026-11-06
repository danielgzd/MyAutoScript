// Variables used by Scriptable.
// icon-color: purple; icon-glyph: rocket;
// 自定义快捷启动 · 独立脚本。配置保存在 Scriptable 本机 Library。
const fm = FileManager.local();
const settingsPath = fm.joinPath(fm.libraryDirectory(), 'AI-QuickLaunch-v1.json');
const scriptURL = 'scriptable:///run?scriptName=' + encodeURIComponent(Script.name());
const palettes = ['#298BFF', '#35C77E', '#FFAE36', '#B46CFF'];
const defaults = {
  selected: 0,
  groups: [
    {
      name: '日常',
      subtitle: '随手可用',
      items: [
        { name: '网页', symbol: 'globe', color: '#298BFF', url: 'https://www.apple.com.cn' },
        {
          name: '快捷指令',
          symbol: 'square.stack.3d.up.fill',
          color: '#AA66EE',
          url: 'shortcuts://',
        },
        { name: '地图', symbol: 'map.fill', color: '#35C77E', url: 'https://maps.apple.com/' },
        { name: '设置', symbol: 'gearshape.fill', color: '#8290A5', url: 'app-settings:' },
      ],
    },
    {
      name: '工作',
      subtitle: '专注与效率',
      items: [
        { name: '邮件', symbol: 'envelope.fill', color: '#298BFF', url: 'mailto:' },
        { name: '日历', symbol: 'calendar', color: '#FF6477', url: 'calshow:' },
        { name: '提醒事项', symbol: 'checklist', color: '#FFAE36', url: 'x-apple-reminderkit://' },
        { name: '文件', symbol: 'folder.fill', color: '#298BFF', url: 'shareddocuments://' },
      ],
    },
    {
      name: '喜爱',
      subtitle: '你的常用入口',
      items: [
        { name: '音乐', symbol: 'music.note', color: '#FF5379', url: 'music://' },
        { name: '照片', symbol: 'photo.fill', color: '#B46CFF', url: 'photos-redirect://' },
        { name: '搜索', symbol: 'magnifyingglass', color: '#35C77E', url: 'https://www.bing.com' },
        { name: 'Scriptable', symbol: 'terminal.fill', color: '#298BFF', url: 'scriptable://' },
      ],
    },
  ],
};
let settings = defaults;
try {
  if (fm.fileExists(settingsPath)) settings = JSON.parse(fm.readString(settingsPath));
} catch (_) {
  settings = defaults;
}
function save() {
  fm.writeString(settingsPath, JSON.stringify(settings, null, 2));
}
async function choose(title, items) {
  const a = new Alert();
  a.title = title;
  items.forEach((x) => a.addAction(x));
  a.addCancelAction('取消');
  return await a.presentSheet();
}
async function fields(title, labels, values) {
  const a = new Alert();
  a.title = title;
  labels.forEach((x, i) => a.addTextField(x, String(values[i] || '')));
  a.addAction('保存');
  a.addCancelAction('取消');
  return (await a.presentAlert()) === 0 ? labels.map((_, i) => a.textFieldValue(i).trim()) : null;
}
async function editItem(g, index) {
  const old = g.items[index] || {
    name: '新快捷方式',
    symbol: 'star.fill',
    color: '#298BFF',
    url: 'https://',
  };
  const kind = await choose('快捷方式类型', ['App / 网页 URL', '运行苹果快捷指令']);
  if (kind < 0) return;
  const v = await fields(
    '编辑快捷方式',
    [
      '名称',
      'SF Symbol 图标（如 bolt.fill）',
      kind === 1 ? '快捷指令名称' : '启动 URL',
      '颜色（如 #298BFF）',
    ],
    [old.name, old.symbol, kind === 1 ? '' : old.url, old.color],
  );
  if (!v) return;
  if (!v[0] || !v[2]) return;
  let url = kind === 1 ? 'shortcuts://run-shortcut?name=' + encodeURIComponent(v[2]) : v[2];
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    const a = new Alert();
    a.title = '链接需包含协议';
    a.message = '例如 https://example.com 或 App 的 URL Scheme。';
    a.addAction('知道了');
    await a.presentAlert();
    return;
  }
  g.items[index] = {
    name: v[0],
    symbol: v[1] || 'star.fill',
    url,
    color: /^#[0-9a-f]{6}$/i.test(v[3]) ? v[3] : '#298BFF',
  };
  save();
}
async function editGroup(index) {
  const g = settings.groups[index];
  const action = await choose(g.name, [
    '修改分组名称与副标题',
    '添加快捷方式',
    ...g.items.map((x) => '编辑 · ' + x.name),
    '删除快捷方式',
  ]);
  if (action === 0) {
    const v = await fields('分组', ['名称', '副标题'], [g.name, g.subtitle]);
    if (v && v[0]) {
      g.name = v[0];
      g.subtitle = v[1];
      save();
    }
  } else if (action === 1) {
    if (g.items.length >= 4) {
      const a = new Alert();
      a.title = '每组最多四个图标';
      a.addAction('知道了');
      await a.presentAlert();
    } else await editItem(g, g.items.length);
  } else if (action >= 2 && action < g.items.length + 2) await editItem(g, action - 2);
  else if (action === g.items.length + 2) {
    const n = await choose(
      '删除哪个快捷方式？',
      g.items.map((x) => x.name),
    );
    if (n >= 0) {
      g.items.splice(n, 1);
      save();
    }
  }
}
function text(p, s, size, color, bold) {
  const t = p.addText(String(s));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}
function icon(p, item, size) {
  const box = p.addStack();
  box.size = new Size(size, size);
  box.cornerRadius = size * 0.32;
  box.backgroundColor = new Color(item.color);
  box.centerAlignContent();
  box.addSpacer();
  const col = box.addStack();
  col.layoutVertically();
  col.addSpacer();
  const sf = SFSymbol.named(item.symbol) || SFSymbol.named('star.fill');
  const image = col.addImage(sf.image);
  image.imageSize = new Size(size * 0.52, size * 0.52);
  image.tintColor = Color.white();
  col.addSpacer();
  box.addSpacer();
  box.url = item.url;
}
function card(p, g, small) {
  const c = p.addStack();
  c.layoutVertically();
  c.backgroundColor = new Color('#FFFFFF', 0.48);
  c.cornerRadius = 22;
  c.borderWidth = 1;
  c.borderColor = new Color('#FFFFFF', 0.65);
  c.setPadding(small ? 11 : 13, 13, small ? 11 : 13, 13);
  const row = c.addStack();
  text(row, g.name, small ? 13 : 16, '#20233B', true);
  row.addSpacer();
  text(row, String(g.items.length), 10, '#6F7092');
  if (!small) {
    c.addSpacer(2);
    text(c, g.subtitle || '快捷启动', 10, '#747491');
  }
  c.addSpacer(small ? 9 : 13);
  const icons = c.addStack();
  icons.centerAlignContent();
  g.items.forEach((item, i) => {
    if (i) icons.addSpacer();
    icon(icons, item, small ? 33 : 44);
  });
  if (!g.items.length) text(icons, '在脚本中添加快捷方式', 10, '#747491');
}
function widget(family) {
  const w = new ListWidget();
  w.setPadding(13, 13, 13, 13);
  const gradient = new LinearGradient();
  gradient.colors = [new Color('#D4B0FB'), new Color('#88BFFC')];
  gradient.locations = [0, 1];
  w.backgroundGradient = gradient;
  const n = Number(args.widgetParameter);
  const index =
    args.widgetParameter !== null &&
    args.widgetParameter !== undefined &&
    args.widgetParameter !== '' &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= settings.groups.length
      ? n - 1
      : Math.min(settings.selected, settings.groups.length - 1);
  const selected = settings.groups[index] || settings.groups[0];
  if (family === 'small') {
    text(w, selected.name, 15, '#20233B', true);
    w.addSpacer(10);
    const items = selected.items;
    for (let r = 0; r < 2; r++) {
      const row = w.addStack();
      for (let c = 0; c < 2; c++) {
        const item = items[r * 2 + c];
        if (c) row.addSpacer();
        if (item) icon(row, item, 43);
      }
      if (r === 0) w.addSpacer(9);
    }
    w.addSpacer();
  } else if (family === 'medium') {
    card(w, selected, false);
    w.addSpacer();
    const f = w.addStack();
    text(f, '快捷启动', 9, '#4E6087');
    f.addSpacer();
    text(f, '点击此处编辑 ↗', 9, '#4E6087');
    f.url = scriptURL;
  } else {
    const body = w.addStack();
    const content = body.addStack();
    content.layoutVertically();
    settings.groups.slice(0, 3).forEach((g, i) => {
      if (i) content.addSpacer(9);
      card(content, g, false);
    });
    body.addSpacer(9);
    const rail = body.addStack();
    rail.layoutVertically();
    rail.backgroundColor = new Color('#FFFFFF', 0.3);
    rail.cornerRadius = 20;
    rail.setPadding(10, 5, 10, 5);
    text(rail, '分组', 9, '#5D638A');
    rail.addSpacer();
    settings.groups.forEach((g, i) => {
      const tab = rail.addStack();
      tab.setPadding(9, 5, 9, 5);
      tab.cornerRadius = 13;
      if (i === index) tab.backgroundColor = new Color('#298BFF');
      text(tab, g.name.slice(0, 2), 11, i === index ? '#FFFFFF' : '#303A5A', true);
      tab.url = scriptURL + '&group=' + i;
      rail.addSpacer();
    });
    const foot = w.addStack();
    w.addSpacer(3);
    text(foot, '图标直达 · 侧栏打开分组预览', 8, '#455D86');
  }
  w.url = scriptURL;
  return w;
}
async function main() {
  if (config.runsInWidget) {
    Script.setWidget(widget(config.widgetFamily || 'medium'));
    Script.complete();
    return;
  }
  const requested = Number(args.queryParameters.group);
  if (
    args.queryParameters.group !== undefined &&
    Number.isInteger(requested) &&
    settings.groups[requested]
  ) {
    settings.selected = requested;
    save();
    await widget('medium').presentMedium();
    Script.complete();
    return;
  }
  while (true) {
    const action = await choose('快捷启动 · 自定义', [
      '预览小号',
      '预览中号',
      '预览大号',
      '选择默认分组',
      ...settings.groups.map((g) => '编辑 · ' + g.name),
    ]);
    if (action < 0) break;
    if (action === 0) await widget('small').presentSmall();
    else if (action === 1) await widget('medium').presentMedium();
    else if (action === 2) await widget('large').presentLarge();
    else if (action === 3) {
      const n = await choose(
        '默认分组',
        settings.groups.map((g) => g.name),
      );
      if (n >= 0) {
        settings.selected = n;
        save();
      }
    } else await editGroup(action - 4);
  }
  Script.complete();
}
await main();
