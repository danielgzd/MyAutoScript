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
  const notify = (title, text) => { if (typeof $notification !== 'undefined') $notification.post(NAME, title, text); };
  function hash(text) { let v = 2166136261; for (let i = 0; i < text.length; i++) v = Math.imul(v ^ text.charCodeAt(i), 16777619); return (v >>> 0).toString(16); }
  const day = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const pathOf = url => { const m = /^https?:\/\/pingxin-api\.samaliong\.top(?::80)?(\/[^?#]*)/i.exec(url || ''); return m ? m[1] : ''; };
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
    if (!h.accesstoken || !h.mobilekey || !/^\d{13}$/.test(h.time || '')) return;
    const previous = json(get('gzd_bottle_headers'), {});
    put('gzd_bottle_headers', h);
    // Update legacy keys as well; never retain the old hardcoded defaults.
    for (const [key, value] of Object.entries(h)) {
      const old = { accesstoken: 'accessToken', mobilekey: 'mobileKey', appversion: 'appVersion', 'user-agent': 'User_Agent', 'content-type': 'Content_Type', accept: 'Accept' }[key] || key;
      put('gzd_bottle_header_' + old, value);
    }
    put('gzd_bottle_capture_at', new Date().toISOString());
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
      $httpClient.post({ url: BASE + path, timeout: 12, headers, body: JSON.stringify(body || {}) }, (err, response, data) => {
        if (err) return reject(new Error('网络错误或超时，未确认的操作不自动重放'));
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
    if (!enabled('enabled', true)) return;
    headers = json(get('gzd_bottle_headers'), null);
    signatureAge = number('signature_max_age', 90, 15, 120);
    if (!headers || !headers.accesstoken || !headers.mobilekey || !headers.time) {
      log('等待打开 App 自动获取登录凭证'); return;
    }
    const age = (Date.now() - Number(headers.time)) / 1000;
    if (!Number.isFinite(age) || age < -15 || age > signatureAge) { log('等待 App 产生新鲜签名，未发送任何请求'); return; }
    const account = hash(headers.accesstoken);
    if (get('gzd_bottle_completed') === day() + ':' + account) return;
    const lock = json(get('gzd_bottle_lock'), null);
    if (lock && Date.now() - lock.time < 120e3) return;
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
      put('gzd_bottle_last_result', { at: new Date().toISOString(), day: day(), notes });
      // Missing templates do not count as full completion; retry only after a new App request.
      if (!notes.some(t => /需先|缺少/.test(t))) put('gzd_bottle_completed', day() + ':' + account);
      const notificationKey = day() + ':' + hash(notes.join('\n'));
      if (get('gzd_bottle_last_notification') !== notificationKey) { notify('任务结果', notes.join('\n')); put('gzd_bottle_last_notification', notificationKey); }
    } catch (error) {
      const message = error && error.message ? error.message : '执行失败';
      log(message);
      const key = day() + ':' + hash(message);
      if (get('gzd_bottle_last_error') !== key) { notify('本轮已停止', message); put('gzd_bottle_last_error', key); }
    } finally {
      const current = json(get('gzd_bottle_lock'), {});
      if (current.id === lockId) put('gzd_bottle_lock', '');
    }
  }
  if (typeof $request !== 'undefined') {
    try { capture($request); } catch (_) { log('凭证保存失败'); }
    $done({});
  } else {
    run().catch(() => log('执行失败')).finally(() => $done());
  }
})();
