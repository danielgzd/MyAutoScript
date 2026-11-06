// v6：使用代理工具推送通知，不输出日志或 Cookie。
function notify(message) {
  if (typeof $notification !== 'undefined' && typeof $notification.post === 'function') {
    $notification.post('中国联通 Cookie', '自动获取结果 v6', message);
  } else if (typeof $notify === 'function') {
    $notify('中国联通 Cookie', '自动获取结果 v6', message);
  }
}
(function () {
var stage = '初始化';
try {
  if (typeof $request === 'undefined' || !$request) {
    notify('当前为手动运行，没有请求上下文。请打开联通 App 刷新首页触发捕获。');
  } else {
    stage = '读取请求头';
    var headers = $request.headers || {};
    var fromWidget = Object.keys(headers).some(function(k) {
      return k.toLowerCase() === 'x-scriptable-unicom';
    });
    if (fromWidget) return;
    var parts = [];
    Object.keys(headers).forEach(function(key) {
      if (key.toLowerCase() === 'cookie') {
        var value = headers[key];
        if (Array.isArray(value)) parts = parts.concat(value);
        else if (typeof value === 'string') parts.push(value);
      }
    });
    var cookie = parts.join('; ').trim();
    if (!cookie || cookie.indexOf('=') === -1) {
      notify('规则已触发，但请求未携带 Cookie。请确认联通 App 已登录。');
    } else {
      stage = '保存 Cookie';
      var previous = '';
      if (typeof $persistentStore !== 'undefined' && typeof $persistentStore.read === 'function')
        previous = $persistentStore.read('ChinaUnicomCookie') || '';
      else if (typeof $prefs !== 'undefined' && typeof $prefs.valueForKey === 'function')
        previous = $prefs.valueForKey('ChinaUnicomCookie') || '';
      if (previous === cookie) return;
      var saved = false;
      if (typeof $persistentStore !== 'undefined' && typeof $persistentStore.write === 'function')
        saved = $persistentStore.write(cookie, 'ChinaUnicomCookie');
      else if (typeof $prefs !== 'undefined' && typeof $prefs.setValueForKey === 'function')
        saved = $prefs.setValueForKey(cookie, 'ChinaUnicomCookie');
      else throw new Error('StorageUnavailable');
      notify(saved ? '已获取并保存 Cookie，请运行 Scriptable 联通组件。' : '规则已触发，但存储接口报告保存失败。');
    }
  }
} catch (error) {
  var type = error && error.name;
  var safeType = ['TypeError', 'ReferenceError', 'Error'].indexOf(type) >= 0 ? type : '异常';
  notify('捕获失败：' + stage + '（' + safeType + '）。请反馈这条提示。');
} finally {
  if (typeof $done === 'function') $done({});
}

})();
