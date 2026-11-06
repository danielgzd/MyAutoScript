// 仅作为代理工具的请求脚本使用，不在 Scriptable 中运行。
try {
  const headers = $request.headers || {};
  const cookie = headers.Cookie || headers.cookie;
  if (typeof cookie === 'string' && cookie.includes('=')) {
    if (typeof $prefs !== 'undefined') $prefs.setValueForKey(cookie, 'ChinaUnicomCookie');
    else $persistentStore.write(cookie, 'ChinaUnicomCookie');
  }
} finally { $done({}); }
