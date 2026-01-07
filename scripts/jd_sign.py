import os
import requests
import logging
import sys
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

JD_COOKIE = os.getenv("JD_COOKIE")
BARK_URL = os.getenv("BARK_URL_TIEBA_QIANDAO")

if not JD_COOKIE:
    logging.error("❌ 未检测到 JD_COOKIE")
    sys.exit(1)

HEADERS = {
    "User-Agent": "jdapp;iPhone;11.6.0;",
    "Cookie": JD_COOKIE,
    "Referer": "https://home.m.jd.com/",
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

def jd_sign():
    url = "https://api.m.jd.com/client.action"
    params = {
        "functionId": "signBean",
        "appid": "ld",
        "client": "apple",
        "clientVersion": "10.4.0",
        "body": "{}"
    }

    r = requests.post(url, headers=HEADERS, params=params, timeout=10)
    data = r.json()

    if data.get("code") != "0":
        raise RuntimeError(data.get("message", "签到失败"))

    sign_info = data.get("data", {})
    if sign_info.get("status") == "1":
        return f"京东签到成功，获得 {sign_info.get('reward', 0)} 京豆"
    else:
        return sign_info.get("message", "今日已签到")

def main():
    start = datetime.now()
    logging.info("开始京东签到")

    try:
        result = jd_sign()
        logging.info(result)

        bark_push(
            "京东签到成功",
            result
        )

    except Exception as e:
        logging.error(str(e))
        bark_push(
            "京东签到失败",
            str(e)
        )
        sys.exit(1)

if __name__ == "__main__":
    main()
