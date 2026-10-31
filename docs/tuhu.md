# 途虎养车脚本维护

脚本：[scripts/tuhu.js](../scripts/tuhu.js)

固定地址：https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/scripts/tuhu.js

Loon 插件：https://raw.githubusercontent.com/danielgzd/MyAutoScript/main/plugins/tuhu.lnplugin

## 来源与修复范围

原作者 @FoKit；blackbox 修复来自 @Sliverkiss。
上游：https://github.com/Sliverkiss/GoodNight/blob/master/Script/tuhu.js

2026-10-31 根据实际抓包修复获取入口：旧脚本只监听 `/User/GetInternalCenterInfo`，本次积分页实际请求 `/User/GetMemberSignInInfoAsync?channel=wxapp` 和 `/user/SelectUserIntegralByUserId`，两者仍携带 Authorization Bearer Token。

本版本兼容上述三个入口和 User/user 大小写，校验空 Token，按去掉 Bearer 前缀后的完整字符串去重，获取流程不打印凭证。保留原作者署名及原签到逻辑。未上传抓包、账号凭证或个人数据。

## Loon 使用

1. 添加上面的 Loon 插件，替换旧途虎插件，避免重复任务。
2. 开启脚本和 MitM，确认已安装并信任 Loon 的 MitM 证书。
3. 打开途虎养车微信小程序的积分/签到页，等待“Token 获取成功”提示。已保存相同 Token 时只记录“无需重复添加”。
4. 定时任务每天 07:17 执行，依设备本地时区。脚本成功获取 Token 不代表签到已验证成功，请查看任务日志。

Surge、Quantumult X 和 Stash 示例位于脚本头部，地址已指向本仓库。

## 数据与依赖

- 代理客户端存储键：`tuhu_token`（JSON 字符串数组）、`tuhu_blackbox`。
- Node 环境使用原脚本的 `TUHU_TOKEN`（JSON 字符串数组）；Node 依赖及通知模块需自行配置，本次未验证 Node 定时运行。
- 保留上游外部 blackbox 服务依赖。其可用性、Token 有效期和风控要求尚未在线验证。
- 不要将 Token、微信 Code、抓包、BoxJS 导出或运行数据提交到仓库。调试模式可能输出完整请求，请避免公开调试日志。

## 已验证与限制

- `node --check` 语法检查通过。
- 模拟 Loon 环境通过 7 项离线检查：三个合法接口、Bearer 去重、缺失凭证、拒绝其他主机、拒绝相似路径；另检查配置大小写和自有脚本地址。
- 抓包的客户端上报包含原签到接口 `/cl-common-api/api/dailyCheckIn/userCheckIn`，HTTP 状态记录为 200；签到状态查询从 false 变成 true。
- 缺少签到请求的完整请求头、请求体和业务响应，未验证本脚本实际签到；不能确认 fingerprint、x-s-tk 是否必需，也不能认定它们替代 blackbox。

## 后续维护

编辑 `scripts/tuhu.js` 并提交到 main 后，客户端继续使用相同固定地址；按客户端机制更新脚本缓存。
若获取接口变化，同时调整插件及脚本头部匹配规则和 `GetCookie()` 的白名单。若签到失败，先核对返回信息及实际签到请求，再修改签到参数。
