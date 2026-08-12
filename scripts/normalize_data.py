"""
scripts/normalize_data.py — 数据标准化快捷脚本

等价于依次运行 fetch_data.py -> build_data.py -> validate_data.py
用于 CI / GitHub Actions 中一键执行全流程。
"""

import subprocess
import sys
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))


def run_script(name: str) -> int:
    path = os.path.join(SCRIPTS_DIR, name)
    print(f"\n>>> 运行: {name}")
    result = subprocess.run([sys.executable, path], capture_output=False)
    return result.returncode


def main():
    print("=" * 60)
    print("长期投资实验室 — 数据标准化全流程")
    print("=" * 60)

    steps = [
        ("采集数据", "fetch_data.py"),
        ("构建数据", "build_data.py"),
        ("验证数据", "validate_data.py"),
    ]

    failed = []
    for label, script in steps:
        rc = run_script(script)
        if rc != 0:
            failed.append(label)
            print(f"  [{label}] 退出码: {rc}（继续执行后续步骤）")

    if failed:
        print(f"\n警告: 以下步骤异常: {', '.join(failed)}")
        return 1

    print("\n全流程完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
