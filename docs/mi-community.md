# 小米社区微信小程序签到（Loon）

- [签到脚本](../scripts/loon-mi-community-checkin.js)
- [Loon 插件](../plugins/mi-community.lnplugin)
- [BoxJS 订阅](../boxjs/mi-community.boxjs.json)
- 本机测试：`node tests/mi-community.test.js`

GitHub只保存维护源码，不将Loon脚本接入GitHub Actions。服务器原小米社区脚本入口保留，服务器Loon配置和综合BoxJS订阅引用本仓库源码。小米小程序/商城等其他签到项目不在此次变更范围内。

## 抓包证据（2026-11-15）

签到接口仍为 `POST https://api.vip.miui.com/mtop/planet/wechat/member/addCommunityGrowUpPointByActionV2?wx_vip_ph=...`，表单体固定为 `action=WECHAT_CHECKIN_TASK`，不是其他成长任务。

抓包返回 `status=200, entity.score="3", entity.desc="小程序签到"`；后续 `checkin/mypagedata` 的按钮从“去签到”变为“已签到”，成长值从126/200变为129/200。另一次不带Cookie的userinfo请求返回401，登录后恢复正常。

Cookie中的wx_vip_ph带有base64末尾填充，URL参数省略填充；应保留抓到的原始Cookie和解码后的实际URL参数，不能把二者当作同一段字符串随意替换。

## 优化

- 不内置Cookie、wx_vip_ph、账号或设备资料，不发布私人抓包。
- 从小程序的成功业务响应同时获取请求Cookie和URL中的wx_vip_ph，作为同一登录快照保存。401/非JSON/不完整参数不会覆盖已有凭证。
- 保留原请求Referer、Origin、User-Agent；不固定旧小程序页面版本，不手写Content-Length，也不复制Host、Connection和Accept-Encoding。
- 支持迁移旧BoxJS存储中的Cookie/URL，但先检查参数是否成对；不重放微信Code、STS票据或小米账号登录接口。
- 签到前读取mypagedata，已签到则不提交。提交后再次读mypagedata，只有按钮显示“已签到”才报告成功；单独HTTP200不代表成功。
- 超时/不确定结果先核对签到页。未确认时记录状态，阻止同一天同账号盲目重复提交。
- 所有HTTP超时均为12000毫秒。手动执行每次反馈结果，定时任务相同结果当天去重。BoxJS记录最近结果及通知提交状态。

## Loon与BoxJS使用

更新服务器上的Loon配置，或将`.lnplugin`导入Loon【插件】区并启用。插件配置不能作为JavaScript脚本运行。不要同时保留重复的小米社区定时任务。

HTTPS捕获需要启用Loon MitM并安装、信任证书。只为`api.vip.miui.com`添加域名，不拦截account.xiaomi.com或微信登录域名。

更新原来的综合BoxJS订阅即可获得新版小米社区设置，无需再重复导入单独订阅。打开“小米社区”微信小程序并进入签到页，BoxJS“凭证捕获状态”应显示“已捕获并校验Cookie与wx_vip_ph”。不是小米商城等其他小程序。

定时任务每天08:20，按设备本地时区；手动执行选择“小米社区手动签到”。“小米社区凭证捕获”只等待真实响应；“小米社区通知测试”不调用业务接口。

Cookie有效期由服务端决定。若登录态失效，重新登录小程序并进入签到页即可更新。旧生成脚本中的硬编码凭证已移除，服务器备份保存在仅root可读的位置。

## 验证范围

已使用本次抓包凭证做一次只读mypagedata查询：HTTP200、业务status200、按钮“已签到”、成长值129/200。没有重复提交真实签到，也没有执行浏览、点赞、评论或其他成长动作。新Loon捕获规则的手机端效果仍需在更新后确认。
