"""Publish measured Tieba results without pushing a stale checkout."""
import base64
from datetime import datetime
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

START = '<!-- sign-status:start -->'
END = '<!-- sign-status:end -->'


def render_readme(text, result, run_url):
    counts = [int(result[key]) for key in ('success', 'already_signed', 'failed', 'total')]
    if any(value < 0 for value in counts) or sum(counts[:3]) != counts[3]:
        raise ValueError('Invalid sign result counts')
    when = datetime.fromisoformat(result['completed_at']).astimezone(ZoneInfo('Asia/Shanghai'))
    success, already, failed, total = counts
    status = '全部完成' if failed == 0 else '部分异常，请查看日志'
    block = '\n'.join([
        START, '#### 🤖 最近运行信息',
        '- **运行脚本**: `auto-tieba-qiandao.py`',
        f'- **运行时间**: {when:%Y-%m-%d %H:%M:%S}（北京时间）',
        f'- **运行结果**: {status}',
        f'- **本次新签到**: {success} 个',
        f'- **今日已签到**: {already} 个',
        f'- **签到异常**: {failed} 个',
        f'- **总计**: {total} 个',
        f'- **运行记录**: [查看日志]({run_url})', END,
    ])
    if START in text and END in text:
        a, b = text.index(START), text.index(END) + len(END)
        return text[:a] + block + text[b:]
    legacy = re.compile(r'^#### 🤖 最近运行信息\n.*?(?=^#{1,6} |\Z)', re.M | re.S)
    if legacy.search(text):
        return legacy.sub(lambda _: block + '\n\n', text, count=1)
    return text.rstrip() + '\n\n' + block + '\n'


def publish(result, repository, branch, token, run_url):
    endpoint = f'https://api.github.com/repos/{repository}/contents/README.md'
    headers = {'Authorization': 'Bearer ' + token,
               'Accept': 'application/vnd.github+json',
               'X-GitHub-Api-Version': '2022-11-28'}
    for attempt in range(3):
        request = urllib.request.Request(endpoint + '?ref=' + urllib.parse.quote(branch, safe=''), headers=headers)
        with urllib.request.urlopen(request, timeout=30) as response:
            current = json.load(response)
        text = base64.b64decode(current['content']).decode('utf-8')
        updated = render_readme(text, result, run_url)
        if updated == text:
            print('README already contains this result')
            return
        payload = {'message': 'docs: update actual Tieba sign result', 'branch': branch,
                   'sha': current['sha'],
                   'content': base64.b64encode(updated.encode()).decode()}
        request = urllib.request.Request(endpoint, data=json.dumps(payload).encode(), headers=headers, method='PUT')
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                json.load(response)
            print('README sign result published')
            return
        except urllib.error.HTTPError as error:
            if error.code not in (409, 422) or attempt == 2:
                raise
            time.sleep(2)
    raise RuntimeError('Unable to publish README')


def main():
    # Missing data is an error; do not fabricate success from an empty variable.
    result = json.loads(Path(os.environ['SIGN_RESULT_PATH']).read_text(encoding='utf-8'))
    repository = os.environ['GITHUB_REPOSITORY']
    run_url = f'https://github.com/{repository}/actions/runs/{os.environ["GITHUB_RUN_ID"]}'
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    run_url += '/attempts/' + attempt
    publish(result, repository, os.environ.get('GITHUB_REF_NAME', 'main'), os.environ['GH_TOKEN'], run_url)


if __name__ == '__main__':
    main()
