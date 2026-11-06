// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: mobile-alt;

/*
 * 中国联通组件 · 入口
 * --------------------------------------------------
 * 核心逻辑在同目录的 ChinaUnicomCore.js（同目录 import 最稳，兼容所有 Scriptable 版本）。
 * 子文件夹 10010/ChinaUnicom.js 只是一个转发壳，环境支持时会用，不支持时自动回退根核心。
 *
 * 加组件请选本脚本（根目录 ChinaUnicom.js）。
 */

(async () => {
  // 根核心优先（同目录最稳），再依次尝试子文件夹壳，兼容不同 Scriptable 版本
  const candidates = [
    'ChinaUnicomCore',
    './10010/ChinaUnicom',
    '10010/ChinaUnicom',
    '/10010/ChinaUnicom',
  ];
  let core = null;
  for (const c of candidates) {
    try {
      const m = importModule(c);
      if (m && m.main) { core = m; break; }
    } catch (e) {
      // 该路径写法在本版本不可用，尝试下一个
    }
  }

  if (!core || !core.main) {
    const w = new ListWidget();
    const t = w.addText('未找到核心模块\n请确认 ChinaUnicomCore.js 已同步到 iPhone');
    t.font = Font.systemFont(12);
    t.textColor = new Color('#E53935');
    if (config.runsInWidget) Script.setWidget(w);
    else w.presentSmall();
    Script.complete();
    return;
  }

  await core.main();
})();
