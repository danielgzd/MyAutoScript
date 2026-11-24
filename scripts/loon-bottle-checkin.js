/**
 * 瓶心 / 瓶子：仅每日签到与必要状态查询。
 * 源码：https://github.com/danielgzd/MyAutoScript
 * 无内置凭证。首次从 App 捕获 accessToken，随后无需打开 App 即可定时签到。
 * 签到接口已实测不需要 time / mobileKey；请求时移除历史签名。
 * 仅在 Loon 运行，不支持 GitHub Actions。任务模板和凭证只保存在设备本地。
 */
(function () {
  'use strict';
  const HOST = 'pingxin-api.samaliong.top';
  const BASE = 'http://' + HOST;
  let apiBase = BASE;
  const NAME = '瓶子签到';
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
    const existing = json(get('gzd_bottle_headers'), {});
    if (existing.accesstoken === h.accesstoken && Number(existing.time) > Number(h.time)) return;
    put('gzd_bottle_capture_status', '已命中捕获规则：' + path);
    if (!h.accesstoken) {
      put('gzd_bottle_capture_status', '已命中，但缺少 accessToken');
      log('已命中 App 请求，但缺少登录凭证；未保存残缺数据');
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
    put('gzd_bottle_capture_status', '已捕获登录凭证（' + (origin && origin[1].startsWith('https:') ? 'HTTPS' : 'HTTP') + '）');
    if (!previous.accesstoken || previous.accesstoken !== h.accesstoken) notify('登录凭证已更新', '凭证仅保存在本机；已保存，后续由定时任务自动签到。');
    log('已同步 App 凭证和原始签名；未输出凭证');
  }
  function api(path, body, headers) {
    if (!['/fateMail/signInRecord', '/fateMail/signIn'].includes(path)) return Promise.reject(new Error('接口路径不受支持'));
    return new Promise((resolve, reject) => {
      $httpClient.post({ url: apiBase + path, timeout: 12000, headers: Object.fromEntries(Object.entries(headers).filter(([key]) => !['time', 'mobilekey'].includes(key.toLowerCase()))), body: JSON.stringify(body || {}) }, (err, response, data) => {
        if (err) {
          const code = typeof err === 'object' && err.code !== undefined ? String(err.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : 'NETWORK_ERROR';
          return reject(new Error('请求 ' + path + ' 失败（' + code + '，超时上限12000毫秒）；未确认操作不重放'));
        }
        if (!response || Number(response.status || response.statusCode) !== 200) return reject(new Error('HTTP 状态异常'));
        const value = json(data, null);
        if (!value || typeof value !== 'object') return reject(new Error('返回内容不是有效 JSON，不能视为成功'));
        if (value.success !== true || Number(value.code) !== 200) {
          const code = Number(value.code);
          const msg = String(value.message || '业务请求失败');
          put('gzd_bottle_api_status', JSON.stringify({ at: new Date().toISOString(), path, code }));
          if (/时钟|token|登录|失效|签名/i.test(msg)) return reject(new Error(path + ' 验证未通过（code=' + code + '），请在 App 刷新任务页'));
          return reject(new Error(path + ' 业务请求失败（code=' + code + '）；具体含义未确认'));
        }
        resolve(value.result);
      });
    });
  }
  let headers;
  async function request(path, body) {
    const latest = json(get('gzd_bottle_headers'), null);
    if (latest && latest.accesstoken === headers.accesstoken && Number(latest.time) > Number(headers.time)) headers = latest;
    return api(path, body, headers);
  }
  async function run() {
    if (!enabled('enabled', true)) { statusNotice('waiting', '自动签到已关闭', '请在 BoxJS 开启自动签到开关。', true); return; }
    headers = json(get('gzd_bottle_headers'), null);
    const storedBase = get('gzd_bottle_api_base');
    apiBase = /^https?:\/\/pingxin-api\.samaliong\.top(?::(?:80|443))?$/i.test(storedBase || '') ? storedBase : BASE;
    if (!headers || !headers.accesstoken) {
      statusNotice('waiting', '尚未获取登录凭证', '请启用瓶子捕获插件，进入 App 任务页；HTTPS 请求需要 MitM。BoxJS 捕获状态应显示完整凭证与签名。');
      return;
    }
    const account = hash(headers.accesstoken);
    if (get('gzd_bottle_completed') === day() + ':' + account) {
      const previous = json(get('gzd_bottle_last_result'), {});
      statusNotice('success', '今日签到已完成', Array.isArray(previous.notes) ? previous.notes.join('\n') : '本机已有今日已完成记录，未重复提交签到。', true);
      return;
    }
    const lock = json(get('gzd_bottle_lock'), null);
    if (lock && Date.now() - lock.time < 120e3) { statusNotice('waiting', '已有任务执行中', '已阻止重复启动，请稍后查看结果。', true); return; }
    const lockId = Date.now() + ':' + Math.random();
    put('gzd_bottle_lock', { id: lockId, time: Date.now() });
    const notes = [];
    try {
      let sign = await request('/fateMail/signInRecord');
      if (!sign || ![0, 1].includes(Number(sign.todayIsSignin))) throw new Error('签到状态格式变化');
      if (Number(sign.todayIsSignin) !== 1) {
        await request('/fateMail/signIn');
        sign = await request('/fateMail/signInRecord');
        if (!sign || Number(sign.todayIsSignin) !== 1) throw new Error('签到业务结果未确认');
        notes.push('签到已确认');
      } else notes.push('今日已签到');
      put('gzd_bottle_last_result', { status: 'success', at: new Date().toISOString(), day: day(), notes });
      put('gzd_bottle_completed', day() + ':' + account);
      statusNotice('success', '签到成功', notes.join('\n'));
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
    if (typeof $response !== 'undefined') {
      const result = json($response.body, null);
      if (result && result.success === true && Number(result.code) === 200) put('gzd_bottle_capture_status', 'App 请求已成功，凭证已更新；等待自动签到或运行手动检查');
    }
    $done({});
  } else {
    run().catch(error => statusNotice('failure', '执行失败', error && error.message ? error.message : '初始化或存储异常')).finally(() => $done());
  }
})();
