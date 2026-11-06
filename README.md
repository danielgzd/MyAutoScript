# MyAutoScript

个人自动化脚本与工具集合：Scriptable 小组件、Loon Cookie 捕获、BoxJS 配置，以及 VPS 只读监控服务。

| 类别 | 内容 | 使用说明 |
|---|---|---|
| [Scriptable](Scriptable/) | 联通余量、快捷启动、单机 VPS 监控 | [配置与组件使用](Scriptable/README.md) |
| [Loon](Loon/) | 联通 Cookie 捕获脚本与插件 | [联通接入](docs/china-unicom.md) |
| [BoxJS](BoxJS/) | 联通 Cookie 订阅配置 | 复制 JSON 的 Raw 地址加入 BoxJS 订阅 |
| [server/VPS-Monitor](server/VPS-Monitor/) | Linux 采集服务与安装工具 | [部署说明](server/VPS-Monitor/README.md) |
| [scripts](scripts/) | 既有签到、测速等自动化脚本 | 各文件内说明 |
| [plugins](plugins/) | 既有途虎插件与兼容入口 | 各插件内说明 |

## 快速使用

1. 在 Scriptable 目录选择组件，下载 JS 到 iPhone Scriptable；联通组件需要两个文件。
2. 在 App 内运行脚本完成配置，再将对应脚本添加为桌面小组件。
3. VPS 监控可先选择演示模式；真实数据需要先部署服务器采集服务。
4. 联通自动获取 Cookie 需安装 Loon 插件、BoxJS及MITM证书，详细步骤见上方文档。

凭据不要写入源码或提交仓库。VPS令牌使用Keychain，快捷启动及组件配置保存在手机本地。桌面刷新由iOS调度，不保证按秒更新。旧联通 scripts/plugins 地址保留为兼容入口，新引用使用分类目录。


#### 🤖 最近运行信息
- **运行脚本**: `auto-tieba-qiandao.py`
- **运行时间**: 2026-11-06 13:45:19 (CST)
- **运行结果**: 
