# Scriptable 组件

将对应文件保存到 iPhone 的 Scriptable iCloud 文件夹，在 App 内先运行配置。长按桌面添加 Scriptable 组件，选择脚本和尺寸。桌面刷新由 iOS 控制，不保证实时或按秒刷新。

## 联通 ChinaUnicom

下载 ChinaUnicom/ 下两个 JS，保持同目录及文件名，运行 ChinaUnicom。支持小中大三种尺寸；大号突出通用流量总量、已用、剩余和进度。统计不含定向流量，总量由已用和剩余合计，单位与余量不一致时隐藏进度。

Cookie 自动获取：在 Loon 导入 ../Loon/plugins/china-unicom.lnplugin 对应的 Raw 地址；BoxJS 添加 ../BoxJS/china-unicom.boxjs.json 的 Raw 订阅。开启 MITM 并信任证书，登录联通 App 刷新首页或打开余量详情。成功捕获发送通知，相同 Cookie 静默；Scriptable 自身请求会跳过捕获。

在 Scriptable App 内运行联通脚本读取 BoxJS 并保存到本机，桌面组件优先使用本机 Cookie。新 Cookie 捕获后重新运行一次脚本。缺少凭据可手动输入；不要在源码里填写凭据。Cookie 目前使用本地文件缓存，拥有设备文件访问权限的人可能读取；不包含在本仓库。

## 快捷启动 QuickLaunch

运行 AI-快捷启动，编辑三个分组的名称、副标题及快捷方式。每组最多四项，可配置名称、SF Symbol、颜色、URL 或苹果快捷指令名称。中大号支持各图标独立跳转；小号只有整体点击入口。大号侧栏打开脚本预览，不能桌面原地切换。URL Scheme 是否可用取决于系统和目标 App。

## VPS-Monitor

一份脚本对应一台 VPS，三种尺寸均展示单机。复制并重命名为 VPS-美国、VPS-韩国等，再分别配置。配置和 Keychain 令牌按脚本名称隔离；改名需要重新配置。

服务器先按 ../../server/VPS-Monitor/README.md 部署采集服务与 HTTPS，组件菜单“配置本脚本的服务器”填写名称、HTTPS接口与令牌。令牌不含 Bearer 前缀，不是SSH密码。

小号 CPU 环形图，中号资源占用和网络速率，大号显示资源柱状图、内存磁盘已用/总量/剩余、CPU负载、上下行速率、累计流量与运行时长。参数 demo 或菜单“演示三种尺寸”展示标注的模拟数据，无需服务器。真实查询失败显示缓存，超过60秒标记过期。

## 验证状态

代码做过语法及模拟结构检查；VPS 韩国实例采集与HTTPS鉴权通过。不同iPhone尺寸的完整排版及所有URL跳转尚未确认。图表不是实时动画。
