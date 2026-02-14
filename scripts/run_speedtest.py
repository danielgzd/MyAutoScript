#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import csv
import json
import shutil
import tarfile
import zipfile
import urllib.request
import subprocess
from pathlib import Path

RELEASE_URL_LINUX_AMD64_TGZ = (
    "https://github.com/XIU2/CloudflareSpeedTest/releases/download/v2.3.4/"
    "cfst_linux_amd64.tar.gz"
)

# ip.txt 的官方原始地址（master 分支）
IP_TXT_URL = "https://raw.githubusercontent.com/XIU2/CloudflareSpeedTest/master/ip.txt"  # :contentReference[oaicite:1]{index=1}

def download(url: str, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "MyAutoScript/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as f:
        shutil.copyfileobj(r, f)

def extract_archive(archive: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    name = archive.name.lower()

    if name.endswith(".tar.gz") or name.endswith(".tgz"):
        with tarfile.open(archive, "r:gz") as t:
            t.extractall(out_dir)
        return

    if name.endswith(".zip"):
        with zipfile.ZipFile(archive, "r") as z:
            z.extractall(out_dir)
        return

    raise RuntimeError(f"Unsupported archive format: {archive}")

def find_cfst(bin_dir: Path) -> Path:
    for c in (bin_dir / "cfst", bin_dir / "CloudflareST", bin_dir / "cloudflareST"):
        if c.exists():
            return c
    for p in bin_dir.rglob("*"):
        if p.is_file() and p.name in ("cfst", "CloudflareST"):
            return p
    raise RuntimeError("cfst binary not found after extraction")

def run_cmd(cmd: list[str], cwd: Path | None = None) -> None:
    print(">>", " ".join(cmd))
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)

def parse_top_ips(csv_path: Path, top_n: int) -> list[str]:
    ips: list[str] = []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header is None:
            return []
        for row in reader:
            if not row:
                continue
            ip = row[0].strip()
            if ip:
                ips.append(ip)
            # 只有 top_n > 0 才限制数量
            if top_n > 0 and len(ips) >= top_n:
                break
    return ips

def main() -> int:
    repo_root = Path(os.getenv("GITHUB_WORKSPACE", Path.cwd())).resolve()

    top_n = int(os.getenv("TOP_N", "100"))
    cfst_args = os.getenv("CFST_ARGS", "-n 200 -t 4 -dn 100 -dt 8 -p 0 -o result.csv").strip()

    # ✅ 确保 ip.txt 存在（cfst 默认读取 ip.txt）
    ip_txt = repo_root / "ip.txt"
    if not ip_txt.exists():
        print(f"ip.txt not found, downloading from: {IP_TXT_URL}")
        download(IP_TXT_URL, ip_txt)

    work_dir = repo_root / ".tmp_cfst"
    work_dir.mkdir(parents=True, exist_ok=True)

    archive = work_dir / "cfst_linux_amd64.tar.gz"
    bin_dir = work_dir / "bin"

    if not archive.exists():
        print(f"Downloading cfst from {RELEASE_URL_LINUX_AMD64_TGZ}")
        download(RELEASE_URL_LINUX_AMD64_TGZ, archive)

    if bin_dir.exists():
        shutil.rmtree(bin_dir)
    extract_archive(archive, bin_dir)

    cfst_bin = find_cfst(bin_dir)
    cfst_bin.chmod(0o755)

    # 在 repo_root 下跑，确保 result.csv 输出到仓库根目录
    cmd = [str(cfst_bin)] + cfst_args.split()
    run_cmd(cmd, cwd=repo_root)

    csv_path = repo_root / "result.csv"
    if not csv_path.exists():
        print("ERROR: result.csv not found. Check CFST_ARGS.")
        return 2

    ips = parse_top_ips(csv_path, top_n)
    best_path = repo_root / "best_ip.txt"
    best_path.write_text("\n".join(ips) + ("\n" if ips else ""), encoding="utf-8")

    print("Done:", json.dumps({
        "top_n": top_n,
        "cfst_args": cfst_args,
        "count": len(ips),
        "best_ip_txt": str(best_path),
        "result_csv": str(csv_path),
        "ip_txt": str(ip_txt),
    }, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
