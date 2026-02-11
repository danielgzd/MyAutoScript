#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import csv
import os
import platform
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from urllib.request import urlopen

LATEST_RELEASE_BASE = "https://github.com/XIU2/CloudflareSpeedTest/releases/latest/download"


def get_cfst_tar_url() -> str:
    # Allow override for custom mirrors or local paths via CFST_URL
    override = os.getenv("CFST_URL")
    if override:
        return override

    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "linux":
        if machine in ("x86_64", "amd64"):
            return f"{LATEST_RELEASE_BASE}/cfst_linux_amd64.tar.gz"
        if machine in ("aarch64", "arm64"):
            return f"{LATEST_RELEASE_BASE}/cfst_linux_arm64.tar.gz"
    elif system == "darwin":
        if machine in ("x86_64", "amd64"):
            return f"{LATEST_RELEASE_BASE}/cfst_darwin_amd64.tar.gz"
        if machine in ("arm64", "aarch64"):
            return f"{LATEST_RELEASE_BASE}/cfst_darwin_arm64.tar.gz"

    raise RuntimeError(f"Unsupported platform: system={system} machine={machine}. Set CFST_URL to override.")


def download_file(url: str, dst: Path) -> None:
    with urlopen(url, timeout=60) as r:  # nosec
        dst.write_bytes(r.read())


def extract_cfst(tar_path: Path, out_dir: Path) -> Path:
    with tarfile.open(tar_path, "r:gz") as tf:
        tf.extractall(out_dir)  # GitHub release 自己的包，风险可接受
    # 常见文件名：cfst / CloudflareST
    for name in ("cfst", "CloudflareST"):
        p = out_dir / name
        if p.exists():
            p.chmod(0o755)
            return p
    # 兜底：找一个可执行文件
    for p in out_dir.iterdir():
        if p.is_file():
            p.chmod(0o755)
            return p
    raise FileNotFoundError("未在压缩包里找到 cfst/CloudflareST 可执行文件")


def run_cfst(cfst_path: Path, workdir: Path, args: list[str]) -> None:
    # 在 workdir 内执行，保证相对路径（如 ip.txt）与输出文件都好管理
    subprocess.run([str(cfst_path), *args], cwd=str(workdir), check=True)


def parse_result_csv(csv_path: Path, top_n: int) -> list[str]:
    ips: list[str] = []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        for row in reader:
            if not row:
                continue
            ip = row[0].strip()
            if ip and ip.lower() != "ip 地址":
                ips.append(ip)
            if len(ips) >= top_n:
                break
    return ips


def write_best_ip_txt(out_path: Path, ips: list[str]) -> None:
    out_path.write_text("\n".join(ips) + ("\n" if ips else ""), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Daily CloudflareSpeedTest runner -> best_ip.txt")
    parser.add_argument("--top", type=int, default=int(os.getenv("TOP_N", "10")), help="输出前 N 个 IP（默认 10）")
    parser.add_argument("--output", default="best_ip.txt", help="输出 txt 文件名（默认 best_ip.txt）")

    # 透传给 cfst 的参数（可选）：例如 --cfst-args "-tll 40 -tl 150 -dn 10 -sl 5 -p 0"
    parser.add_argument(
        "--cfst-args",
        default=os.getenv("CFST_ARGS", "-p 0 -o result.csv"),
        help='cfst 参数字符串（默认 "-p 0 -o result.csv"）',
    )
    args = parser.parse_args()

    repo_dir = Path(__file__).resolve().parent
    out_txt = repo_dir / args.output

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        tar_path = td_path / "cfst_linux_amd64.tar.gz"

        tar_url = get_cfst_tar_url()
        print(f"Downloading: {tar_url}")
        download_file(tar_url, tar_path)

        cfst_dir = td_path / "cfst_bin"
        cfst_dir.mkdir(parents=True, exist_ok=True)
        cfst_path = extract_cfst(tar_path, cfst_dir)

        # 工作目录用仓库根目录：这样 result.csv / best_ip.txt 都直接生成在仓库里
        cfst_args_list = args.cfst_args.strip().split()
        if "-o" not in cfst_args_list and "--output" not in cfst_args_list:
            cfst_args_list += ["-o", "result.csv"]

        print(f"Running cfst: {cfst_path.name} {' '.join(cfst_args_list)}")
        run_cfst(cfst_path, repo_dir, cfst_args_list)

    result_csv = repo_dir / "result.csv"
    if not result_csv.exists():
        raise FileNotFoundError("未生成 result.csv（cfst 运行失败或参数不正确）")

    ips = parse_result_csv(result_csv, top_n=args.top)
    if not ips:
        print("result.csv 里没有解析到 IP，best_ip.txt 将为空。", file=sys.stderr)

    write_best_ip_txt(out_txt, ips)
    print(f"Wrote {out_txt} with {len(ips)} IP(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
