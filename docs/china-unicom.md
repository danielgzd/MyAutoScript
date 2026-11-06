# 联通 Cookie 与 Scriptable

BoxJS 订阅：https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/BoxJS/china-unicom.boxjs.json

捕获脚本：https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/Loon/scripts/ChinaUnicomCapture.js

Loon 插件：https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/Loon/plugins/china-unicom.lnplugin

先安装 BoxJS 和代理工具的 HTTPS 解密证书。Loon 导入上述插件；其他工具按下面配置。打开联通 App 刷新首页，然后在 BoxJS 的“中国联通 Cookie”检查是否捕获成功，勿分享 Cookie。

BoxJS 订阅提供配置页面，捕获仍需代理重写规则。

## Quantumult X

```ini
[rewrite_local]
^https:\/\/m(?:xx)?\.client\.10010\.com\/mobileserviceimportant\/home\/queryUserInfoSeven(?:\?|$) url script-request-header https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/Loon/scripts/ChinaUnicomCapture.js

[mitm]
hostname = m.client.10010.com, mxx.client.10010.com
```

## Surge

```ini
[Script]
联通Cookie = type=http-request,pattern=^https:\/\/m(?:xx)?\.client\.10010\.com\/mobileserviceimportant\/home\/queryUserInfoSeven(?:\?|$),script-path=https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/Loon/scripts/ChinaUnicomCapture.js

[MITM]
hostname = %APPEND% m.client.10010.com, mxx.client.10010.com
```

合并到已有配置，保留原 MITM 域名。存储键为 `ChinaUnicomCookie`；Scriptable 默认读取 `http://boxjs.com/query/data/ChinaUnicomCookie`。代理需开启且 BoxJS 可访问。Cookie 失效时重新刷新已登录的联通 App，不支持自动登录。

已完成语法及模拟存储检查；尚未完成手机捕获、BoxJS读取和联通在线查询验证。
