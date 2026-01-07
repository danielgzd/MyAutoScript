import os
import requests
import logging
import sys
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

BILI_COOKIE = os.getenv("BILI_COOKIE")
BARK_URL = os.getenv("BARK_URL_TIEBA_QIANDAO")

if not BILI_COOKIE:
    logging.error("❌ 未检测到 BILI_COOKIE")
    sys.exit(1)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.bilibili.com/",
    "Cookie": BILI_COOKIE,
}

def bark_push(title, body):
    if not BARK_URL:
        return
    try:
        requests.post(
            BARK_URL,
            json={"title": title, "body": body},
            timeout=10
        )
    except Exception as e:
        logging.error(f"Bark 推送失败: {e}")

# ================== B站每日经验签到 ==================

def bili_daily_sign():
    url = "https://api.bilibili.com/x/web-interface/nav"
    r = requests.get(url, headers=HEADERS, timeout=10)
    data = r.json()

    if data.get("code") != 0:
        raise RuntimeError("Cookie 已失效")

    uname = data["data"]["uname"]
    return f"B站登录正常，用户：{uname}"

# ================== 漫画签到 ==================

def bili_manga_sign():
    url = "https://manga.bilibili.com/twirp/activity.v1.Activity/ClockIn"
    r = requests.post(url, headers=HEADERS, timeout=10)
    data = r.json()

    if data.get("code") == 0:
        return "漫画签到成功"
    elif data.get("code") == 1:
        return "漫画今日已签到"
    else:
        return f"漫画签到失败：{data.get('msg')}"

# ================== 主流程 ==================

def main():
    logging.info("开始 B站签到")

    try:
        login_info = bili_daily_sign()
        manga_info = bili_manga_sign()

        result = f"{login_info}\n{manga_info}"
        logging.info(result)

        bark_push("B站签到成功", result)

    except Exception as e:
        logging.error(str(e))
        bark_push("B站签到失败", str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
