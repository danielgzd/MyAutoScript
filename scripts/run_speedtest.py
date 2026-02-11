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
    # 解压后通常就是 bin_dir/cfst
    candidates = [
        bin_dir / "cfst",
        bin_dir / "CloudflareST",
        bin_dir / "cloudflareST",
    ]
    for c in candidates:
        if c.exists():
            return c

    # 兜底：在目录里搜索可执行文件
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
        header = next(reader, None)  # 跳过表头
        if header is None:
            return []
        for row in reader:
            if not row:
                continue
            ip = row[0].strip()
            if ip:
                ips.append(ip)
            if len(ips) >= top_n:
                break
    return ips

def main() -> int:
    repo_root = Path(os.getenv("GITHUB_WORKSPACE", Path.cwd())).resolve()

    top_n = int(os.getenv("TOP_N", "100"))
    # 允许你从 workflow 里传额外参数，例如："-n 200 -t 4 -dn 100 -dt 8 -p 0 -o result.csv"
    cfst_args = os.getenv("CFST_ARGS", "-n 200 -t 4 -dn 100 -dt 8 -p 0 -o result.csv").strip()

    work_dir = repo_root / ".tmp_cfst"
    work_dir.mkdir(parents=True, exist_ok=True)

    archive = work_dir / "cfst_linux_amd64.tar.gz"
    bin_dir = work_dir / "bin"

    if not archive.exists():
        print(f"Downloading cfst from {RELEASE_URL_LINUX_AMD64_TGZ}")
        download(RELEASE_URL_LINUX_AMD64_TGZ, archive)
    else:
        print("cfst archive already exists, skip download")

    # 每次都重新解压，避免旧文件影响
    if bin_dir.exists():
        shutil.rmtree(bin_dir)
    extract_archive(archive, bin_dir)

    cfst_bin = find_cfst(bin_dir)
    cfst_bin.chmod(0o755)

    # 运行 cfst
    # 注意：cfst 输出文件路径是相对于 cwd 的，所以我们在 repo_root 下跑，直接生成到仓库根目录
    cmd = [str(cfst_bin)] + cfst_args.split()
    run_cmd(cmd, cwd=repo_root)

    csv_path = repo_root / "result.csv"
    if not csv_path.exists():
        print("ERROR: result.csv not found. Check CFST_ARGS.")
        return 2

    ips = parse_top_ips(csv_path, top_n)
    if not ips:
        print("WARN: no IPs parsed from result.csv")
    best_path = repo_root / "best_ip.txt"
    best_path.write_text("\n".join(ips) + ("\n" if ips else ""), encoding="utf-8")

    meta = {
        "top_n": top_n,
        "cfst_args": cfst_args,
        "result_csv": str(csv_path),
        "best_ip_txt": str(best_path),
        "count": len(ips),
    }
    print("Done:", json.dumps(meta, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
