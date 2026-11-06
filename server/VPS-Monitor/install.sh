#!/bin/sh
# Run on Linux as root. Existing installations are not overwritten.
set -eu
[ "$(id -u)" = 0 ] || { echo '请使用 sudo 运行'; exit 1; }
command -v python3 >/dev/null
command -v systemctl >/dev/null
[ ! -e /opt/vps-monitor ] && [ ! -e /etc/vps-monitor ] || { echo '已有安装，停止以免覆盖'; exit 1; }
SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -d -m 755 /opt/vps-monitor
install -d -m 700 /etc/vps-monitor
install -m 644 "$SOURCE/agent.py" /opt/vps-monitor/agent.py
python3 -c 'import secrets; print(secrets.token_hex(32))' > /etc/vps-monitor/token
chmod 600 /etc/vps-monitor/token
cat > /etc/systemd/system/vps-monitor.service <<'EOF'
[Unit]
Description=VPS read-only monitor
After=network.target
[Service]
ExecStart=/usr/bin/python3 /opt/vps-monitor/agent.py
Environment=VPS_MONITOR_TOKEN_FILE=/etc/vps-monitor/token
Restart=on-failure
DynamicUser=yes
LoadCredential=token:/etc/vps-monitor/token
Environment=VPS_MONITOR_TOKEN_FILE=%d/token
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now vps-monitor
echo '采集服务已安装，仅监听 127.0.0.1:9187。请配置 HTTPS 反向代理后使用。令牌在 /etc/vps-monitor/token。'
