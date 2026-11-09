import os
import json
from pathlib import Path
from datetime import datetime, timezone
import logging
import requests
import hashlib
import time
from dataclasses import dataclass
from typing import List

# --- Bark 配置 ---
# 🚨 替换为您自己的 Bark Token，确保 URL 以 Token 结尾并带斜杠 /
BARK_URL = os.getenv("BARK_URL_TIEBA_QIANDAO")
# --- Bark 配置结束 ---


logging.basicConfig(
    level=logging.INFO, format="[%(levelname)s] %(asctime)s: %(message)s"
)

@dataclass
class ForumInfo:
    forum_id: int
    forum_name: str


class Tieba:
    bduss: str
    logger: logging.Logger

    def __init__(self, bduss: str) -> None:
        """bduss: 贴吧 cookie"""
        self.bduss = bduss
        self.already_signed = 0
        self.logger = logging.getLogger(__name__)

    @property
    def session(self) -> requests.Session:
        if not getattr(self, "_session", None):
            self._session = requests.Session()

        return self._session

    @property
    def tbs(self) -> str:
        if getattr(self, "_tbs", None):
            return self._tbs

        resp = self.session.get(
            url="http://tieba.baidu.com/dc/common/tbs",
            headers={
                "Cookie": f"BDUSS={self.bduss}",
                "Host": "tieba.baidu.com",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36",
                "Referer": "https://tieba.baidu.com/",
            },
        )
        if resp.status_code != 200:
            self.logger.error("get_tbs error: %s", resp.text)
            return ""

        self._tbs = resp.json()["tbs"]
        return self._tbs

    @classmethod
    def signature(cls, data) -> str:
        val = "".join(f"{k}={data[k]}" for k in sorted(data))
        return hashlib.md5((val + "tiebaclient!!!").encode()).hexdigest().upper()

    def get_likes(self, page_no: int, retry_times: int = 0):
        data = {
            "BDUSS": self.bduss,
            "_client_type": "2",
            "_client_id": "wappc_1534235498291_488",
            "_client_version": "9.7.8.0",
            "_phone_imei": "000000000000000",
            "from": "1008621y",
            "page_no": str(page_no),
            "page_size": "200",
            "model": "MI+5",
            "net_type": "1",
            "timestamp": str(int(time.time())),
            "vcode_tag": "11",
        }
        sign = self.signature(data)
        data["sign"] = sign
        resp = self.session.post(
            "http://c.tieba.baidu.com/c/f/forum/like",
            data=data,
        )
        if resp.status_code != 200:
            self.logger.error("获取关注的贴吧错误: %s", resp.text)
            if retry_times < 3:
                return self.get_likes(page_no, retry_times + 1)
            return []
        resp_json = resp.json()
        has_next = resp_json.get("has_more") == "1"
        forum_list = []
        forum_list += resp_json.get("forum_list", {}).get("non-gconforum", [])
        forum_list += resp_json.get("forum_list", {}).get("gconforum", [])
        if has_next:
            forum_list += self.get_likes(page_no + 1)
        return forum_list

    def sign(self, fid: str, name: str) -> bool:
        """签到"""
        data = {
            "_client_type": "2",
            "_client_id": "wappc_1534235498291_488",
            "_client_version": "9.7.8.0",
            "_phone_imei": "000000000000000",
            "model": "MI+5",
            "net_type": "1",
            "timestamp": str(int(time.time())),
            "vcode_tag": "11",
            "BDUSS": self.bduss,
            "fid": fid,
            "kw": name,
            "tbs": self.tbs,
        }
        sig = self.signature(data)
        data["sign"] = sig
        resp = self.session.post("http://c.tieba.baidu.com/c/c/forum/sign", data=data)
        if resp.status_code != 200:
            self.logger.error(f"[{name}] 签到失败: {resp.text}")
            return False

        error_code = int(resp.json().get("error_code") or 0)
        error_msg = resp.json().get("error_msg", "")
        if error_code != 0:
            if "已经签过" in error_msg:
                self.already_signed += 1
                self.logger.info(f"[{name}] 今日已签到")
                return True
            self.logger.error(f"[{name}] 签到失败: {error_msg}")
            return False

        self.logger.info(f"[{name}] 签到成功")
        return True

    def like(self, fid: int, fname: str):
        data = {
            "fid": fid,
            "kw": fname,
            "tbs": self.tbs,
            "BDUSS": self.bduss
        }
        sig = self.signature(data)
        data["sign"] = sig
        resp = self.session.post("http://c.tieba.baidu.com/c/c/forum/like", data=data)

        if resp.json().get("error", {}).get("errno") != 0:
            msg = resp.json().get("error", {}).get("errmsg", "")
            self.logger.error(f"[{fname}] 关注失败：{msg}")
            return False
        self.logger.info(f"[{fname}] 关注成功")
        return True

    def get_hot_forums(self, page: int = 0, size: int = 100) -> List[ForumInfo]:
        """最近热门的吧列表"""
        resp = self.session.get("https://tieba.baidu.com/f/index/rcmdForum",
            params=dict(pn=page, rn=size))
        if resp.status_code != 200:
            self.logger.error(f"获取热门吧失败: {resp.text}")
            return []

        res = []
        for info in resp.json().get("data", {}).get("forum_info", []):
            res.append(ForumInfo(
                forum_id=info.get("forum_id") or 0,
                forum_name=info.get("forum_name") or "",
            ))
        return res


class Task:
    name: str
    logger = logging.getLogger(__name__)

    def run(self):
        self.logger.info(f"[{self.name}] 执行完成")


class SignForums(Task):
    name: str = "签到关注的贴吧"

    def __init__(self, cli: Tieba) -> None:
        self.cli = cli

    # 🚀 修改 run 方法，返回 (成功数, 失败数)
    def run(self) -> tuple[int, int]:
        forums = self.cli.get_likes(1)
        n_succeed, n_faild = 0, 0
        for forum in forums:
            try:
                succeed = self.cli.sign(forum["id"], forum["name"])
                if succeed:
                    n_succeed += 1
                else:
                    n_faild += 1
            except Exception as e:
                self.logger.error(f"签到失败: {str(e)}")
                n_faild += 1 # 捕获异常也计入失败

        # 🎯 保持原有日志输出格式，但返回结果
        msg = f"贴吧签到结束\n\n签到成功 {n_succeed} 个\n签到异常 {n_faild} 个"
        self.logger.info(msg)

        super().run()
        # 返回签到结果
        return n_succeed, n_faild


class LikeHotForums(Task):
    name: str = "关注最近热门的吧"

    def __init__(self, cli: Tieba) -> None:
        self.cli = cli

    def run(self):
        forums = self.cli.get_hot_forums(8, 20)
        n_succeed = 0
        for forum in forums[::-1]:
            try:
                n_succeed += self.cli.like(forum.forum_id, forum.forum_name)
            except Exception as e:
                self.logger.error(f"[{self.name}] 关注贴吧异常：{str(e)}")
        
        self.logger.info(f"成功关注 {n_succeed} 个贴吧")

        return super().run()


# 🚀 新增 Bark 推送函数
def push_bark(title: str, body: str):
    """
    使用 requests 库推送通知。
    因为只要求失败个数，所以使用最简单的 URL 推送格式。
    """
    # 构造 Bark URL：https://api.day.app/token/title/body
    url = f"{BARK_URL}{requests.utils.quote(title)}/{requests.utils.quote(body)}"
    
    try:
        resp = requests.get(url)
        if resp.status_code == 200 and resp.json().get("code") == 200:
            logging.info("Bark 推送成功")
        else:
            logging.error(f"Bark 推送失败: {resp.text}")
    except Exception as e:
        logging.error(f"Bark 推送请求异常: {str(e)}")


if __name__ == "__main__":
    # 🚨 请将这里的 "BDUSS" 字符串替换为您自己的有效 BDUSS
    BDUSS = os.getenv("BDUSS_TIEBA_QIANDAO")
    cli = Tieba(BDUSS)
    
    # 运行签到任务，并接收返回的成功数和失败数
    sign_task = SignForums(cli=cli)
    n_succeed, n_faild = sign_task.run() # 🚀 SignForums.run 现在返回结果
    
    result_path = os.getenv("SIGN_RESULT_PATH")
    if result_path:
        result = {
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "success": n_succeed - cli.already_signed,
            "already_signed": cli.already_signed,
            "failed": n_faild,
            "total": n_succeed + n_faild,
        }
        Path(result_path).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")

    # 运行其他任务 (可选，根据你的需求)
    # LikeHotForums(cli=cli).run() 

    # --- Bark 推送逻辑 ---
    # 🎯 构造标题和内容
    push_title = f"百度贴吧签到完成，失败 {n_faild} 个"
    push_body = f"成功/已签到：{n_succeed} 个\n总计任务：{n_succeed + n_faild} 个"

    # 🎯 只有至少有一次签到尝试才推送
    if n_succeed > 0 or n_faild > 0:
        push_bark(push_title, push_body)
    else:
        logging.info("未找到关注的贴吧，跳过推送。")
