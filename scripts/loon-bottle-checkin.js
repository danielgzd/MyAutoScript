/**
 * 瓶心 / 瓶子：Loon 签到、任务与 BoxJS。
 * 源码：https://github.com/danielgzd/MyAutoScript
 * 无内置凭证。accessToken、time、mobileKey 必须从 App 的真实请求同步获取。
 * mobileKey 算法尚未取得：保留原 time，不伪造新签名；签名过期时等待 App 刷新。
 * 仅在 Loon 运行，不支持 GitHub Actions。任务模板和凭证只保存在设备本地。
 */
(function () {
  'use strict';
  const HOST = 'pingxin-api.samaliong.top';
  const BASE = 'http://' + HOST;
  let apiBase = BASE;
  const NAME = '瓶子任务';
  const S = typeof $persistentStore !== 'undefined' ? $persistentStore : null;
  const log = text => console.log('[瓶子] ' + text);
  const get = key => S ? S.read(key) : null;
  const put = (key, value) => {
    if (!S || !S.write(typeof value === 'string' ? value : JSON.stringify(value), key)) throw new Error('本地保存失败');
  };
  function json(value, fallback) { try { const parsed = JSON.parse(value); return parsed === null ? fallback : parsed; } catch (_) { return fallback; } }
  function option(key, fallback) {
    const config = json(get('gzd_bottle'), {}) || {};
    return config[key] === undefined || config[key] === '' ? fallback : config[key];
  }
  const enabled = (key, fallback) => [true, 1, '1', 'true'].includes(option(key, fallback));
  function number(key, fallback, min, max) {
    const n = Number(option(key, fallback));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }
  const argumentText = typeof $argument === 'string' ? $argument : '';
  const hasMode = mode => new RegExp('(?:^|&)mode=' + mode + '(?:&|$)').test(argumentText);
  const isManual = typeof $request === 'undefined' && !hasMode('cron') && !hasMode('capture');
  function notify(title, text, test) {
    if (!test && !enabled('notifications', true)) { log('通知总开关已关闭'); return false; }
    if (typeof $notification === 'undefined' || typeof $notification.post !== 'function') {
      log('当前运行环境没有通知 API');
      try { put('gzd_bottle_notice_status', '当前运行环境没有 Loon 通知 API'); } catch (_) {}
      return false;
    }
    try {
      $notification.post(NAME, title, text);
      log('已向 Loon 提交通知：' + title + '；是否展示由系统权限控制');
      try { put('gzd_bottle_notice_status', new Date().toISOString() + ' 已请求系统通知：' + title + '（不代表手机已展示）'); } catch (_) {}
      return true;
    } catch (_) {
      log('Loon 通知 API 调用失败');
      try { put('gzd_bottle_notice_status', 'Loon 通知 API 调用失败，请检查通知权限'); } catch (_) {}
      return false;
    }
  }
  function statusNotice(kind, title, text, manualOnly) {
    log(title + '：' + text);
    if (manualOnly && !isManual) return;
    const setting = kind === 'failure' ? 'notify_failure' : kind === 'success' ? 'notify_success' : 'notify_waiting';
    if (!enabled(setting, true)) return;
    const key = 'gzd_bottle_notice_v4_' + kind + '_' + hash(title + '\n' + text);
    const stamp = day();
    if (!isManual && get(key) === stamp) return;
    if (notify(title, text)) put(key, stamp);
  }
  function hash(text) { let v = 2166136261; for (let i = 0; i < text.length; i++) v = Math.imul(v ^ text.charCodeAt(i), 16777619); return (v >>> 0).toString(16); }
  const day = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const pathOf = url => { const m = /^https?:\/\/pingxin-api\.samaliong\.top(?::(?:80|443))?(\/[^?#]*)/i.exec(url || ''); return m ? m[1] : ''; };
  function cleanHeaders(headers) {
    const allowed = ['accept', 'user-agent', 'app', 'accesstoken', 'platform', 'mobilekey', 'time', 'appversion', 'udid', 'mobileinfo', 'mobiletype', 'accept-language', 'content-type'];
    const result = {};
    for (const [k, v] of Object.entries(headers || {})) if (allowed.includes(k.toLowerCase()) && typeof v === 'string') result[k.toLowerCase()] = v;
    return result;
  }
  function capture(request) {
    const path = pathOf(request.url);
    if (!/^\/(member|fateMail|pingzi)\//.test(path)) return;
    const h = cleanHeaders(request.headers);
    put('gzd_bottle_capture_status', '已命中捕获规则：' + path);
    if (!h.accesstoken || !h.mobilekey || !/^\d{13}$/.test(h.time || '')) {
      put('gzd_bottle_capture_status', '已命中，但缺少完整 accessToken / mobileKey / time');
      log('已命中 App 请求，但缺少完整凭证/签名头；未保存残缺数据');
      return;
    }
    const origin = /^(https?:\/\/pingxin-api\.samaliong\.top(?::(?:80|443))?)(?:\/|$)/i.exec(request.url);
    if (origin) put('gzd_bottle_api_base', origin[1]);
    const previous = json(get('gzd_bottle_headers'), {});
    put('gzd_bottle_headers', h);
    // Update legacy keys as well; never retain the old hardcoded defaults.
    for (const [key, value] of Object.entries(h)) {
      const old = { accesstoken: 'accessToken', mobilekey: 'mobileKey', appversion: 'appVersion', 'user-agent': 'User_Agent', 'content-type': 'Content_Type', accept: 'Accept' }[key] || key;
      put('gzd_bottle_header_' + old, value);
    }
    put('gzd_bottle_capture_at', new Date().toISOString());
    put('gzd_bottle_capture_status', '已捕获完整凭证与签名（' + (origin && origin[1].startsWith('https:') ? 'HTTPS' : 'HTTP') + '）');
    const body = json(request.body, null);
    if (path === '/pingzi/reng' && body && typeof body.s === 'string' && body.s) {
      // Only App-generated encrypted data. Never bundle payloads from a private capture.
      put('gzd_bottle_publish_template', body);
    }
    const replyPath = String(option('reply_path', ''));
    if (replyPath && path === replyPath && body && typeof body === 'object' && !Array.isArray(body)) {
      put('gzd_bottle_reply_template', { path, body });
    }
    if (!previous.accesstoken || previous.accesstoken !== h.accesstoken) notify('登录凭证已更新', '凭证仅保存在本机；打开任务页后一分钟内尝试任务。');
    log('已同步 App 凭证和原始签名；未输出凭证');
  }
  function api(path, body, headers) {
    if (!/^\/(member|fateMail|pingzi)\/[A-Za-z0-9/_-]+$/.test(path)) return Promise.reject(new Error('接口路径不受支持'));
    return new Promise((resolve, reject) => {
      $httpClient.post({ url: apiBase + path, timeout: 12000, headers, body: JSON.stringify(body || {}) }, (err, response, data) => {
        if (err) {
          const code = typeof err === 'object' && err.code !== undefined ? String(err.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : 'NETWORK_ERROR';
          return reject(new Error('请求 ' + path + ' 失败（' + code + '，超时上限12000毫秒）；未确认操作不重放'));
        }
        if (!response || Number(response.status || response.statusCode) !== 200) return reject(new Error('HTTP 状态异常'));
        const value = json(data, null);
        if (!value || typeof value !== 'object') return reject(new Error('返回内容不是有效 JSON，不能视为成功'));
        if (value.success !== true || Number(value.code) !== 200) {
          const msg = String(value.message || '业务请求失败');
          if (/时钟|token|登录|失效|系统异常/i.test(msg)) return reject(new Error('凭证/签名未通过验证，请打开 App 刷新；已停止本轮'));
          return reject(new Error('业务请求失败（code=' + Number(value.code) + '）'));
        }
        resolve(value.result);
      });
    });
  }
  function parseTasks(value) { if (!value || !Array.isArray(value.taskList)) throw new Error('任务列表格式变化'); return value.taskList; }
  function findTask(tasks, target) { return tasks.find(t => t.target === target); }
  function progress(task) {
    const m = task && /([0-9]+)\s*\/\s*([0-9]+)/.exec(task.title || '');
    return m ? [Number(m[1]), Number(m[2])] : null;
  }
  let headers, ledger, signatureAge;
  function saveLedger() { put('gzd_bottle_ledger', ledger); }
  async function request(path, body) {
    if (Date.now() - Number(headers.time) > signatureAge * 1000) throw new Error('签名已过期，等待 App 刷新；没有伪造 time');
    return api(path, body, headers);
  }
  async function member() {
    const value = await request('/member/memberInfo');
    if (!value || !Number.isFinite(Number(value.coinNum)) || !value.id) throw new Error('账号信息格式变化');
    return value;
  }
  async function charged(key, cost, path, body) {
    if (!Number.isFinite(cost) || cost < 0) throw new Error('该动作的银币成本未配置');
    if (ledger.actions[key]) throw new Error('本日该动作已尝试，避免重复扣币：' + key);
    const limit = number('daily_spend_limit', 65, 0, 10000);
    if (ledger.reserved + cost > limit) throw new Error('已达到每日银币消耗上限');
    const state = await member();
    if (Number(state.coinNum) - cost < number('minimum_balance', 100, 0, 100000)) throw new Error('银币余额低于保留额度');
    // Persist before sending. Ambiguous results remain reserved, never retried blindly.
    ledger.actions[key] = { state: 'pending', cost };
    ledger.reserved += cost;
    saveLedger();
    const result = await request(path, body);
    ledger.actions[key].state = 'responded';
    saveLedger();
    return result;
  }
  async function claims() {
    if (!enabled('claim_rewards', true)) return;
    for (const task of parseTasks(await request('/fateMail/taskList'))) {
      if (!['2', '3', '4'].includes(String(task.id)) || Number(task.isComplete) !== 1) continue;
      const key = 'claim-' + task.id;
      if (ledger.actions[key]) continue;
      ledger.actions[key] = { state: 'pending', cost: 0 }; saveLedger();
      await request('/fateMail/receiverRewards/' + String(task.id));
      const verified = parseTasks(await request('/fateMail/taskList')).find(t => String(t.id) === String(task.id));
      if (!verified || Number(verified.isComplete) !== 2) throw new Error('领奖状态未确认，停止重复领取');
      ledger.actions[key].state = 'verified'; saveLedger();
    }
  }
  async function run() {
    if (!enabled('enabled', true)) { statusNotice('waiting', '自动任务已关闭', '请在 BoxJS 开启自动任务开关。', true); return; }
    headers = json(get('gzd_bottle_headers'), null);
    const storedBase = get('gzd_bottle_api_base');
    apiBase = /^https?:\/\/pingxin-api\.samaliong\.top(?::(?:80|443))?$/i.test(storedBase || '') ? storedBase : BASE;
    signatureAge = number('signature_max_age', 90, 15, 120);
    if (!headers || !headers.accesstoken || !headers.mobilekey || !headers.time) {
      statusNotice('waiting', '尚未获取登录凭证', '请启用瓶子捕获插件，进入 App 任务页；HTTPS 请求需要 MitM。BoxJS 捕获状态应显示完整凭证与签名。');
      return;
    }
    const account = hash(headers.accesstoken);
    if (get('gzd_bottle_completed') === day() + ':' + account) {
      const previous = json(get('gzd_bottle_last_result'), {});
      statusNotice('success', '今日任务已完成', Array.isArray(previous.notes) ? previous.notes.join('\n') : '本机已有今日已完成记录，未重复执行扣币动作。', true);
      return;
    }
    const age = (Date.now() - Number(headers.time)) / 1000;
    if (!Number.isFinite(age) || age < -15 || age > signatureAge) { statusNotice('waiting', '签名已过期，任务未执行', '请重新进入 App 任务页刷新签名，再运行“瓶子手动检查”。'); return; }
    const lock = json(get('gzd_bottle_lock'), null);
    if (lock && Date.now() - lock.time < 120e3) { statusNotice('waiting', '已有任务执行中', '已阻止重复启动，请稍后查看结果。', true); return; }
    const lockId = Date.now() + ':' + Math.random();
    put('gzd_bottle_lock', { id: lockId, time: Date.now() });
    const notes = [];
    try {
      const before = await member();
      ledger = json(get('gzd_bottle_ledger'), {});
      if (ledger.day !== day() || ledger.account !== String(before.id)) ledger = { day: day(), account: String(before.id), reserved: 0, actions: {} };
      saveLedger();
      let sign = await request('/fateMail/signInRecord');
      if (!sign || ![0, 1].includes(Number(sign.todayIsSignin))) throw new Error('签到状态格式变化');
      if (Number(sign.todayIsSignin) !== 1) {
        await request('/fateMail/signIn');
        sign = await request('/fateMail/signInRecord');
        if (!sign || Number(sign.todayIsSignin) !== 1) throw new Error('签到业务结果未确认');
        notes.push('签到已确认');
      } else notes.push('今日已签到');
      await claims();
      let tasks = parseTasks(await request('/fateMail/taskList'));
      let task = findTask(tasks, 'publish');
      if (enabled('publish', true) && task && Number(task.isComplete) === 0) {
        const template = json(get('gzd_bottle_publish_template'), null);
        if (!template || typeof template.s !== 'string') notes.push('发布：需先在 App 编辑并发布一次以保存加密模板');
        else {
          let count = progress(task);
          if (!count) throw new Error('发布任务进度无法识别');
          const target = Math.min(count[1], number('publish_limit', 3, 0, 3));
          while (count[0] < target) {
            await charged('publish-' + count[0], 5, '/pingzi/reng', template);
            task = findTask(parseTasks(await request('/fateMail/taskList')), 'publish');
            const next = progress(task);
            if (!next || next[0] <= count[0]) throw new Error('发布进度未增加，停止重放加密模板');
            count = next;
          }
        }
      }
      await claims();
      tasks = parseTasks(await request('/fateMail/taskList'));
      task = findTask(tasks, 'reply');
      if (enabled('reply', true) && task && Number(task.isComplete) === 0) {
        const template = json(get('gzd_bottle_reply_template'), null);
        const replyPath = String(option('reply_path', ''));
        const costValue = option('reply_cost', '');
        const cost = costValue === '' ? NaN : Number(costValue);
        if (!template || !replyPath || template.path !== replyPath || !Number.isFinite(cost) || cost < 0) notes.push('回复：缺少真实接口/模板或已确认的扣币成本，暂不发送');
        else {
          let count = progress(task);
          if (!count) throw new Error('回复进度无法识别');
          const target = Math.min(count[1], number('reply_limit', 5, 0, 5));
          while (count[0] < target) {
            await charged('reply-' + count[0], cost, replyPath, template.body);
            task = findTask(parseTasks(await request('/fateMail/taskList')), 'reply');
            const next = progress(task);
            if (!next || next[0] <= count[0]) throw new Error('回复进度未增加，停止重复发消息');
            count = next;
          }
        }
      }
      await claims();
      task = findTask(parseTasks(await request('/fateMail/taskList')), 'sendMessage');
      if (enabled('greeting', true) && task && Number(task.isComplete) === 0) {
        await charged('greeting', 50, '/fateMail/sendChatToSomeBody', { limitReply: '0', anonymity: '0', content: '', source: 'TASK' });
        const fresh = findTask(parseTasks(await request('/fateMail/taskList')), 'sendMessage');
        if (!fresh || ![1, 2].includes(Number(fresh.isComplete))) throw new Error('打招呼任务未确认');
      }
      await claims();
      const after = await member();
      notes.push('银币 ' + before.coinNum + ' → ' + after.coinNum + '；瓶分 ' + before.points + ' → ' + after.points);
      notes.push('今日已预留消耗 ' + ledger.reserved + ' 银币；不确定操作也计入上限');
      const partial = notes.some(t => /需先|缺少/.test(t));
      put('gzd_bottle_last_result', { status: partial ? 'partial' : 'success', at: new Date().toISOString(), day: day(), notes });
      // Missing templates do not count as full completion; retry only after a new App request.
      if (!partial) put('gzd_bottle_completed', day() + ':' + account);
      statusNotice('success', partial ? '签到已确认，部分任务未完成' : '签到与任务成功', notes.join('\n'));
    } catch (error) {
      const message = error && error.message ? error.message : '执行失败';
      put('gzd_bottle_last_result', { status: 'failure', at: new Date().toISOString(), day: day(), message });
      statusNotice('failure', '执行失败，本轮已停止', message);
    } finally {
      const current = json(get('gzd_bottle_lock'), {});
      if (current.id === lockId) put('gzd_bottle_lock', '');
    }
  }
  const captureMode = hasMode('capture');
  if (hasMode('notify-test')) {
    notify('通知测试', '这是 Loon 本机通知测试；未调用签到接口，没有发布消息或扣银币。', true);
    $done();
  } else if (captureMode && typeof $request === 'undefined') {
    log('这是请求捕获入口，不执行签到。保持插件启用，在 App 进入任务页即可自动捕获；手动任务请运行“瓶子手动检查”。');
    notify('捕获入口不执行签到', '它只在 App 真实请求经过时保存凭证。手动任务请选择“瓶子手动检查”。');
    $done();
  } else if (typeof $request !== 'undefined') {
    try { capture($request); } catch (_) { log('凭证保存失败'); }
    $done({});
  } else {
    run().catch(error => statusNotice('failure', '执行失败', error && error.message ? error.message : '初始化或存储异常')).finally(() => $done());
  }
})();
