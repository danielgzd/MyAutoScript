# 自动签到 Python 环境缓存

工作流：`.github/workflows/sign.yml`。

使用 GitHub Ubuntu 运行器已经预装的 `python3`，不再通过 setup-python 每次下载指定的 Python 3.10。当前启用的贴吧脚本使用 requests 和 Python 标准库。

缓存保存的是完整虚拟环境，路径为 runner 临时目录中的 `myautoscript-venv`，其中没有签到凭证或业务运行数据。

缓存标识包含 Python 的完整版本和解释器路径、系统发行信息、运行器镜像版本、架构、虚拟环境路径，以及 requirements.txt 内容哈希。标识完全相同且缓存存在时，直接还原并使用环境，跳过 pip install；任何一项变化时创建新环境并安装依赖。每次都执行 pip check 和 requests 导入检查，但不在命中缓存时联网安装依赖。

安装并验证成功后立即保存缓存，不必等待签到或 README 提交成功。原有失败重试和 Bark 告警仍然有效。

GitHub 托管 runner 是临时机器，因此保存位置是 Actions 缓存服务，不是固定硬盘。缓存有保留和容量限制，被淘汰后下一次会自动重建。不同镜像版本会各自建立缓存。

requirements.txt 当前是未固定版本的 requests：同一缓存会保持首次安装得到的版本，不会每天查询或升级 PyPI 最新版本。需要升级时修改 requirements.txt（推荐指定版本），或者删除 Actions 中对应缓存。

手动运行 Auto Sign Tasks 时可勾选 `environment_only`，只验证环境及缓存，跳过签到、Bark 业务通知和 README 更新。连续执行两次可检查首次安装和第二次命中跳过安装是否符合预期。
