# VPS Monitor

独立 Scriptable 小组件 + Linux 只读采集服务。无第三方 Python/npm 依赖。

## 新服务器

支持 Linux、Python 3、systemd（需支持 LoadCredential，如 Ubuntu 22.04/24.04）。将 agent.py 和 install.sh 上传到同一临时目录，执行 `sudo sh install.sh`。使用 SSH 密钥或交互密码连接，不把 SSH 凭据交给小组件。已有安装会停止，避免覆盖。

采集服务每三秒取样，监听 127.0.0.1:9187；CPU 与网络第一次取样为空，下一次生成。网络为全部非 lo 网卡的合计，虚拟网卡/VPN可能重复计数，不等同于运营商计费；磁盘仅根分区。没有温度、容器和进程监控。

在现有 HTTPS Nginx server 段加入以下规则，并执行 nginx -t 后重载。使用受信任证书，勿直接对公网暴露 9187。

```nginx
location = /vps-monitor/v1/status {
    proxy_pass http://127.0.0.1:9187/v1/status;
    proxy_set_header Authorization $http_authorization;
    proxy_connect_timeout 3s;
    proxy_read_timeout 5s;
}
```

## iPhone

在 Scriptable 运行 VPS-Monitor，添加名称、HTTPS接口、令牌。令牌保存在 Keychain，服务器列表与上次数据保存在本机 Library。不上传 SSH 私钥，不导出令牌。

一份脚本只显示一台服务器；多个VPS复制并重命名脚本，分别配置。组件无法按秒刷新；请求最多等待7秒（并发），失败使用本地缓存并标记过期。采集时间超过60秒也标记过期。运行脚本预览会主动查询，桌面刷新由iOS调度。

## 停用与回滚

服务器执行 `sudo systemctl disable --now vps-monitor` 停用。移除 Nginx 中新增的精确 location，检查后重载。回滚时只移除新增路由，避免覆盖其他后续配置。

## 验证边界

韩国实例已做接口检查；iPhone布局、Keychain及刷新未真机确认。美国、巴西尚待连接信息，不宣称已经部署。
