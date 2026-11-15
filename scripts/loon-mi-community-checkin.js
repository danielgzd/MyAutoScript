/** 小米社区微信小程序签到 / Loon，2026-11-15 抓包兼容版。
 * 仅本机捕获 Cookie + wx_vip_ph。无内置账号，不重放微信登录票据。
 * 只执行 WECHAT_CHECKIN_TASK；不包含浏览、点赞、评论或其他成长任务。
 */
(function () {
  'use strict';
  const NAME = '小米社区签到';
  const BASE = 'https://api.vip.miui.com';
  const ROOT = '/mtop/planet/wechat/';
  const PAGE = ROOT + 'checkin/mypagedata';
  const ACTION = ROOT + 'member/addCommunityGrowUpPointByActionV2';
  const CREDENTIALS = 'gzd_mi_community_credentials';
  const LEDGER = 'gzd_mi_community_ledger';
  const S = typeof $persistentStore !== 'undefined' ? $persistentStore : null;
  const read = key => S ? S.read(key) : null;
  const write = (key, value) => {
    if (!S || !S.write(typeof value === 'string' ? value : JSON.stringify(value), key)) throw new Error('本地保存失败');
  };
  function parse(value, fallback) { try { const v = JSON.parse(value); return v === null ? fallback : v; } catch (_) { return fallback; } }
  function setting(key, fallback) { const c = parse(read('gzd_mi_community'), {}); return c[key] === undefined ? fallback : c[key]; }
  function on(key, fallback) { return [true, 'true', 1, '1'].includes(setting(key, fallback)); }
  const arg = typeof $argument === 'string' ? $argument : '';
  const mode = name => new RegExp('(?:^|&)mode=' + name + '(?:&|$)').test(arg);
  const manual = !mode('cron') && !mode('capture') && typeof $request === 'undefined';
  const log = message => console.log('[小米社区] ' + message);
  const day = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  function hash(value) { let v = 2166136261; for (let i = 0; i < value.length; i++) v = Math.imul(v ^ value.charCodeAt(i), 16777619); return (v >>> 0).toString(16); }
  function notify(kind, title, text, force) {
    log(title + '：' + text);
    if (!force && !on('notifications', true)) return;
    const key = 'gzd_mi_community_notice_' + hash(kind + title + text);
    if (!force && !manual && read(key) === day()) return;
    try {
      if (typeof $notification === 'undefined' || typeof $notification.post !== 'function') throw new Error('API unavailable');
      $notification.post(NAME, title, text);
      write('gzd_mi_community_notice_status', new Date().toISOString() + ' 已请求系统通知：' + title + '（不代表手机已展示）');
      write(key, day());
    } catch (_) { log('通知未成功提交，请检查 Loon 通知权限和运行环境'); }
  }
  function lower(headers) { return Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v])); }
  function cookies(text) {
    const result = {};
    for (const p of String(text || '').split(';')) { const i = p.indexOf('='); if (i > 0) result[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
    return result;
  }
  function decode(text) { try { return decodeURIComponent(text); } catch (_) { return ''; } }
  function queryPh(url) { const m = /[?&]wx_vip_ph=([^&#]+)/.exec(url || ''); return m ? decode(m[1].replace(/\+/g, ' ')) : ''; }
  function validPair(cookie, ph) {
    const c = cookies(cookie);
    if (!c.wx_vip_serviceToken || !c.wx_vip_ph || !ph) return false;
    // The captured query omits base64 padding; the cookie retains its trailing ==.
    return decode(c.wx_vip_ph).replace(/=+$/, '') === ph.replace(/=+$/, '');
  }
  function transport(status) { return Number(status && (status.status || status.statusCode)); }
  function accepted(envelope) {
    if (!envelope || typeof envelope !== 'object' || envelope.success === false) return false;
    if ([401, 403].includes(Number(envelope.code)) || [401, 403].includes(Number(envelope.status))) return false;
    return envelope.status !== undefined ? Number(envelope.status) === 200 : Number(envelope.code) === 200;
  }
  function accountOf(cookie) { const c = cookies(cookie); return hash(c.userId || c.cUserId || cookie); }
  function fingerprint(c) { return hash(c.cookie + '\n' + c.ph); }
  function capture() {
    const request = typeof $request === 'undefined' ? null : $request;
    const response = typeof $response === 'undefined' ? null : $response;
    const m = request && /^https:\/\/api\.vip\.miui\.com(?::443)?(\/mtop\/planet\/wechat\/(?:userinfo|checkin\/mypagedata|member\/addCommunityGrowUpPointByActionV2))(?:\?|$)/.exec(request.url || '');
    if (!m) return;
    write('gzd_mi_community_capture_status', '已命中小米社区请求，等待有效登录态响应');
    // Only successful business responses may replace the stored login pair.
    if (!response || transport(response) !== 200 || !accepted(parse(response.body, null))) {
      write('gzd_mi_community_capture_status', '本次响应不是已登录成功状态，未覆盖已有凭证'); return;
    }
    const h = lower(request.headers);
    const ph = queryPh(request.url);
    if (typeof h.cookie !== 'string' || !validPair(h.cookie, ph)) {
      write('gzd_mi_community_capture_status', 'Cookie / wx_vip_ph 缺失或不成对，未覆盖已有凭证'); return;
    }
    const old = parse(read(CREDENTIALS), null);
    const value = { cookie: h.cookie, ph, account: accountOf(h.cookie), capturedAt: new Date().toISOString(), headers: {} };
    for (const key of ['user-agent', 'referer', 'origin', 'accept']) if (typeof h[key] === 'string') value.headers[key] = h[key];
    write(CREDENTIALS, value);
    write('gzd_mi_community_header_Cookie', value.cookie);
    write('gzd_mi_community_url', BASE + ACTION + '?wx_vip_ph=' + encodeURIComponent(ph));
    write('gzd_mi_community_body', 'action=WECHAT_CHECKIN_TASK');
    if (value.headers.referer) write('gzd_mi_community_header_Referer', value.headers.referer);
    if (value.headers['user-agent']) write('gzd_mi_community_header_User_Agent', value.headers['user-agent']);
    write('gzd_mi_community_capture_status', '已捕获并校验 Cookie 与 wx_vip_ph（配对保存）');
    write('gzd_mi_community_capture_at', value.capturedAt);
    write('gzd_mi_community_auth_state', { fingerprint: fingerprint(value), invalid: false });
    if (!old || fingerprint(old) !== fingerprint(value)) notify('capture', '登录凭证已更新', '小米社区 Cookie 与 wx_vip_ph 已成对更新，仅保存在本机。');
  }
  function credentials() {
    const value = parse(read(CREDENTIALS), null);
    if (value && validPair(value.cookie, value.ph)) return value;
    const cookie = read('gzd_mi_community_header_Cookie');
    const url = read('gzd_mi_community_url') || '';
    const ph = /^https:\/\/api\.vip\.miui\.com\//.test(url) ? queryPh(url) : '';
    if (!validPair(cookie, ph)) return null;
    const migrated = { cookie, ph, account: accountOf(cookie), headers: {}, capturedAt: null };
    for (const [key, oldKey] of [['referer', 'Referer'], ['user-agent', 'User_Agent'], ['origin', 'Origin']]) {
      const v = read('gzd_mi_community_header_' + oldKey); if (v) migrated.headers[key] = v;
    }
    write(CREDENTIALS, migrated);
    return migrated;
  }
  let current;
  function authError() {
    if (current) write('gzd_mi_community_auth_state', { fingerprint: fingerprint(current), invalid: true });
    return new Error('登录态已失效，请在小米社区微信小程序重新登录并进入签到页');
  }
  function request(path, method) {
    if (![PAGE, ACTION].includes(path) || !['GET', 'POST'].includes(method)) return Promise.reject(new Error('不支持的接口'));
    const headers = Object.assign({ accept: 'application/json, text/plain, */*', origin: 'https://servicewechat.com' }, current.headers || {});
    headers.cookie = current.cookie;
    headers['content-type'] = 'application/x-www-form-urlencoded';
    const options = { url: BASE + path + '?wx_vip_ph=' + encodeURIComponent(current.ph), timeout: 12000, headers, 'auto-cookie': false, 'auto-redirect': false };
    if (method === 'POST') options.body = 'action=WECHAT_CHECKIN_TASK';
    return new Promise((resolve, reject) => {
      $httpClient[method === 'POST' ? 'post' : 'get'](options, (error, response, data) => {
        if (error) {
          const code = typeof error === 'object' && error.code ? String(error.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : 'NETWORK_ERROR';
          return reject(new Error(path.slice(ROOT.length) + ' 网络失败（' + code + '；超时上限12秒）'));
        }
        if ([301, 302, 303, 307, 308, 401, 403].includes(transport(response))) return reject(authError());
        if (transport(response) !== 200) return reject(new Error('HTTP 状态异常：' + transport(response)));
        const envelope = parse(data, null);
        if (!envelope) return reject(new Error('响应不是有效 JSON，不能视为签到成功'));
        if ([401, 403].includes(Number(envelope.code)) || [401, 403].includes(Number(envelope.status))) return reject(authError());
        if (!accepted(envelope)) return reject(new Error('业务请求失败，status=' + Number(envelope.status === undefined ? envelope.code : envelope.status)));
        resolve(envelope.entity);
      });
    });
  }
  function pageState(entity) {
    if (!entity || !Array.isArray(entity.data)) throw new Error('签到页格式变化，停止提交');
    const daily = entity.data.find(x => x.title === '每日签到');
    const labels = daily && Array.isArray(daily.buttons) ? daily.buttons.map(x => String(x.button || '')) : [];
    let signed = null;
    if (labels.some(x => /已签到/.test(x))) signed = true;
    else if (labels.some(x => /去签到|立即签到/.test(x))) signed = false;
    if (signed === null) throw new Error('无法确认签到状态，未提交签到请求');
    const growth = entity.data.find(x => x.title === '成长值');
    return { signed, growth: growth && /^\d+\/\d+$/.test(String(growth.jumpText)) ? String(growth.jumpText) : null };
  }
  function saveResult(status, title, text, extra) {
    write('gzd_mi_community_last_result', Object.assign({ status, at: new Date().toISOString(), day: day(), title, text }, extra || {}));
    notify(status, title, text);
  }
  async function run() {
    if (!on('enabled', true)) { if (manual) notify('waiting', '签到已关闭', '请在 BoxJS 开启小米社区签到。'); return; }
    current = credentials();
    if (!current) { notify('waiting', '尚未获取完整登录凭证', '请启用小米社区捕获插件，打开微信小程序签到页；Cookie 与 wx_vip_ph 需要配对，不能只复制 Cookie。'); return; }
    const account = current.account || accountOf(current.cookie);
    const key = day() + ':' + account;
    const lock = parse(read('gzd_mi_community_lock'), {});
    if (lock.time && Date.now() - lock.time < 120e3) { if (manual) notify('waiting', '已有签到执行中', '本次未重复启动。'); return; }
    const lockId = Date.now() + ':' + Math.random();
    write('gzd_mi_community_lock', { time: Date.now(), id: lockId });
    try {
      const before = pageState(await request(PAGE, 'GET'));
      write('gzd_mi_community_auth_state', { fingerprint: fingerprint(current), invalid: false });
      const prior = parse(read(LEDGER), {});
      if (before.signed) {
        write(LEDGER, { key, state: 'verified', growth: before.growth });
        saveResult('success', '今日已签到', '服务器已确认今日签到，无需重复提交。' + (before.growth ? '\n成长值：' + before.growth : ''), { growth: before.growth, alreadySigned: true });
        return;
      }
      if (prior.key === key && ['pending', 'uncertain'].includes(prior.state)) throw new Error('上次提交结果不确定，本轮只核对状态，未盲目重复提交签到');
      write(LEDGER, { key, state: 'pending', at: new Date().toISOString(), growthBefore: before.growth });
      let reward = null, submitError = null;
      try { reward = await request(ACTION, 'POST'); } catch (error) { submitError = error; }
      // An HTTP response alone is not enough; verify the page even after an uncertain submit.
      let after;
      try { after = pageState(await request(PAGE, 'GET')); } catch (error) {
        write(LEDGER, { key, state: 'uncertain', at: new Date().toISOString() });
        throw submitError || error;
      }
      if (!after.signed) {
        write(LEDGER, { key, state: 'uncertain', at: new Date().toISOString() });
        throw submitError || new Error('接口已返回，但签到页仍未确认已签到；未报告成功');
      }
      const score = reward && reward.score !== null && reward.score !== undefined && Number.isFinite(Number(reward.score)) && Number(reward.score) >= 0 ? Number(reward.score) : null;
      const text = (score !== null ? '签到奖励：+' + score : '服务器已确认签到；本次奖励值未知') + '\n成长值：' + (before.growth || '未知') + ' → ' + (after.growth || '未知');
      write(LEDGER, { key, state: 'verified', score, growth: after.growth });
      saveResult('success', '签到成功（已核验）', text, { score, growthBefore: before.growth, growth: after.growth });
    } catch (error) {
      saveResult('failure', '签到失败或未确认', error && error.message ? error.message : '未知错误');
    } finally {
      const lock = parse(read('gzd_mi_community_lock'), {});
      if (lock.id === lockId) write('gzd_mi_community_lock', '');
    }
  }
  if (mode('notify-test')) { notify('test', '通知测试', '仅测试 Loon 本机通知，不调用签到接口。', true); $done(); }
  else if (typeof $request !== 'undefined') {
    try { capture(); } catch (_) { log('捕获未完成，本次没有修改业务请求'); }
    $done({});
  } else if (mode('capture')) { notify('waiting', '这是自动捕获入口', '请保持插件启用，打开小米社区微信小程序签到页；手动执行请选择“小米社区手动签到”。', true); $done(); }
  else run().catch(error => notify('failure', '签到初始化失败', error && error.message ? error.message : '本地存储异常')).finally(() => $done());
})();
